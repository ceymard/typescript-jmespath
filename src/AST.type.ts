import { isIterable, type JSONObject, JSONValue } from './JSON.type';
import { Token } from './Lexer.type';
import { type Runtime } from './Runtime';
import {
  add,
  div,
  divide,
  ensureNumbers,
  isFalse,
  mod,
  mul,
  strictDeepEqual,
  sub,
} from './utils';

import { Scope } from './Scope';

type EvalResult = JSONValue | Ref;

export interface Node {
  eval(value: JSONValue, scope: Scope, runtime: Runtime): EvalResult;
}

export class FieldNode implements Node {

  constructor(public readonly name: string) {}

  get type() {
    return 'Field' as const;
  }

  eval(value: JSONValue, _scope: Scope, _runtime: Runtime): JSONValue {
    if (value === null || typeof value !== 'object' || Array.isArray(value)) {
      return null;
    }
    return (value as JSONObject)[this.name] ?? null;
  }
}

export class LiteralNode implements Node {

  constructor(public readonly value: JSONValue) {}

  get type() {
    return 'Literal' as const;
  }

  eval(_value: JSONValue, _scope: Scope, _runtime: Runtime): JSONValue {
    return this.value;
  }
}

export class IndexNode implements Node {

  constructor(public readonly value: number) {}

  get type() {
    return 'Index' as const;
  }

  eval(value: JSONValue, _scope: Scope, _runtime: Runtime): JSONValue {
    if (!isIterable(value)) {
      return null;
    }
    if (this.value < 0 && !Array.isArray(value)) {
      // No way around it...
      value = Array.from(value);
    }
    if (Array.isArray(value)) {
      const index = this.value < 0 ? value.length + this.value : this.value;
      return value[index] ?? null;
    }

    let index = 0;
    for (const item of value) {
      if (index === this.value) {
        return item;
      }
      index++;
    }
    return null;
  }
}

function sliceIndices(
  length: number,
  start: number | null,
  stop: number | null,
  step: number | null,
): [number, number, number] {
  let stride = step ?? 1;
  if (stride === 0) {
    const err = new Error('Invalid value: slice step cannot be 0');
    err.name = 'RuntimeError';
    throw err;
  }

  let lower = start;
  let upper = stop;

  if (lower === null) {
    lower = stride < 0 ? length - 1 : 0;
  } else {
    if (lower < 0) {
      lower += length;
    }
    if (lower < 0) {
      lower = stride < 0 ? -1 : 0;
    } else if (lower >= length) {
      lower = stride < 0 ? length - 1 : length;
    }
  }

  if (upper === null) {
    upper = stride < 0 ? -1 : length;
  } else {
    if (upper < 0) {
      upper += length;
    }
    if (upper < 0) {
      upper = stride < 0 ? -1 : 0;
    } else if (upper >= length) {
      upper = stride < 0 ? length - 1 : length;
    }
  }

  return [lower, upper, stride];
}

function sliceCollection<T>(collection: ArrayLike<T>, start: number, stop: number, step: number, runtime: Runtime): JSONValue[] {
  const result: JSONValue[] = [];
  if (step > 0) {
    for (let i = start; i < stop; i += step) {
      result.push(runtime.unwrapIterable(collection[i] as JSONValue));
    }
  } else {
    for (let i = start; i > stop; i += step) {
      result.push(runtime.unwrapIterable(collection[i] as JSONValue));
    }
  }
  return result;
}

export class SliceNode implements Node {

  constructor(
    public readonly start: number | null,
    public readonly stop: number | null,
    public readonly step: number | null,
  ) {}

  get type() {
    return 'Slice' as const;
  }

