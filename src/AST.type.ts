import { type JSONArray, type JSONObject, JSONValue } from './JSON.type';
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
    if (!Array.isArray(value)) {
      return null;
    }
    const index = this.value < 0 ? value.length + this.value : this.value;
    return value[index] ?? null;
  }
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
    if (!Array.isArray(value) && typeof value !== 'string') {
      return null;
    }
    const interpreter = runtime._interpreter;
    const { start, stop, step } = interpreter.computeSliceParams(value.length, this);
    if (typeof value === 'string') {
      const chars = [...value];
      const sliced = interpreter.slice(chars, start, stop, step);
      return sliced.join('');
    }
    return interpreter.slice(value as JSONArray, start, stop, step);
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
      collected[child.name] = child.value.eval(value, scope, runtime) as JSONValue;
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
      collected.push(child.eval(value, scope, runtime) as JSONValue);
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
    const args: JSONValue[] = [];
    for (const child of this.children) {
      args.push(child.eval(value, scope, runtime) as JSONValue);
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
    return Array.isArray(original) ? original.flat() : null;
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

    if (!Array.isArray(base)) {
      return null;
    }
    const collected: JSONValue[] = [];
    for (const elem of base) {
      const current = this.right.eval(elem, scope, runtime) as JSONValue;
      if (current !== null) {
        collected.push(current);
      }
    }
    return collected as JSONValue;
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

  eval(value: JSONValue, scope: Scope, runtime: Runtime): JSONValue {
    const base = this.left.eval(value, scope, runtime);
    if (base === null || typeof base !== 'object' || Array.isArray(base)) {
      return null;
    }
    const collected: JSONValue[] = [];
    const values = Object.values(base) as JSONValue[];
    for (const elem of values) {
      const current = this.right.eval(elem, scope, runtime) as JSONValue;
      if (current !== null) {
        collected.push(current);
      }
    }
    return collected;
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
    if (!Array.isArray(base)) {
      return null;
    }

    const results: JSONValue[] = [];
    for (const elem of base) {
      const matched = this.condition.eval(elem, scope, runtime);
      if (isFalse(matched)) {
        continue;
      }
      const result = this.right.eval(elem, scope, runtime) as JSONValue;
      if (result !== null) {
        results.push(result);
      }
    }
    return results;
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
    const leftValue = this.left.eval(value, scope, runtime) as JSONValue;
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
