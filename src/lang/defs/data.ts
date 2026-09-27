// ─── Data ────────────────────────────────────────────────────────────────────
// Every element a program makes is a piece of data in one store, for the whole
// run. It goes in the store rather than in whatever call made it, because it can
// outlive that call: returned, held by a field, or named in a constraint.
// Nothing is ever taken out while the program runs.
//
// A piece of data has its own scope, holding its fields. A Triangle's holds
// point1..3, each pointing at a Point; a Point's is empty. It is filled once,
// when the data is made, with exactly the fields its `define type` declares, and
// never changed after — so `t.point1` means one thing for as long as `t` exists.

import { Scope, type Key } from './scope.js'

export type Data = {
  key: Key
  type: string
  /** Its fields. Complete when made; never added to. */
  scope: Scope
}

export class DataStore {
  private readonly byKey = new Map<Key, Data>()

  /** Make a piece of data. Callers check first and report a clash in the
   *  program's terms; a key already in use here is a bug in the caller. */
  make(key: Key, type: string, scope: Scope = new Scope()): Data {
    if (this.byKey.has(key)) throw new Error(`internal: "${key}" is already in the data store`)
    const data = { key, type, scope }
    this.byKey.set(key, data)
    return data
  }

  // Lookups take a plain string: until keys are generated, a name that has no
  // label of its own is used as its key directly.
  get(key: string): Data | undefined {
    return this.byKey.get(key as Key)
  }

  has(key: string): boolean {
    return this.byKey.has(key as Key)
  }

  typeOf(key: string): string | undefined {
    return this.get(key)?.type
  }

  keys(): IterableIterator<Key> {
    return this.byKey.keys()
  }
}
