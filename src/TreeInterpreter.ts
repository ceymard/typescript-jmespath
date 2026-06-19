import type { ExpressionNode, SliceNode } from './AST.type';
import type { JSONArray, JSONValue } from './JSON.type';
import { Runtime } from './Runtime';
import { Scope } from './Scope';

const empty_scope = new Scope();

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
    // const scope = new Scope();
    const scope = empty_scope
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
    if (step === 1) {
      return collection.slice(start, end)
    }
    const len = Math.ceil(Math.abs(start - end) / Math.abs(step))
    const result = new Array(len)
    let idx = 0
    if (step > 0) {
      for (let i = start; i < end; i += step) {
        result[idx] = collection[i]
        idx++
      }
    } else {
      for (let i = start; i > end; i += step) {
        result[idx] = collection[i]
        idx++
      }
    }
    return result;
  }
}

export const TreeInterpreterInstance = new TreeInterpreter();
export default TreeInterpreterInstance;
