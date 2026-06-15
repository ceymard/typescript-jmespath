#!/usr/bin/env -S node --expose-gc --import tsx
import { readFileSync, writeFileSync } from 'node:fs';
import { parseArgs } from 'node:util';
import jmespath from '../src/index';

interface TimingStats {
  iterations: number;
  totalMs: number;
  sd: number;
  rme: number;
  opsPerSec: number;
  samples: number;
}

interface MemoryStats {
  heapUsedPerOp: number;
  heapDeltaBytes: number;
  rssDeltaBytes: number;
  iterations: number;
}

interface BenchmarkEntry {
  timing: TimingStats;
  memory?: MemoryStats;
}

interface BenchReport {
  meta: {
    timestamp: string;
    nodeVersion: string;
    warmupIterations: number;
    timingIterations: number;
    timingSamples: number;
    gcEnabled: boolean;
    name: string;
  };
  benchmarks: Record<string, BenchmarkEntry>;
}

interface BenchmarkFn {
  name: string;
  fn: () => void;
}

const DEFAULT_WARMUP_ITERATIONS = 10_000;
const DEFAULT_TIMING_ITERATIONS = 1_000;
const TIMING_SAMPLES = 25;
const MEMORY_WARMUP = 10_000;
const MEMORY_ITERATIONS = 10_000;

function parseCli() {
  const { values } = parseArgs({
    options: {
      o: { type: 'string' },
      w: { type: 'string', default: String(DEFAULT_WARMUP_ITERATIONS) },
      t: { type: 'string', default: String(DEFAULT_TIMING_ITERATIONS) },
      c: { type: 'string' },
      compare: { type: 'string' },
      d: { type: 'string' },
    },
    allowPositionals: false,
  });

  const warmupIterations = Number(values.w);
  const timingIterations = Number(values.t);
  if (!Number.isFinite(warmupIterations) || warmupIterations < 0) {
    throw new Error(`Invalid warmup iterations: ${values.w}`);
  }
  if (!Number.isFinite(timingIterations) || timingIterations <= 0) {
    throw new Error(`Invalid timing iterations: ${values.t}`);
  }

  return {
    outputFile: values.o,
    warmupIterations,
    timingIterations,
    compareFile: values.c ?? values.compare,
    htmlFile: values.d,
  };
}