  eval(value: JSONValue, _scope: Scope, runtime: Runtime): JSONValue {
    if (!isIterable(value) && typeof value !== 'string') {
      return null;
    }

    if (isIterable(value) && !Array.isArray(value)
    ) {
      let start = this.start ?? 0;
      let step = this.step ?? 1;
      let stop = this.stop ?? Infinity;

      if (start < stop && step > 0) {
        return {
          [Symbol.iterator]: () => {
            let idx = 0
            let it = value[Symbol.iterator]();
            return {next: () => {
              for (;;) {
                let v = it.next();
                if (v.done || idx >= stop) {
                  return { done: true, value: undefined };
                }
                let i = idx
                idx++
                if (i > 0 && (step === 1 || (i - start) % step === 0)) {
                  return { done: false, value: runtime.unwrapIterable(v.value) };
                }
              }
            }}
          }
        }
      }
    }

    const isString = typeof value === 'string';
    const collection: ArrayLike<JSONValue> = isString
      ? value
      : Array.isArray(value)
        ? value
        : Array.from(value);

    const [start, stop, step] = sliceIndices(
      collection.length,
      this.start,
      this.stop,
      this.step,
    );
    const sliced = sliceCollection(collection, start, stop, step, runtime);

    return isString ? (sliced as string[]).join('') : sliced;
  }
}

export type ComparatorType = 'GT' | 'LT' | 'GTE' | 'LTE' | 'NE' | 'EQ';

export class ComparatorNode implements Node {

  constructor(
    public readonly name: ComparatorType,
    public readonly left: ExpressionNode,
    public readonly right: ExpressionNode,
  ) {}

  get type() {
    return 'Comparator' as const;
  }

  eval(value: JSONValue, scope: Scope, runtime: Runtime): JSONValue {
    const first = this.left.eval(value, scope, runtime);
    const second = this.right.eval(value, scope, runtime);

    switch (this.name) {
      case 'EQ':
        return strictDeepEqual(first, second);
      case 'NE':
        return !strictDeepEqual(first, second);
    }

    if (typeof first !== 'number' || typeof second !== 'number') {
      return null;
    }

    switch (this.name) {
      case 'GT':
        return first > second;
      case 'GTE':
        return first >= second;
      case 'LT':
        return first < second;
      case 'LTE':
        return first <= second;
    }
  }
}

export class KeyValuePairNode {

  constructor(
    public readonly name: string,
    public readonly value: ExpressionNode,
  ) {}

  get type() {
    return 'KeyValuePair' as const;
  }
}

export class MultiSelectHashNode implements Node {

  constructor(public readonly children: KeyValuePairNode[]) {}

  get type() {
    return 'MultiSelectHash' as const;
  }

  eval(value: JSONValue, scope: Scope, runtime: Runtime): JSONValue {
    const collected: Record<string, JSONValue> = {};
    for (const child of this.children) {
      collected[child.name] = runtime.unwrapIterable(child.value.eval(value, scope, runtime) as JSONValue);
    }
    return collected;
  }
}

export class MultiSelectListNode implements Node {

  constructor(public readonly children: ExpressionNode[]) {}

  get type() {
    return 'MultiSelectList' as const;
  }

  eval(value: JSONValue, scope: Scope, runtime: Runtime): JSONValue {
    const collected: JSONValue[] = [];
    for (const child of this.children) {
      collected.push(runtime.unwrapIterable(child.eval(value, scope, runtime) as JSONValue));
    }

    return collected;
  }
}

export class FunctionNode implements Node {

  constructor(
    public readonly name: string,
    public readonly children: ExpressionNode[],
  ) {}

  get type() {
    return 'Function' as const;
  }

  eval(value: JSONValue, scope: Scope, runtime: Runtime): JSONValue {
    const args: (JSONValue | Ref)[] = [];
    for (const child of this.children) {
      args.push(runtime.unwrapIterable(child.eval(value, scope, runtime)));
    }
    return runtime.callFunction(this.name, args);
  }
}

export class LetExpressionNode implements Node {

  constructor(
    public readonly bindings: BindingNode[],
    public readonly expression: ExpressionNode,
  ) {}

  get type() {
    return 'LetExpression' as const;
  }

  eval(value: JSONValue, scope: Scope, runtime: Runtime): JSONValue {
    let letScope = new Scope(scope);
    for (const binding of this.bindings) {
      const reference = binding.eval(value, scope, runtime) as JSONObject | Ref;
      letScope.setValue(binding.variable, reference);
    }
    return this.expression.eval(value, letScope, runtime) as JSONValue;
  }
}

