export type ObjectDict<T = unknown> = Record<string, T | undefined>;

export type JSONPrimitive = string | number | boolean | null;
export type JSONValue = JSONPrimitive | JSONObject | JSONArray | Iterable<JSONValue>;
export type JSONObject = Readonly<{ [member: string]: JSONValue }>;
export type JSONArrayObject = ReadonlyArray<JSONObject>;
export type JSONArrayKeyValuePairs = ReadonlyArray<[string, JSONValue]>;
export type JSONArrayArray = ReadonlyArray<JSONArray>;
export type JSONArray = ReadonlyArray<JSONValue>;
import type { Ref } from './AST.type';

export function isObject(value: JSONValue): value is JSONObject {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

export function isIterable(value: JSONValue | Ref): value is Iterable<JSONValue> {
  return value !== null && typeof value !== "string" && (value as any)[Symbol.iterator] !== undefined;
}