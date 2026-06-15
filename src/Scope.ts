import type { Ref } from './AST.type';
import type { JSONValue } from './JSON.type';

/*
  JS Engines are very optimized when copying Map objects.
  Creating a sub-scope is thus cheap : it just copies the parent scope.

  However, if a key is modified in a parent scope, the child scope needs to be aware of it.
  There are two ways to achieve this :
    - override get() so that it will query the parent scope if the key was defined in a parent scope, which can lead to as many .get() and super.get() calls are there are parent scopes if the key comes from a root.
    - do it like here : the scope value sits in an array : if the value changes, the array has a reference to it. Children scopes copy the array ; not the value. If the parent changes the value, the child will thus see the change in _only one_ .get(), which tells also tells us if the key existed at all, without having to call has().
    The price to pay is just one array property lookup, but that's dirt cheap.

  The only limitation is that the parent scope *must* know all its variables before creating children as they can't be aware of new keys added after the fact.
*/

type ScopeValue = [value: JSONValue | Ref, scope: Scope] | [value: JSONValue, scope: Scope]

export class Scope extends Map<string, ScopeValue> {

  setValue(key: string, value: JSONValue | Ref): this {
    let prev = this.get(key)

    // the key did not exist in *this* scope. It will therefore now shadow
    if (prev === undefined || prev[1] !== this) {
      this.set(key, [value, this])
    } else {
      // the key exists and was defined in this scope
      prev[0] = value
    }
    return this
  }
}