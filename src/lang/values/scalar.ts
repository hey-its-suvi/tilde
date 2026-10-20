// ─── Scalar ───────────────────────────────────────────────────────────────────
// What a named number could be. For now a scalar is a list of exact values, or
// `undefined` when it is unknown (any number). `[]` is a contradiction: no value
// is possible.
//
// Intervals come later; this module is the one place the solver asks about a
// scalar's possible values, so that change stays here.

export type Scalar = number[] | undefined

/** What both could be. `undefined` constrains nothing and `[]` rules out
 *  everything, so this is total: every pair of states has an answer. */
export function intersectScalars(a: Scalar, b: Scalar): Scalar {
  if (a === undefined) return b === undefined ? undefined : [...b]
  if (b === undefined) return [...a]
  return a.filter(v => b.some(w => Math.abs(v - w) < 1e-9))
}

/** True when both are the same set of possible values, in the same order. */
export function sameScalars(x: Scalar, y: Scalar): boolean {
  return x === undefined || y === undefined
    ? x === y
    : x.length === y.length && x.every((v, i) => v === y[i])
}
