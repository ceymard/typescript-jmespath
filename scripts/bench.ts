#!/usr/bin/env -S node --expose-gc
/**
 * Benchmark suite powered by tinybench (time-based, one isolated run per case).
 *
 * Usage:
 *   node scripts/bench.ts [module.esm.js] [-o report.json] [-c baseline.json]
 *   node scripts/bench.ts --filter '^Eval#infra_deep_field$'
 *   node scripts/bench.ts --filter '^Eval#' --no-memory
 *
 * Options:
 *   -t <ms>            Bench time per case (default: 1000)
 *   -w <ms>            Warmup time per case (default: 250)
 *   --filter <regexp>  Filter benchmark names (e.g. '^Eval#', 'infra_deep_field')
 *   --gc-between       Force GC after each case (off by default)
 *   --no-memory        Skip the separate memory pass
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { parseArgs } from 'node:util';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { Bench } from 'tinybench';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DEFAULT_MODULE_PATH = resolve(__dirname, '../dist/index.esm.js');

let jmespath: Awaited<typeof import('../src/index')>['default'];


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
    methodology?: 'tinybench-time-based';
    benchTimeMs?: number;
    warmupTimeMs?: number;
    warmupIterations?: number;
    fixedIterations?: number;
    gcEnabled: boolean;
    gcBetweenTasks: boolean;
    isolated: boolean;
    memoryEnabled: boolean;
    filter?: string;
    name: string;
  };
  benchmarks: Record<string, BenchmarkEntry>;
}

interface BenchmarkCase {
  name: string;
  fn: () => void;
}

const DEFAULT_BENCH_TIME_MS = 1000;
const DEFAULT_WARMUP_TIME_MS = 250;
const MEMORY_WARMUP = 500;
const MEMORY_ITERATIONS = 500;

function parseCli() {
  const { values, positionals } = parseArgs({
    options: {
      o: { type: 'string' },
      w: { type: 'string', default: String(DEFAULT_WARMUP_TIME_MS) },
      t: { type: 'string', default: String(DEFAULT_BENCH_TIME_MS) },
      c: { type: 'string' },
      compare: { type: 'string' },
      d: { type: 'string' },
      filter: { type: 'string' },
      'warmup-iterations': { type: 'string' },
      iterations: { type: 'string' },
      'gc-between': { type: 'boolean', default: false },
      'no-memory': { type: 'boolean', default: false },
    },
    allowPositionals: true,
  });

  const warmupTimeMs = Number(values.w);
  const benchTimeMs = Number(values.t);
  if (!Number.isFinite(warmupTimeMs) || warmupTimeMs < 0) {
    throw new Error(`Invalid warmup time (ms): ${values.w}`);
  }
  if (!Number.isFinite(benchTimeMs) || benchTimeMs <= 0) {
    throw new Error(`Invalid bench time (ms): ${values.t}`);
  }

  const warmupIterations = values['warmup-iterations'] ? Number(values['warmup-iterations']) : undefined;
  if (warmupIterations !== undefined && (!Number.isFinite(warmupIterations) || warmupIterations < 0)) {
    throw new Error(`Invalid warmup iterations: ${values['warmup-iterations']}`);
  }

  const fixedIterations = values.iterations ? Number(values.iterations) : undefined;
  if (fixedIterations !== undefined && (!Number.isFinite(fixedIterations) || fixedIterations <= 0)) {
    throw new Error(`Invalid iterations: ${values.iterations}`);
  }

  return {
    outputFile: values.o,
    benchTimeMs,
    warmupTimeMs,
    warmupIterations,
    fixedIterations,
    compareFile: values.c ?? values.compare,
    htmlFile: values.d,
    filter: values.filter,
    gcBetween: values['gc-between'] ?? false,
    memoryEnabled: !values['no-memory'],
    modulePath: positionals[0] ? resolve(positionals[0]) : DEFAULT_MODULE_PATH,
  };
}

async function loadJmespathModule(modulePath: string) {
  return (await import(pathToFileURL(modulePath).href)).default;
}

type CompiledExpr = ReturnType<Awaited<typeof import('../src/index')>['default']['compile']>;

interface Order {
  id: string;
  status: 'shipped' | 'pending' | 'cancelled';
  total: number;
  customer: { id: string; name: string; tier: 'premium' | 'standard' };
  items: Array<{ sku: string; qty: number; price: number }>;
  tags: string[];
  metadata: { source: 'web' | 'mobile'; retries: number };
}

interface LogEvent {
  timestamp: number;
  message: string;
  level: 'INFO' | 'WARN' | 'ERROR';
  dimensions: { service: string; region: string; host: string };
  details: { requestId: string; durationMs: number; nested: { trace: { span: number; parent: number } } };
}

interface Product {
  id: number;
  category: { id: number; name: string };
  variants: Array<{ sku: string; price: number; attributes: { color: string; size: string } }>;
  reviews: { count: number; avg: number };
}

function buildOrders(count: number): { orders: Order[] } {
  const statuses: Order['status'][] = ['shipped', 'pending', 'cancelled'];
  return {
    orders: Array.from({ length: count }, (_, i) => ({
      id: `ord-${i}`,
      status: statuses[i % statuses.length],
      total: 10 + ((i * 17) % 500),
      customer: {
        id: `cust-${i % 200}`,
        name: `Customer ${i % 200}`,
        tier: i % 5 === 0 ? 'premium' : 'standard',
      },
      items: Array.from({ length: 3 + (i % 4) }, (_, j) => ({
        sku: `SKU-${i}-${j}`,
        qty: 1 + j,
        price: 5 + ((i + j) * 3) % 80,
      })),
      tags: [`cat-${i % 8}`, `region-${i % 4}`],
      metadata: { source: i % 2 === 0 ? 'web' : 'mobile', retries: i % 3 },
    })),
  };
}

function buildLogEvents(count: number): { events: LogEvent[] } {
  const levels: LogEvent['level'][] = ['INFO', 'WARN', 'ERROR'];
  const services = ['api', 'worker', 'ingest', 'billing'];
  const regions = ['us-east-1', 'eu-west-1', 'ap-southeast-1'];
  return {
    events: Array.from({ length: count }, (_, i) => ({
      timestamp: 1_700_000_000 + i,
      message: `Processed request ${i} with status ${i % 7}`,
      level: levels[i % levels.length],
      dimensions: {
        service: services[i % services.length],
        region: regions[i % regions.length],
        host: `host-${i % 24}`,
      },
      details: {
        requestId: `req-${i}`,
        durationMs: 5 + (i % 120),
        nested: { trace: { span: i % 50, parent: i % 10 } },
      },
    })),
  };
}

function buildCatalog(count: number): { products: Product[] } {
  const colors = ['red', 'blue', 'green', 'black'];
  const sizes = ['S', 'M', 'L', 'XL'];
  return {
    products: Array.from({ length: count }, (_, i) => ({
      id: i,
      category: { id: i % 12, name: `Category ${i % 12}` },
      variants: Array.from({ length: 2 + (i % 3) }, (_, v) => ({
        sku: `P${i}-V${v}`,
        price: 9.99 + v + (i % 7),
        attributes: { color: colors[v % colors.length], size: sizes[i % sizes.length] },
      })),
      reviews: { count: i % 20, avg: 3 + (i % 3) * 0.5 },
    })),
  };
}

function buildInfraPayload() {
  return {
    resources: {
      clusters: Array.from({ length: 12 }, (_, c) => ({
        name: `cluster-${c}`,
        region: ['us-east-1', 'eu-west-1'][c % 2],
        nodes: Array.from({ length: 8 }, (_, n) => ({
          id: `node-${c}-${n}`,
          pods: Array.from({ length: 6 }, (_, p) => ({
            name: `pod-${c}-${n}-${p}`,
            labels: { app: `app-${p % 4}`, env: ['prod', 'staging'][c % 2] },
            status: { phase: ['Running', 'Pending', 'Failed'][p % 3], restarts: p % 3 },
          })),
        })),
      })),
    },
    meta: { version: 3, generatedAt: '2026-06-19T00:00:00Z' },
  };
}

function compile(expression: string): CompiledExpr {
  return jmespath.compile(expression);
}

function runCompiled(compiled: CompiledExpr, data: unknown): () => void {
  return () => {
    jmespath.TreeInterpreter.search(compiled, data as never);
  };
}

function getBenchmarkFns(): BenchmarkCase[] {
  const ordersSmall = buildOrders(100);
  const ordersLarge = buildOrders(1000);
  const logsLarge = buildLogEvents(1000);
  const catalog = buildCatalog(500);
  const infra = buildInfraPayload();

  const compiled = {
    fieldAccess: compile('orders[0].customer.name'),
    filterShipped: compile("orders[?status == 'shipped' && total > `100`].{id: id, customer: customer.name, total: total}"),
    filterWithContains: compile("orders[?contains(tags, 'cat-3') && metadata.retries < `2`].id"),
    lineItemsProjection: compile('orders[*].items[*].{sku: sku, lineTotal: price * qty}'),
    logErrors: compile("events[?level == 'ERROR' && details.durationMs > `50`].{service: dimensions.service, span: details.nested.trace.span}"),
    logServices: compile('events[*].dimensions.{service: service, region: region}'),
    logSlice: compile('events[10:100:2].message'),
    catalogTopRated: compile('products[?reviews.avg > `4`].variants[*].{sku: sku, price: price}'),
    catalogSorted: compile('sort_by(products, &reviews.avg)[0:10].{id: id, avg: reviews.avg}'),
    infraRunningPods: compile("resources.clusters[*].nodes[*].pods[?status.phase == 'Running'].name"),
    infraDeepField: compile('resources.clusters[0].nodes[0].pods[0].labels.app'),
    lengthOrders: compile('length(orders)'),
    maxShippedTotal: compile("max(orders[?status == 'shipped'].total)"),
    sortByTotal: compile('sort_by(orders, &total)[-1].id'),
    mapCustomerNames: compile('map(&customer.name, orders[0:20])'),
    pipeChain: compile("orders[?status == 'shipped'] | [0:5].{id: id, total: total}"),
    flattenProjection: compile('orders[*].items[*].sku'),
    andFilter: compile("orders[?status == 'pending' && customer.tier == 'premium' && total > `50`].id"),
    multiselectHash: compile('orders[0].{id: id, status: status, itemCount: length(items), topSku: items[0].sku}'),
    nestedNumeric: compile('resources.clusters[*].nodes[*].pods[*].status.restarts'),
    sliceItems: compile('orders[10:30]'),
    filterLarge: compile('orders[?total > `250` && contains(tags, `"region-2"`)].customer.name'),
    complexPipeline: compile(
      "orders[?status == 'shipped' && total > `100`] | sort_by(@, &total) | [-3:].{id: id, customer: customer.name, total: total}",
    ),
  };

  const pipelineExprs = {
    filterShipped: "orders[?status == 'shipped' && total > `100`].customer.name",
    complex: "orders[?status == 'shipped' && total > `100`] | sort_by(@, &total) | [-1].id",
    infraPods: "resources.clusters[*].nodes[*].pods[?status.phase == 'Running'].name",
  };

  return [
    // Parser: compile-only, representative expression shapes
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
    { name: 'Parser#basic_list_projection', fn: () => jmespath.compile('orders[*].customer.name') },
    { name: 'Parser#filter_multiselect', fn: () => jmespath.compile(pipelineExprs.filterShipped) },
    { name: 'Parser#pipe_sort', fn: () => jmespath.compile(pipelineExprs.complex) },
    { name: 'Parser#nested_wildcard_filter', fn: () => jmespath.compile(pipelineExprs.infraPods) },

    // Lexer: tokenize representative expressions without parsing/evaluating
    { name: 'Lexer#common_identifiers', fn: () => jmespath.tokenize('foo.bar.baz.qux.foo.bar.baz.qux') },
    {
      name: 'Lexer#mixed_tokens',
      fn: () => jmespath.tokenize("orders[?status == 'shipped' && total > `100`].customer.name"),
    },
    { name: 'Lexer#function_calls', fn: () => jmespath.tokenize('sort_by(orders, &total) | [-1].id') },
    {
      name: 'Lexer#complex_filter',
      fn: () =>
        jmespath.tokenize(
          "events[?level == 'ERROR' && details.durationMs > `50`].{service: dimensions.service, span: details.nested.trace.span}",
        ),
    },

    // Pipeline: full search() path (parse + eval) for a few real-world shapes
    { name: 'Pipeline#filter_shipped_orders', fn: () => jmespath.search(ordersLarge, pipelineExprs.filterShipped) },
    { name: 'Pipeline#pipe_sort_tail', fn: () => jmespath.search(ordersLarge, pipelineExprs.complex) },
    { name: 'Pipeline#infra_running_pods', fn: () => jmespath.search(infra, pipelineExprs.infraPods) },

    // Eval: precompiled expressions, TreeInterpreter.search only
    { name: 'Eval#field_access', fn: runCompiled(compiled.fieldAccess, ordersSmall) },
    { name: 'Eval#filter_projection', fn: runCompiled(compiled.filterShipped, ordersLarge) },
    { name: 'Eval#filter_with_contains', fn: runCompiled(compiled.filterWithContains, ordersLarge) },
    { name: 'Eval#double_projection', fn: runCompiled(compiled.lineItemsProjection, ordersLarge) },
    { name: 'Eval#multiselect_hash', fn: runCompiled(compiled.multiselectHash, ordersSmall) },
    { name: 'Eval#pipe_chain', fn: runCompiled(compiled.pipeChain, ordersLarge) },
    { name: 'Eval#flatten_projection', fn: runCompiled(compiled.flattenProjection, ordersLarge) },
    { name: 'Eval#and_filter', fn: runCompiled(compiled.andFilter, ordersLarge) },
    { name: 'Eval#slice', fn: runCompiled(compiled.sliceItems, ordersLarge) },
    { name: 'Eval#log_filter_projection', fn: runCompiled(compiled.logErrors, logsLarge) },
    { name: 'Eval#log_service_projection', fn: runCompiled(compiled.logServices, logsLarge) },
    { name: 'Eval#log_slice', fn: runCompiled(compiled.logSlice, logsLarge) },
    { name: 'Eval#catalog_filter_projection', fn: runCompiled(compiled.catalogTopRated, catalog) },
    { name: 'Eval#infra_nested_wildcard', fn: runCompiled(compiled.infraRunningPods, infra) },
    { name: 'Eval#infra_deep_field', fn: runCompiled(compiled.infraDeepField, infra) },
    { name: 'Eval#nested_numeric_projection', fn: runCompiled(compiled.nestedNumeric, infra) },

    // Runtime: precompiled builtin-heavy expressions on realistic payloads
    { name: 'Runtime#length', fn: runCompiled(compiled.lengthOrders, ordersLarge) },
    { name: 'Runtime#max', fn: runCompiled(compiled.maxShippedTotal, ordersLarge) },
    { name: 'Runtime#sort_by', fn: runCompiled(compiled.sortByTotal, ordersLarge) },
    { name: 'Runtime#map', fn: runCompiled(compiled.mapCustomerNames, ordersLarge) },
    { name: 'Runtime#sort_by_slice', fn: runCompiled(compiled.catalogSorted, catalog) },
    { name: 'Runtime#complex_pipe', fn: runCompiled(compiled.complexPipeline, ordersLarge) },

    // Memory: steady-state tokenization and precompiled eval on larger payloads
    { name: 'Memory#tokenize_simple', fn: () => jmespath.tokenize('orders[0].customer.name') },
    {
      name: 'Memory#tokenize_complex',
      fn: () =>
        jmespath.tokenize(
          "orders[?status == 'shipped' && total > `100` && contains(tags, 'cat-3')].customer.name",
        ),
    },
    { name: 'Memory#precompiled_filter_large', fn: runCompiled(compiled.filterLarge, ordersLarge) },
    { name: 'Memory#precompiled_multiselect', fn: runCompiled(compiled.multiselectHash, ordersLarge) },
    { name: 'Memory#precompiled_infra_wildcard', fn: runCompiled(compiled.infraRunningPods, infra) },
  ];
}

function compileFilter(pattern?: string): RegExp | undefined {
  if (!pattern) {
    return undefined;
  }
  try {
    return new RegExp(pattern);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`Invalid --filter regexp: ${pattern} (${message})`);
  }
}

function filterBenchmarks(cases: BenchmarkCase[], filter?: RegExp): BenchmarkCase[] {
  if (!filter) {
    return cases;
  }
  const filtered = cases.filter((c) => filter.test(c.name));
  if (filtered.length === 0) {
    throw new Error(`No benchmarks matched --filter /${filter.source}/${filter.flags}`);
  }
  return filtered;
}

function taskResultToTimingStats(task: { runs: number; result?: { period: number; latency: { sd: number; rme: number; samples: number[] }; throughput: { mean: number } } }): TimingStats {
  const result = task.result;
  if (!result) {
    throw new Error('Benchmark task finished without a result');
  }

  return {
    iterations: task.runs,
    totalMs: result.period,
    sd: result.latency.sd,
    rme: result.latency.rme,
    opsPerSec: result.throughput.mean,
    samples: result.latency.samples.length,
  };
}

interface RunOptions {
  benchTimeMs: number;
  warmupTimeMs: number;
  warmupIterations?: number;
  fixedIterations?: number;
  gcBetween: boolean;
  memoryEnabled: boolean;
  filter?: RegExp;
}

async function runSingleBenchmark(testCase: BenchmarkCase, options: RunOptions): Promise<TimingStats> {
  const bench = new Bench({
    name: testCase.name,
    time: options.benchTimeMs,
    warmup: true,
    warmupTime: options.warmupTimeMs,
    warmupIterations: options.warmupIterations,
    iterations: options.fixedIterations,
    teardown: (_task, mode) => {
      if (mode === 'run' && options.gcBetween && typeof global.gc === 'function') {
        global.gc();
      }
    },
  });

  bench.add(testCase.name, testCase.fn);
  await bench.run();

  const task = bench.tasks[0];
  if (!task) {
    throw new Error(`Benchmark task missing: ${testCase.name}`);
  }
  return taskResultToTimingStats(task);
}

async function runTimingPass(cases: BenchmarkCase[], options: RunOptions): Promise<Record<string, TimingStats>> {
  const timing: Record<string, TimingStats> = {};

  for (const testCase of cases) {
    timing[testCase.name] = await runSingleBenchmark(testCase, options);
    if (typeof global.gc === 'function') {
      global.gc();
    }
  }

  return timing;
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

function runMemoryPass(cases: BenchmarkCase[]): Record<string, MemoryStats> {
  const memory: Record<string, MemoryStats> = {};

  if (typeof global.gc !== 'function') {
    return memory;
  }

  for (const { name, fn } of cases) {
    const stats = measureMemory(fn);
    if (stats) {
      memory[name] = stats;
    }
    global.gc();
  }

  return memory;
}

async function runBenchmarks(options: RunOptions): Promise<BenchReport> {
  const cases = filterBenchmarks(getBenchmarkFns(), options.filter);
  const timing = await runTimingPass(cases, options);
  const memory = options.memoryEnabled ? runMemoryPass(cases) : {};

  const benchmarks: Record<string, BenchmarkEntry> = {};
  for (const { name } of cases) {
    benchmarks[name] = {
      timing: timing[name],
      memory: memory[name],
    };
  }

  return {
    meta: {
      timestamp: new Date().toISOString(),
      nodeVersion: process.version,
      methodology: 'tinybench-time-based',
      benchTimeMs: options.benchTimeMs,
      warmupTimeMs: options.warmupTimeMs,
      warmupIterations: options.warmupIterations,
      fixedIterations: options.fixedIterations,
      gcEnabled: typeof global.gc === 'function',
      gcBetweenTasks: options.gcBetween,
      isolated: true,
      memoryEnabled: options.memoryEnabled,
      filter: options.filter ? `/${options.filter.source}/${options.filter.flags}` : undefined,
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

function latencyColumnLabel(report: BenchReport): string {
  return report.meta.methodology === 'tinybench-time-based' ? 'Latency/op' : 'Time/batch';
}

function printReport(report: BenchReport, label?: string) {
  if (label) {
    console.log(`\n=== ${label} ===`);
  }
  console.log(`Timestamp: ${report.meta.timestamp}`);
  console.log(`Node: ${report.meta.nodeVersion}`);
  if (report.meta.methodology) {
    console.log(`Methodology: ${report.meta.methodology}`);
  } else {
    console.log('Methodology: legacy fixed-iteration (results are not directly comparable on latency)');
  }
  console.log(
    `Config: bench ${report.meta.benchTimeMs} ms | warmup ${report.meta.warmupTimeMs} ms | GC ${report.meta.gcEnabled ? 'enabled' : 'disabled'} | memory ${report.meta.memoryEnabled ? 'on' : 'off'} | isolated per case`,
  );
  if (report.meta.filter) {
    console.log(`Filter: ${report.meta.filter}`);
  }
  console.log('');

  const latencyLabel = latencyColumnLabel(report);
  const rows = Object.entries(report.benchmarks).map(([name, entry]) => ({
    Benchmark: name,
    [latencyLabel]: `${formatNumber(entry.timing.totalMs, 4)} ms`,
    'Ops/s': formatOps(entry.timing.opsPerSec),
    Runs: entry.timing.iterations?.toLocaleString?.() ?? String(entry.timing.iterations),
    SD: `${formatNumber(entry.timing.sd, 4)} ms`,
    '± RME': `${formatNumber(entry.timing.rme, 2)}%`,
    'Mem/op': entry.memory ? formatMemoryPerOp(entry.memory) : 'n/a',
    'Heap Δ': entry.memory ? formatBytes(entry.memory.heapDeltaBytes) : 'n/a',
  }));

  console.table(rows);

  if (!report.meta.gcEnabled) {
    console.log('Run with --expose-gc for memory measurements.');
  } else if (report.meta.memoryEnabled) {
    console.log(
      `Memory: separate pass, net heap growth over ${MEMORY_ITERATIONS.toLocaleString()} ops per case after warmup.`,
    );
  } else {
    console.log('Memory pass skipped (--no-memory).');
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

  if (oldReport.meta.methodology !== newReport.meta.methodology) {
    console.log(
      '\nNote: methodology differs between runs — compare primarily on Ops/s, not latency columns.',
    );
  }

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

  const rows = names
    .map((name) => {
      const entry = report.benchmarks[name];
      const oldEntry = compareReport?.benchmarks[name];

      return `<tr>
        <td class="name">${escapeHtml(name)}</td>
        ${renderMetricCell(oldEntry?.timing.totalMs, entry.timing.totalMs, (v) => `${v.toFixed(4)} ms`, true)}
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
      <p><strong>Config:</strong> ${escapeHtml(report.meta.methodology)}, bench ${report.meta.benchTimeMs} ms, warmup ${report.meta.warmupTimeMs} ms, GC ${report.meta.gcEnabled ? 'on' : 'off'}, memory ${report.meta.memoryEnabled ? 'on' : 'off'}, isolated per case</p>
      ${compareMeta}
    </div>
    <div class="panel">
      <table>
        <thead>
          <tr>
            <th>Benchmark</th>
            <th>Latency/op</th>
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

async function main() {
  try {
    const cli = parseCli();
    console.log(`Loading module: ${cli.modulePath}`);
    jmespath = await loadJmespathModule(cli.modulePath);

    const runOptions: RunOptions = {
      benchTimeMs: cli.benchTimeMs,
      warmupTimeMs: cli.warmupTimeMs,
      warmupIterations: cli.warmupIterations,
      fixedIterations: cli.fixedIterations,
      gcBetween: cli.gcBetween,
      memoryEnabled: cli.memoryEnabled,
      filter: compileFilter(cli.filter),
    };

    const report = await runBenchmarks(runOptions);

    if (cli.outputFile) {
      writeFileSync(cli.outputFile, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
      console.log(`Wrote ${cli.outputFile}`);
    }

    const compareReport = cli.compareFile ? loadReport(cli.compareFile) : undefined;

    if (cli.htmlFile) {
      const html = generateHtml(report, compareReport);
      writeFileSync(cli.htmlFile, html, 'utf8');
      console.log(`Wrote ${cli.htmlFile}`);
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