export class BindingNode implements Node {

  constructor(
    public readonly variable: string,
    public readonly reference: ExpressionNode,
  ) {}

  get type() {
    return 'Binding' as const;
  }

  eval(value: JSONValue, scope: Scope, runtime: Runtime): JSONValue | Ref {
    const result = this.reference.eval(value, scope, runtime);
    return result
  }
}

export class VariableNode implements Node {

  constructor(public readonly name: string) {}

  get type() {
    return 'Variable' as const;
  }

  eval(_value: JSONValue, scope: Scope, _runtime: Runtime): JSONValue | Ref {
    const value = scope.get(this.name);
    if (value === undefined) {
      const err = new Error(`Error referencing undefined variable ${this.name}`);
      err.name = "undefined-variable";
      throw err;
    }
    return value[0] ?? null;
  }
}

export class TernaryNode implements Node {

  constructor(
    public readonly condition: ExpressionNode,
    public readonly trueExpr: ExpressionNode,
    public readonly falseExpr: ExpressionNode,
  ) {}

  get type() {
    return 'Ternary' as const;
  }

  eval(value: JSONValue, scope: Scope, runtime: Runtime): JSONValue {
    const condition = this.condition.eval(value, scope, runtime);
    if (!isFalse(condition)) {
      return this.trueExpr.eval(value, scope, runtime) as JSONValue;
    }
    return this.falseExpr.eval(value, scope, runtime) as JSONValue;
  }
}

export class IdentityNode implements Node {

  get type() {
    return 'Identity' as const;
  }

  eval(value: JSONValue, _scope: Scope, _runtime: Runtime): JSONValue {
    return value;
  }
}

export const IDENTITY = new IdentityNode();

export class CurrentNode implements Node {

  get type() {
    return Token.TOK_CURRENT;
  }

  eval(value: JSONValue, _scope: Scope, _runtime: Runtime): JSONValue {
    return value;
  }
}

export class RootNode implements Node {

  get type() {
    return Token.TOK_ROOT;
  }

  eval(_value: JSONValue, _scope: Scope, runtime: Runtime): JSONValue {
    return runtime._interpreter.rootValue;
  }
}

export class NotExpressionNode implements Node {

  constructor(public readonly child: ExpressionNode) {}

  get type() {
    return 'NotExpression' as const;
  }

  eval(value: JSONValue, scope: Scope, runtime: Runtime): JSONValue {
    return isFalse(this.child.eval(value, scope, runtime));
  }
}

export class FlattenNode implements Node {

  constructor(public readonly child: ExpressionNode) {}

  get type() {
    return 'Flatten' as const;
  }

  eval(value: JSONValue, scope: Scope, runtime: Runtime): JSONValue {
    const original = this.child.eval(value, scope, runtime);
    if (!isIterable(original)) {
      return null;
    }

    return {
      [Symbol.iterator]: () => {
        let it = original[Symbol.iterator]();
        let current: Iterator<JSONValue> | null = null;
        return {next: () => {
          for (;;) {
            if (current != null) {
              let v = current.next();
              if (v.done) {
                current = null;
                continue;
              }
              return { done: false, value: v.value };
            }

            let v = it.next();
            if (v.done) {
              return { done: true, value: undefined };
            }

            if (isIterable(v.value)) {
              current = v.value[Symbol.iterator]();
              continue;
            }
            return { done: false, value: v.value };
          }
        }}
      }
    };
  }
}

export type UnaryOperatorType = 'Plus' | 'Minus';

export class UnaryArithmeticNode implements Node {

  constructor(
    public readonly operator: UnaryOperatorType,
    public readonly operand: ExpressionNode,
  ) {}

  get type() {
    return 'Unary' as const;
  }

