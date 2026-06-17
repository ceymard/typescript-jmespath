import { describe, expect, it } from 'vitest';
import jmespath from '../src';

describe("unquoted unicode identifiers", () => {
  it("are usable in experiment mode", () => {
    const result = jmespath.search({ foö: 'bar', bàr: 'baz' }, '{foo: foö,bar: bàr}', {
      enable_experiments: true
    });
    expect(result).toStrictEqual({ foo: 'bar', bar: 'baz' });
  })
})

describe('object property shorthand syntax', () => {
  it("should be allowed when enabled", () => {
    const result = jmespath.search({ foo: 'bar', bar: 'baz' }, '{foo,bar}', {
      enable_object_property_shorthand: true
    });
    expect(result).toStrictEqual({ foo: 'bar', bar: 'baz' });
  })

  it("should be mixable with regular object syntax", () => {
    const result = jmespath.search({ foo: 'bar', bar: 'baz' }, '{foo, bar, other: \'value\'}', {
      enable_object_property_shorthand: true
    });
    expect(result).toStrictEqual({ foo: 'bar', bar: 'baz', other: 'value' });
  })

  it("should be allowed in experiments", () => {
    const result = jmespath.search({ foo: 'bar', bar: 'baz' }, '{foo, bar, other: \'value\'}', {
      enable_experiments: true
    });
    expect(result).toStrictEqual({ foo: 'bar', bar: 'baz', other: 'value' });
  })
});