function getBenchmarkFns(): BenchmarkFn[] {
  const simpleData = { foo: { bar: 'baz' } };
  const arrayData = {
    items: Array.from({ length: 100 }, (_, i) => ({ id: i, name: `item${i}`, price: i * 10 })),
  };
  // const nestedData = { level1: { level2: { level3: { level4: { value: 42 } } } } };
  const nestedDataArray = Array.from({ length: 1000 }, (_, i) => ({ level1: { level2: { level3: { level4: { value: i } } } } }));
  const arrayDataLarge = {
    items: Array.from({ length: 1000 }, (_, i) => ({
      id: i,
      name: `item${i}`,
      price: i * 10,
      tags: [`tag${i}`, `category${i % 10}`],
    })),
  };
  const compiledExpr = jmespath.compile('items[?price > `500`].name');

  return [
    { name: 'Parser#single_expr', fn: () => jmespath.compile('foo') },
    { name: 'Parser#single_subexpr', fn: () => jmespath.compile('foo.bar') },
    {
      name: 'Parser#deeply_nested_50',
      fn: () =>
        jmespath.compile(
          'j49.j48.j47.j46.j45.j44.j43.j42.j41.j40.j39.j38.j37.j36.j35.j34.j33.j32.j31.j30.j29.j28.j27.j26.j25.j24.j23.j22.j21.j20.j19.j18.j17.j16.j15.j14.j13.j12.j11.j10.j9.j8.j7.j6.j5.j4.j3.j2.j1.j0',
        ),
    },
    {
      name: 'Parser#deeply_nested_50_index',
      fn: () =>
        jmespath.compile(
          '[49][48][47][46][45][44][43][42][41][40][39][38][37][36][35][34][33][32][31][30][29][28][27][26][25][24][23][22][21][20][19][18][17][16][15][14][13][12][11][10][9][8][7][6][5][4][3][2][1][0]',
        ),
    },
    { name: 'Parser#basic_list_projection', fn: () => jmespath.compile('foo[*].bar') },
    { name: 'Lexer#common_identifiers', fn: () => jmespath.compile('foo.bar.baz.qux.foo.bar.baz.qux') },
    { name: 'Lexer#mixed_tokens', fn: () => jmespath.compile('items[?price > `100`].name') },
    { name: 'Lexer#function_calls', fn: () => jmespath.compile('sort_by(items, &price).name') },
    { name: 'Eval#simple_field', fn: () => jmespath.search(simpleData, 'foo.bar') },
    { name: 'Eval#array_projection', fn: () => jmespath.search(arrayData, 'items[*].name') },
    { name: 'Eval#filter_projection', fn: () => jmespath.search(arrayData, 'items[?price > `500`].name') },
    { name: 'Eval#function_call', fn: () => jmespath.search(arrayData, 'length(items)') },
    { name: 'Eval#nested_access', fn: () => jmespath.search(nestedDataArray, '[*].level1.level2.level3.level4.value') },
    { name: 'Eval#slice_operation', fn: () => jmespath.search(arrayData, 'items[10:20]') },
    { name: 'Runtime#length_function', fn: () => jmespath.search(arrayData, 'length(items)') },
    { name: 'Runtime#max_function', fn: () => jmespath.search(arrayData, 'max(items[*].price)') },
    { name: 'Runtime#sort_by_function', fn: () => jmespath.search(arrayData, 'sort_by(items, &price)') },
    { name: 'Runtime#map_function', fn: () => jmespath.search(arrayData, 'map(&name, items)') },
    { name: 'Runtime#contains_function', fn: () => jmespath.search(arrayData, 'contains(items[*].name, `"item50"`)') },
    { name: 'Memory#simple_tokenization', fn: () => jmespath.tokenize('foo.bar') },
    {
      name: 'Memory#complex_tokenization',
      fn: () => jmespath.tokenize('items[?price > `500` && contains(tags, `"category1"`)].name'),
    },
    { name: 'Memory#full_pipeline_complex', fn: () => jmespath.search(arrayDataLarge, 'items[?price > `500`].name') },
    {
      name: 'Memory#precompiled_eval',
      fn: () => jmespath.TreeInterpreter.search(compiledExpr, arrayDataLarge),
    },
  ];
}

function computeSampleStats(values: number[]): {
  mean: number;
  sd: number;
  rme: number;
} {
  const n = values.length;
  if (n === 0) {
    return { mean: 0, sd: 0, rme: 0 };
  }

  const mean = values.reduce((sum, value) => sum + value, 0) / n;
  const variance = n > 1 ? values.reduce((sum, value) => sum + (value - mean) ** 2, 0) / (n - 1) : 0;
  const sd = Math.sqrt(variance);
  const sem = n > 0 ? sd / Math.sqrt(n) : 0;
  const rme = mean === 0 ? 0 : (sem / mean) * 100;

  return { mean, sd, rme };
}

function measureTiming(
  fn: () => void,
  warmupIterations: number,
  timingIterations: number,
  samples = TIMING_SAMPLES,
): TimingStats {
  for (let i = 0; i < warmupIterations; i++) {
    fn();
  }

  if (typeof global.gc === 'function') {
    global.gc();
    global.gc();
  }

  const totals: number[] = [];
  for (let sample = 0; sample < samples; sample++) {
    const start = process.hrtime.bigint();
    for (let i = 0; i < timingIterations; i++) {
      fn();
    }
    totals.push(Number(process.hrtime.bigint() - start) / 1_000_000);
  }

  const stats = computeSampleStats(totals);

  return {
    iterations: timingIterations,
    totalMs: stats.mean,
    sd: stats.sd,
    rme: stats.rme,
    opsPerSec: timingIterations / (stats.mean / 1000),
    samples,
  };
}

function measureMemory(fn: () => void, iterations = MEMORY_ITERATIONS): MemoryStats | undefined {
  if (typeof global.gc !== 'function') {
    return undefined;
  }

  // Warm up JIT and parser caches so measurement reflects steady-state work.
  for (let i = 0; i < MEMORY_WARMUP; i++) {
    fn();
  }

  global.gc();
  global.gc();

  const startMemory = process.memoryUsage();

  for (let i = 0; i < iterations; i++) {
    fn();
  }

  const endMemory = process.memoryUsage();

  const heapDeltaBytes = endMemory.heapUsed - startMemory.heapUsed;
  const rssDeltaBytes = endMemory.rss - startMemory.rss;
  const heapUsedPerOp = Math.max(0, heapDeltaBytes) / iterations;

  return {
    heapUsedPerOp,
    heapDeltaBytes: Math.max(0, heapDeltaBytes),
    rssDeltaBytes: Math.max(0, rssDeltaBytes),
    iterations,
  };
}

