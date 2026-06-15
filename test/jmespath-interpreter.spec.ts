import { describe, expect, it } from 'vitest';
import jmespath from '../src';

describe('Searches compiled ast', () => {
  it('search a compiled expression', () => {
    expect(jmespath.search({ foo: { bar: 'BAZ' } }, 'foo.bar')).toEqual('BAZ');
  });
});

describe("Can iterate over a generator", () => {
  it("can iterate over a generator", () => {
    expect(jmespath.search(function *gen() {
      for (let i = 0; i < 10; i++) {
        yield i;
      }
    }(), '[?@ % `2` == `0`]')).toEqual([0, 2, 4, 6, 8]);
  });
})