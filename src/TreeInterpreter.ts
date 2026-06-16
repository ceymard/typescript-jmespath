import type { ExpressionNode, SliceNode } from './AST.type';
import type { JSONArray, JSONValue } from './JSON.type';
import { Runtime } from './Runtime';
import { Scope } from './Scope';

export class TreeInterpreter {
  runtime: Runtime;

  constructor() {
    this.runtime = new Runtime(this);
  }

  searchWithScope(node: ExpressionNode, value: JSONValue, scope: Scope): JSONValue {
    scope.setValue("", value);
    return node.eval(value, scope, this.runtime) as JSONValue;
  }

  search(node: ExpressionNode, value: JSONValue): JSONValue {
    const scope = new Scope();
    scope.setValue("", value);
    return node.eval(value, scope, this.runtime) as JSONValue;
  }

  computeSliceParams(arrayLength: number, sliceNode: SliceNode): { start: number; stop: number; step: number } {
    let { start, stop, step } = sliceNode;

    if (step === null) {
      step = 1;
    } else if (step === 0) {
      const error = new Error('Invalid value: slice step cannot be 0');
      error.name = 'RuntimeError';
      throw error;
    }

    start = start === null ? (step < 0 ? arrayLength - 1 : 0) : this.capSliceRange(arrayLength, start, step);
    stop = stop === null ? (step < 0 ? -1 : arrayLength) : this.capSliceRange(arrayLength, stop, step);

    return { start, stop, step };
  }

  capSliceRange(arrayLength: number, actualValue: number, step: number): number {
    let nextActualValue = actualValue;
    if (nextActualValue < 0) {
      nextActualValue += arrayLength;
      if (nextActualValue < 0) {
        nextActualValue = step < 0 ? -1 : 0;
      }
    } else if (nextActualValue >= arrayLength) {
      nextActualValue = step < 0 ? arrayLength - 1 : arrayLength;
    }
    return nextActualValue;
  }

  slice(collection: JSONArray, start: number, end: number, step: number): JSONArray {
    const result = [];
    if (step > 0) {
      for (let i = start; i < end; i += step) {
        result.push(collection[i]);
      }
    } else {
      for (let i = start; i > end; i += step) {
        result.push(collection[i]);
      }
    }
    return result;
  }
}

export const TreeInterpreterInstance = new TreeInterpreter();
export default TreeInterpreterInstance;