function runBenchmarks(warmupIterations: number, timingIterations: number): BenchReport {
  const benchmarkFns = getBenchmarkFns();
  const benchmarks: Record<string, BenchmarkEntry> = {};

  for (const { name, fn } of benchmarkFns) {
    if (typeof global.gc === 'function') {
      global.gc();
    }

    const timing = measureTiming(fn, warmupIterations, timingIterations);
    const memory = measureMemory(fn);

    benchmarks[name] = { timing, memory };
  }

  return {
    meta: {
      timestamp: new Date().toISOString(),
      nodeVersion: process.version,
      warmupIterations,
      timingIterations,
      timingSamples: TIMING_SAMPLES,
      gcEnabled: typeof global.gc === 'function',
      name: 'typescript-jmespath benchmarks',
    },
    benchmarks,
  };
}

function loadReport(path: string): BenchReport {
  const raw = readFileSync(path, 'utf8');
  return JSON.parse(raw) as BenchReport;
}

function formatNumber(value: number, digits = 2): string {
  return value.toFixed(digits);
}

function formatOps(value: number): string {
  if (value >= 1_000_000) {
    return `${(value / 1_000_000).toFixed(2)}M`;
  }
  if (value >= 1_000) {
    return `${(value / 1_000).toFixed(2)}K`;
  }
  return value.toFixed(0);
}

function formatIterations(iterations: number): string {
  if (iterations >= 1_000_000) {
    return `${(iterations / 1_000_000).toFixed(1)}M`;
  }
  if (iterations >= 1_000) {
    return `${(iterations / 1_000).toFixed(0)}k`;
  }
  return String(iterations);
}

function formatMemoryPerOp(memory: MemoryStats): string {
  if (memory.heapUsedPerOp < 0.01) {
    return '~0 B';
  }
  return `${memory.heapUsedPerOp.toFixed(2)} B`;
}

function formatBytes(value: number): string {
  const abs = Math.abs(value);
  if (abs >= 1024 * 1024) {
    return `${(value / 1024 / 1024).toFixed(2)} MB`;
  }
  if (abs >= 1024) {
    return `${(value / 1024).toFixed(2)} KB`;
  }
  return `${value.toFixed(0)} B`;
}

function printReport(report: BenchReport, label?: string) {
  if (label) {
    console.log(`\n=== ${label} ===`);
  }
  const iterLabel = formatIterations(report.meta.timingIterations);
  console.log(`Timestamp: ${report.meta.timestamp}`);
  console.log(`Node: ${report.meta.nodeVersion}`);
  console.log(
    `Warmup: ${report.meta.warmupIterations.toLocaleString()} iters | Timed: ${report.meta.timingIterations.toLocaleString()} iters x ${report.meta.timingSamples} samples | GC: ${report.meta.gcEnabled ? 'enabled' : 'disabled'}`,
  );
  console.log('');

  const rows = Object.entries(report.benchmarks).map(([name, entry]) => ({
    Benchmark: name,
    [`Time (${iterLabel})`]: `${formatNumber(entry.timing.totalMs, 2)} ms`,
    'Ops/s': formatOps(entry.timing.opsPerSec),
    SD: `${formatNumber(entry.timing.sd, 2)} ms`,
    '± RME': `${formatNumber(entry.timing.rme, 2)}%`,
    'Mem/op': entry.memory ? formatMemoryPerOp(entry.memory) : 'n/a',
    'Heap Δ': entry.memory ? formatBytes(entry.memory.heapDeltaBytes) : 'n/a',
  }));

  console.table(rows);

  if (!report.meta.gcEnabled) {
    console.log('Run with --expose-gc for memory measurements.');
  } else {
    console.log(
      `Memory: net heap growth over ${MEMORY_ITERATIONS.toLocaleString()} ops after warmup (short-lived allocations may report ~0 B).`,
    );
  }
}

