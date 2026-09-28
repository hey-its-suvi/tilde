// ─── Reading results by name ─────────────────────────────────────────────────
// The evaluator and solver work in keys (`Point#1`); tests are clearer in the
// names a program wrote. `byName` turns every key back into the label a drawing
// would show — `p`, `t.point1`, or a local's `_c_1` — so an assertion can still
// say `{ kind: 'position', point: 'p', … }`. Solving uses the real keys; only
// what comes back is translated.

import { labelsOf, type Program } from '../lang/defs/eval.js'
import type { Key } from '../lang/defs/scope.js'
import type { ConstraintSet } from '../lang/solver/interface.js'
import { segKey } from '../lang/solver/model.js'

export function byName(program: Program) {
  const labels = labelsOf(program)
  const keys = new Map([...labels].map(([key, name]) => [name, key]))
  const name = (s: string) => labels.get(s as Key) ?? s

  const deep = (v: unknown): unknown => {
    if (typeof v === 'string') return name(v)
    if (Array.isArray(v)) return v.map(deep)
    if (v instanceof Set) return new Set([...v].map(deep))
    if (v instanceof Map) return new Map([...v].map(([k, x]) => [deep(k), deep(x)]))
    if (v !== null && typeof v === 'object') {
      return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, deep(x)]))
    }
    return v
  }

  const constraints = deep(program.constraints) as ConstraintSet
  // A segment is keyed by its two ends, so it is renamed end by end.
  constraints.segments = new Set(
    [...program.constraints.segments].map(s => {
      const [a, b] = s.split(':')
      return segKey(name(a!), name(b!))
    }),
  )

  return {
    raw: program,
    constraints,
    globals: program.globals,
    labels,
    /** The type of what `name` labels. */
    typeOf: (n: string) => {
      const key = keys.get(n)
      return key === undefined ? undefined : program.data.typeOf(key)
    },
    has: (n: string) => keys.has(n),
    /** Every element's label, for tests that list what a program made. */
    names: () => [...program.data.keys()].map(name),
    /** A solve result, keyed and valued by name. */
    solved: <R>(result: R): R => deep(result) as R,
  }
}