  eval(value: JSONValue, scope: Scope, runtime: Runtime): JSONValue {
    const operand = this.operand.eval(value, scope, runtime) as JSONValue;
    switch (this.operator) {
      case Token.TOK_PLUS:
        ensureNumbers(operand);
        return operand as number;

      case Token.TOK_MINUS:
        ensureNumbers(operand);
        return -(operand as number);

      default:
        throw new Error(`Syntax error: unknown arithmetic operator: ${this.operator}`);
    }
  }
}

export class ExpressionReferenceNode implements Node {

  constructor(public readonly child: ExpressionNode) {}

  get type() {
    return 'ExpressionReference' as const;
  }

  eval(_value: JSONValue, _scope: Scope, _runtime: Runtime): Ref {
    return new Ref(this.child, _scope);
  }
}

export class Ref {
  constructor(public readonly exp: ExpressionNode, public readonly scope: Scope) {}
}

export class IndexExpressionNode implements Node {

  constructor(
    public readonly left: ExpressionNode,
    public readonly right: ExpressionNode,
  ) {}

  get type() {
    return 'IndexExpression' as const;
  }

  eval(value: JSONValue, scope: Scope, runtime: Runtime): JSONValue {
    const leftValue = this.left.eval(value, scope, runtime) as JSONValue;
    return this.right.eval(leftValue, scope, runtime) as JSONValue;
  }
}

export class SubexpressionNode implements Node {

  constructor(
    public readonly left: ExpressionNode,
    public readonly right: ExpressionNode,
  ) {}

  get type() {
    return 'Subexpression' as const;
  }

  eval(value: JSONValue, scope: Scope, runtime: Runtime): JSONValue {
    const result = this.left.eval(value, scope, runtime);
    return result != null ? ((this.right.eval(result as JSONValue, scope, runtime) ?? null) as JSONValue) : null;
  }
}

export class ProjectionNode implements Node {

  constructor(
    public readonly left: ExpressionNode,
    public readonly right: ExpressionNode,
  ) {}

  get type() {
    return 'Projection' as const;
  }

  eval(value: JSONValue, scope: Scope, runtime: Runtime): JSONValue {
    let allowString = false;
    if (this.left instanceof IndexExpressionNode && this.left.right instanceof SliceNode) {
      allowString = true;
    }

    const base = this.left.eval(value, scope, runtime);
    if (allowString && typeof base === 'string') {
      return this.right.eval(base, scope, runtime) as JSONValue;
    }

    if (!isIterable(base)) {
      return null;
    }

    return {
      [Symbol.iterator]: () => {
        let it = base[Symbol.iterator]();
        return {next: () => {
          for (;;) {
            let v = it.next();
            if (v.done) {
              return { done: true, value: undefined };
            }
            const res = this.right.eval(v.value, scope, runtime) as JSONValue
            if (res !== null) {
              return {
                done: false,
                value: res,
              }
            }
          }
        }}
      }
    }
  }
}

export class ValueProjectionNode implements Node {

  constructor(
    public readonly left: ExpressionNode,
    public readonly right: ExpressionNode,
  ) {}

  get type() {
    return 'ValueProjection' as const;
  }

  eval(value: JSONValue, scope: Scope, runtime: Runtime): JSONValue | Ref {
    const base = this.left.eval(value, scope, runtime);
    if (base === null || typeof base !== 'object' || isIterable(base)) {
      return null;
    }
    const collected: (JSONValue | Ref)[] = [];
    const values = Object.values(base) as JSONValue[];
    for (const elem of values) {
      const current = this.right.eval(elem, scope, runtime) as JSONValue;
      if (current !== null) {
        collected.push(runtime.unwrapIterable(current));
      }
    }
    // no need to return an iterable; Object.values() already returns an array
    return collected as JSONValue;
  }
}

export class FilterProjectionNode implements Node {

  constructor(
    public readonly left: ExpressionNode,
    public readonly right: ExpressionNode,
    public readonly condition: ExpressionNode,
  ) {}

  get type() {
    return 'FilterProjection' as const;
  }