function pctChange(oldValue: number, newValue: number): number {
  if (oldValue === 0) {
    return newValue === 0 ? 0 : Number.POSITIVE_INFINITY;
  }
  return ((newValue - oldValue) / oldValue) * 100;
}

function formatDelta(value: number): string {
  if (!Number.isFinite(value)) {
    return 'n/a';
  }
  const sign = value > 0 ? '+' : '';
  return `${sign}${value.toFixed(1)}%`;
}

function deltaClass(value: number, invert = false): 'neutral' | 'good' | 'good-strong' | 'bad' | 'bad-strong' {
  if (!Number.isFinite(value) || Math.abs(value) < 7) {
    return 'neutral';
  }
  const effective = invert ? -value : value;
  const abs = Math.abs(value);
  if (effective > 0) {
    return abs >= 30 ? 'good-strong' : 'good';
  }
  return abs >= 30 ? 'bad-strong' : 'bad';
}

function printComparison(oldReport: BenchReport, newReport: BenchReport) {
  printReport(oldReport, 'Previous run');
  printReport(newReport, 'Current run');

  console.log('\n=== Delta (current vs previous) ===');
  const names = [...new Set([...Object.keys(oldReport.benchmarks), ...Object.keys(newReport.benchmarks)])].sort();

  const rows = names.map((name) => {
    const oldEntry = oldReport.benchmarks[name];
    const newEntry = newReport.benchmarks[name];

    if (!oldEntry || !newEntry) {
      return {
        Benchmark: name,
        'Time Δ': oldEntry ? 'removed' : 'added',
        'Ops/s Δ': oldEntry ? 'removed' : 'added',
        'Mem/op Δ': oldEntry ? 'removed' : 'added',
      };
    }

    const timeDelta = pctChange(oldEntry.timing.totalMs, newEntry.timing.totalMs);
    const opsDelta = pctChange(oldEntry.timing.opsPerSec, newEntry.timing.opsPerSec);
    const memDelta =
      oldEntry.memory && newEntry.memory
        ? pctChange(oldEntry.memory.heapUsedPerOp, newEntry.memory.heapUsedPerOp)
        : Number.NaN;

    return {
      Benchmark: name,
      'Time Δ': formatDelta(timeDelta),
      'Ops/s Δ': formatDelta(opsDelta),
      'Mem/op Δ': Number.isFinite(memDelta) ? formatDelta(memDelta) : 'n/a',
    };
  });

  console.table(rows);
}

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

function renderMetricCell(
  oldValue: number | undefined,
  newValue: number | undefined,
  formatter: (value: number) => string,
  invert = false,
): string {
  if (oldValue === undefined || newValue === undefined) {
    return `<td>${newValue === undefined ? '-' : formatter(newValue)}</td>`;
  }

  const delta = pctChange(oldValue, newValue);
  const cls = deltaClass(delta, invert);
  const deltaText = Number.isFinite(delta) ? ` (${formatDelta(delta)})` : '';
  return `<td class="${cls}">${formatter(newValue)}${oldValue !== undefined ? `<span class="delta">${deltaText}</span>` : ''}</td>`;
}

