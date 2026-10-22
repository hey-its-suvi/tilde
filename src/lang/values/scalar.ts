// ─── Scalar ───────────────────────────────────────────────────────────────────
// What a named number could be: a normalised list of intervals. The list is
// sorted, disjoint and non-touching, so each set has one form. Unknown is the
// whole line, a single exact value is a singleton interval, and `[]` is a
// contradiction: no value is possible.

import {
  bound, compareIntervals, connects, interval, intersectIntervals, join,
  isSingleton as isSingletonInterval, type Bound, type Interval,
} from './interval.js'

export type Scalar = Interval[]

/** Unknown: any number. */
export const wholeScalar = (): Scalar => [{ low: bound(null), high: bound(null) }]

/** Exactly one value. */
export const exactScalar = (n: number): Scalar => scalarOf([n])

/** Exactly these values, one singleton interval each. */
export function scalarOf(values: number[]): Scalar {
  return normalise(values.map(n => ({ low: bound(n), high: bound(n) })))
}

/** Sorts intervals and joins any that overlap or touch, so the result has one form. */
export function normalise(intervals: Interval[]): Scalar {
  const out: Interval[] = []
  for (const next of [...intervals].sort(compareIntervals)) {
    const last = out[out.length - 1]
    if (last && connects(last, next)) out[out.length - 1] = join(last, next)
    else out.push(next)
  }
  return out
}

/** Every number that either scalar could be. */
export function union(a: Scalar, b: Scalar): Scalar {
  return normalise([...a, ...b])
}

/** Every number that both scalars could be. */
export function intersectScalars(a: Scalar, b: Scalar): Scalar {
  const parts: Interval[] = []
  for (const x of a) {
    for (const y of b) {
      const part = intersectIntervals(x, y)
      if (part) parts.push(part)
    }
  }
  return normalise(parts)
}

/** Every number the scalar could not be. */
export function complement(s: Scalar): Scalar {
  const out: Interval[] = []
  // Where the next gap starts. `null` once nothing above is left to cover.
  let start: Bound | null = bound(null)
  for (const i of s) {
    if (i.low.value !== null && start) {
      const gap = interval(start, flip(i.low))
      if (gap) out.push(gap)
    }
    start = i.high.value === null ? null : flip(i.high)
  }
  if (start) out.push({ low: start, high: bound(null) })
  return out
}

/** The same value, with the open and closed ends swapped. */
function flip(b: Bound): Bound {
  return { value: b.value, open: !b.open }
}

export const isEmpty = (s: Scalar): boolean => s.length === 0

/** True when the scalar could be any number. */
export const isWhole = (s: Scalar): boolean =>
  s.length === 1 && s[0]!.low.value === null && s[0]!.high.value === null

/** True when the scalar is exactly one value. */
export const isSingleton = (s: Scalar): boolean =>
  s.length === 1 && isSingletonInterval(s[0]!)

/** True when both are the same intervals, with the same ends. */
export function sameScalars(x: Scalar, y: Scalar): boolean {
  return x.length === y.length && x.every((a, i) => {
    const b = y[i]!
    return a.low.value === b.low.value && a.low.open === b.low.open
      && a.high.value === b.high.value && a.high.open === b.high.open
  })
}

/** The plain values, for the solver's reporting. `undefined` when unknown.
 *  Throws for an interval that is not a single value: the solver only makes
 *  exact values for now, so that cannot happen yet. */
export function numbersOf(s: Scalar): number[] | undefined {
  if (isWhole(s)) return undefined
  return s.map(i => {
    if (!isSingletonInterval(i)) throw new Error('numbersOf: scalar has a range, which the solver cannot report yet')
    return i.low.value!
  })
}
