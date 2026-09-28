// ─── Keys, labels and scopes ─────────────────────────────────────────────────
// An element is data, and its *key* is how the rest of the system refers to it:
// constraints, the solver and fields all hold keys. A program never writes a key.
// It writes *labels* — names that point at a key — and a label lives in a
// *scope*: the program's, a call's, or an element's own fields. Two labels can
// point at one key (`a` and `t.point1`), which is one element under two names,
// not a copy kept in step.
//
// A label is set once. Tilde has no reassignment, so a second label with the
// same name in the same scope is a contradiction, never an update.

/** An element's key. Branded so a name cannot be passed where a key is wanted:
 *  the two are both strings, and mixing them up is the easy mistake to make. */
export type Key = string & { readonly __key: true }

/** A name, and the element it points at. */
export type Label = { name: string; key: Key }

/** A set of labels, looked up by name. */
export class Scope {
  private readonly byName = new Map<string, Key>()

  get(name: string): Key | undefined {
    return this.byName.get(name)
  }

  has(name: string): boolean {
    return this.byName.has(name)
  }

  /** Add a label. Callers check first and report a mistake in the program's own
   *  terms; reaching here with a name already taken is a bug in the caller. */
  add(label: Label): void {
    if (this.byName.has(label.name)) {
      throw new Error(`internal: "${label.name}" is already a label in this scope`)
    }
    this.byName.set(label.name, label.key)
  }

  *labels(): IterableIterator<Label> {
    for (const [name, key] of this.byName) yield { name, key }
  }
}