function generateHtml(report: BenchReport, compareReport?: BenchReport): string {
  const names = Object.keys(report.benchmarks).sort();
  const title = compareReport ? 'Benchmark Comparison' : 'Benchmark Report';
  const iterLabel = formatIterations(report.meta.timingIterations);

  const rows = names
    .map((name) => {
      const entry = report.benchmarks[name];
      const oldEntry = compareReport?.benchmarks[name];

      return `<tr>
        <td class="name">${escapeHtml(name)}</td>
        ${renderMetricCell(oldEntry?.timing.totalMs, entry.timing.totalMs, (v) => `${v.toFixed(2)} ms`, true)}
        ${renderMetricCell(oldEntry?.timing.opsPerSec, entry.timing.opsPerSec, (v) => `${formatOps(v)}/s`)}
        ${renderMetricCell(oldEntry?.memory?.heapUsedPerOp, entry.memory?.heapUsedPerOp, (v) => `${v.toFixed(2)} B/op`, true)}
      </tr>`;
    })
    .join('\n');

  const compareMeta = compareReport
    ? `<p><strong>Compared against:</strong> ${escapeHtml(compareReport.meta.timestamp)} (${escapeHtml(compareReport.meta.nodeVersion)})</p>`
    : '';

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${title}</title>
  <style>
    :root {
      --bg: #0f1419;
      --panel: #1a2332;
      --text: #e7ecf3;
      --muted: #9aa7b8;
      --border: #2d3a4d;
      --good: #3ecf8e;
      --good-strong: #1faa62;
      --bad: #ff6b6b;
      --bad-strong: #e03131;
    }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      font-family: ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial, sans-serif;
      background: linear-gradient(180deg, #0b1016 0%, var(--bg) 100%);
      color: var(--text);
      line-height: 1.5;
      padding: 2rem;
    }
    .container { max-width: 1200px; margin: 0 auto; }
    h1 { margin: 0 0 0.5rem; font-size: 1.75rem; }
    .meta { color: var(--muted); margin-bottom: 1.5rem; }
    .panel {
      background: var(--panel);
      border: 1px solid var(--border);
      border-radius: 12px;
      overflow: hidden;
      box-shadow: 0 12px 40px rgba(0, 0, 0, 0.25);
    }
    table { width: 100%; border-collapse: collapse; }
    th, td { padding: 0.85rem 1rem; text-align: left; border-bottom: 1px solid var(--border); }
    th {
      background: rgba(255, 255, 255, 0.03);
      font-size: 0.8rem;
      text-transform: uppercase;
      letter-spacing: 0.04em;
      color: var(--muted);
    }
    tr:last-child td { border-bottom: none; }
    .name { font-weight: 600; white-space: nowrap; }
    .delta { display: block; font-size: 0.8rem; margin-top: 0.15rem; opacity: 0.9; }
    .good { color: var(--good); }
    .good-strong { color: var(--good-strong); font-weight: 700; }
    .bad { color: var(--bad); }
    .bad-strong { color: var(--bad-strong); font-weight: 700; }
    .legend {
      display: flex;
      gap: 1rem;
      flex-wrap: wrap;
      margin-top: 1rem;
      color: var(--muted);
      font-size: 0.9rem;
    }
    .legend span::before {
      content: '';
      display: inline-block;
      width: 0.75rem;
      height: 0.75rem;
      border-radius: 999px;
      margin-right: 0.4rem;
      vertical-align: middle;
    }
    .legend .good::before { background: var(--good); }
    .legend .good-strong::before { background: var(--good-strong); }
    .legend .bad::before { background: var(--bad); }
    .legend .bad-strong::before { background: var(--bad-strong); }
  </style>
</head>
<body>
  <div class="container">
    <h1>${title}</h1>
    <div class="meta">
      <p><strong>Generated:</strong> ${escapeHtml(report.meta.timestamp)}</p>
      <p><strong>Node:</strong> ${escapeHtml(report.meta.nodeVersion)}</p>
      <p><strong>Config:</strong> warmup ${report.meta.warmupIterations.toLocaleString()} iters, timed ${report.meta.timingIterations.toLocaleString()} iters x ${report.meta.timingSamples} samples, GC ${report.meta.gcEnabled ? 'on' : 'off'}</p>
      ${compareMeta}
    </div>
    <div class="panel">
      <table>
        <thead>
          <tr>
            <th>Benchmark</th>
            <th>Time (${iterLabel})</th>
            <th>Throughput</th>
            <th>Memory / op</th>
          </tr>
        </thead>
        <tbody>
          ${rows}
        </tbody>
      </table>
    </div>
    <div class="legend">
      <span class="good">Improvement</span>
      <span class="good-strong">Strong improvement (≥15%)</span>
      <span class="bad">Regression</span>
      <span class="bad-strong">Strong regression (≥15%)</span>
    </div>
  </div>
</body>
</html>`;
}

function main() {
  try {
    const options = parseCli();
    const report = runBenchmarks(options.warmupIterations, options.timingIterations);

    if (options.outputFile) {
      writeFileSync(options.outputFile, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
      console.log(`Wrote ${options.outputFile}`);
    }

    const compareReport = options.compareFile ? loadReport(options.compareFile) : undefined;

    if (options.htmlFile) {
      const html = generateHtml(report, compareReport);
      writeFileSync(options.htmlFile, html, 'utf8');
      console.log(`Wrote ${options.htmlFile}`);
    }

    if (compareReport) {
      printComparison(compareReport, report);
    } else {
      printReport(report);
    }
  } catch (error: unknown) {
    console.error(error);
    process.exit(1);
  }
}

main();
