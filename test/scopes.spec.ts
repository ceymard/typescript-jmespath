import { describe, expect, it } from 'vitest';
import jmespath from '../src';

describe('scopes', () => {
  it('should return null on missing identifier', () => {
    const scope = new jmespath.Scope();
    expect(scope.get('foo')).toEqual(undefined);
  });

  it('should return item from scope', () => {
    const scope = new jmespath.Scope();
    {
      const outer = new jmespath.Scope(scope);
      outer.setValue('foo', 'bar');
      expect(outer.get('foo')?.[0]).toEqual('bar');
    }
  });
  it('should return item from nested scope', () => {
    const scope = new jmespath.Scope();
    {
      const outer = new jmespath.Scope(scope);
      outer.setValue('foo', 'bar');
      outer.setValue('qux', 'quux');
      {
        const inner = new jmespath.Scope(outer);
        inner.setValue('foo', 'baz');
        expect(inner.get('foo')?.[0]).toEqual('baz');
        expect(inner.get('qux')?.[0]).toEqual('quux');
      }
      expect(outer.get('foo')?.[0]).toEqual('bar');
    }
  });
  it('should not return value for non-existent identifiers', () => {
    const scope = new jmespath.Scope();
    {
      const scoped = new jmespath.Scope(scope);
      scoped.setValue('foo', 'bar');
      expect(scoped.get('baz')).toEqual(undefined);
      expect(scoped.get('foo')?.[0]).toEqual('bar');
    }
  });
  it('should return null for identifiers even in nested scopes if absent', () => {
    const scope = new jmespath.Scope();
    {
      const outer = new jmespath.Scope(scope);
      outer.setValue('foo', 'bar');
      {
        const inner = new jmespath.Scope(outer);
        inner.setValue('bar', 'baz');
        expect(inner.get('qux')).toEqual(undefined);
      }
      expect(outer.get('qux')).toEqual(undefined);
    }
  });
  it('should handle values in nested scopes differently from outer scopes', () => {
    const scope = new jmespath.Scope();
    {
      const outer = new jmespath.Scope(scope);
      outer.setValue('foo', 'bar');
      {
        const inner = new jmespath.Scope(outer);
        inner.setValue('bar', 'baz');
        expect(inner.get('foo')?.[0]).toEqual('bar');
        expect(inner.get('bar')?.[0]).toEqual('baz');
      }
    }
  });
  it('should not fall through to outer scope when key is in current scope with null/undefined', () => {
    const scope = new jmespath.Scope();
    {
      const outer = new jmespath.Scope(scope);
      outer.setValue('foo', 'bar');
      {
        const inner = new jmespath.Scope(outer);
        inner.setValue('foo', null);
        expect(inner.get('foo')?.[0]).toEqual(null);
      }
    }
  });
  it('should properly differentiate between keys absent entirely and those in outer scopes', () => {
    const scope = new jmespath.Scope();
    {
      const outer = new jmespath.Scope(scope);
      outer.setValue('foo', 'bar');
      {
        const inner = new jmespath.Scope(outer);
        inner.setValue('baz', null);
        expect(inner.get('foo')?.[0]).toEqual('bar');
        expect(inner.get('baz')?.[0]).toEqual(null);
      }
    }
  });
});
