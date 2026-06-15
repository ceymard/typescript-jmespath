import type { ExpressionNode } from './AST.type';
import { type JSONValue } from './JSON.type';
import { Runtime } from './Runtime';
import { Scope } from './Scope';

export class TreeInterpreter {
  runtime: Runtime;
  private _rootValue: JSONValue | null = null;

  constructor() {
    this.runtime = new Runtime(this);
  }

  get rootValue(): JSONValue | null {
    return this._rootValue;
  }

  search(node: ExpressionNode, value: JSONValue): JSONValue {
    this._rootValue = value;
    const result = node.eval(value, new Scope(), this.runtime) as JSONValue;
    return this.runtime.unwrapIterable(result);
  }

}

export const TreeInterpreterInstance = new TreeInterpreter();
export default TreeInterpreterInstance;
