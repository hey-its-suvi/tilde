// ─── Data ────────────────────────────────────────────────────────────────────
// Every element a program makes is a piece of data in one store, for the whole
// run. It goes in the store rather than in whatever call made it, because it can
// outlive that call: returned, held by a field, or named in a constraint.
// Nothing is ever taken out while the program runs.
//
// Each piece of data gets a key the store makes up — `Point#1`, `Triangle#2` —
// counted per type, so a key says what it is and which one. A program never
// writes a key: `#` cannot appear in a name. It writes labels, which point at
// keys; the key is what errors and debugging show when there is no label to use.
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
  private readonly counts = new Map<string, number>()

  /** Make a piece of data of `type`, with a new key. */
  make(type: string, scope: Scope = new Scope()): Data {
    const n = (this.counts.get(type) ?? 0) + 1
    this.counts.set(type, n)
    const data = { key: `${type}#${n}` as Key, type, scope }
    this.byKey.set(data.key, data)
    return data
  }

  /** The key `s` spells, if it spells one. Statements are text, so a key that
   *  was written into one — a slot's value, a bracket's result — comes back as a
   *  string, and this is how it is recognised as a key again. */
  key(s: string): Key | undefined {
    return this.byKey.has(s as Key) ? (s as Key) : undefined
  }

  get(key: Key): Data | undefined {
    return this.byKey.get(key)
  }

  typeOf(key: Key): string | undefined {
    return this.byKey.get(key)?.type
  }

  keys(): IterableIterator<Key> {
    return this.byKey.keys()
  }
}