  eval(value: JSONValue, scope: Scope, runtime: Runtime): JSONValue {
    const base = this.left.eval(value, scope, runtime);
    if (!isIterable(base)) {
      return null;
    }

    // return results;
    return {
      [Symbol.iterator]: () => {
        let it = base[Symbol.iterator]();
        return {next: () => {
          for (;;) {
            let v = it.next();
            if (v.done) {
              return { done: true, value: undefined };
            }
            const matched = this.condition.eval(v.value, scope, runtime);
            if (isFalse(matched)) {
              continue;
            }
            const result = this.right.eval(v.value, scope, runtime) as JSONValue;
            if (result !== null) {
              return { done: false, value: result };
            }
          }
        }}
      }
    }
  }
}

export class PipeNode implements Node {

  constructor(
    public readonly left: ExpressionNode,
    public readonly right: ExpressionNode,
  ) {}

  get type() {
    return 'Pipe' as const;
  }

  eval(value: JSONValue, scope: Scope, runtime: Runtime): JSONValue {
    let leftValue = this.left.eval(value, scope, runtime) as JSONValue;
    if (isIterable(leftValue)) {
      leftValue = Array.from(leftValue) as ReadonlyArray<JSONValue>;
    }
    return this.right.eval(leftValue, scope, runtime) as JSONValue;
  }
}

export class OrExpressionNode implements Node {

  constructor(
    public readonly left: ExpressionNode,
    public readonly right: ExpressionNode,
  ) {}

  get type() {
    return 'OrExpression' as const;
  }

  eval(value: JSONValue, scope: Scope, runtime: Runtime): JSONValue {
    const result = this.left.eval(value, scope, runtime);
    if (isFalse(result)) {
      return this.right.eval(value, scope, runtime) as JSONValue;
    }
    return result as JSONValue;
  }
}

export class AndExpressionNode implements Node {

  constructor(
    public readonly left: ExpressionNode,
    public readonly right: ExpressionNode,
  ) {}

  get type() {
    return 'AndExpression' as const;
  }

  eval(value: JSONValue, scope: Scope, runtime: Runtime): JSONValue {
    const result = this.left.eval(value, scope, runtime);
    if (isFalse(result)) {
      return result as JSONValue;
    }
    return this.right.eval(value, scope, runtime) as JSONValue;
  }
}

export type BinaryOperatorType = 'Plus' | 'Minus' | 'Multiply' | Token.TOK_STAR | 'Divide' | 'Modulo' | 'Div';

export class BinaryArithmeticNode implements Node {

  constructor(
    public readonly operator: BinaryOperatorType,
    public readonly left: ExpressionNode,
    public readonly right: ExpressionNode,
  ) {}

  get type() {
    return 'Arithmetic' as const;
  }

  eval(value: JSONValue, scope: Scope, runtime: Runtime): JSONValue {
    const first = this.left.eval(value, scope, runtime) as JSONValue;
    const second = this.right.eval(value, scope, runtime) as JSONValue;
    switch (this.operator) {
      case Token.TOK_PLUS:
        return add(first, second);

      case Token.TOK_MINUS:
        return sub(first, second);

      case Token.TOK_MULTIPLY:
      case Token.TOK_STAR:
        return mul(first, second);

      case Token.TOK_DIVIDE:
        return divide(first, second);

      case Token.TOK_MODULO:
        return mod(first, second);

      case Token.TOK_DIV:
        return div(first, second);

      default:
        throw new Error(`Syntax error: unknown arithmetic operator: ${this.operator}`);
    }
  }
}

export type ExpressionNode =
  | IdentityNode
  | CurrentNode
  | RootNode
  | NotExpressionNode
  | FlattenNode
  | UnaryArithmeticNode
  | ExpressionReferenceNode
  | IndexExpressionNode
  | SubexpressionNode
  | ProjectionNode
  | ValueProjectionNode
  | FilterProjectionNode
  | PipeNode
  | OrExpressionNode
  | AndExpressionNode
  | BinaryArithmeticNode
  | ComparatorNode
  | SliceNode
  | IndexNode
  | LiteralNode
  | FieldNode
  | MultiSelectHashNode
  | MultiSelectListNode
  | FunctionNode
  | LetExpressionNode
  | BindingNode
  | VariableNode
  | TernaryNode;
