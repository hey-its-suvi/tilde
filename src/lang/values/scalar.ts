// ─── Scalar ───────────────────────────────────────────────────────────────────
// What a named number could be: a normalised list of intervals. The list is
// sorted, disjoint and non-touching, so each set has one form. Unknown is the
// whole line, a single exact value is a singleton interval, and `[]` is a
// contradiction: no value is possible.
//
// makeScalarOps builds the operations for one number type. The names exported
// at the bottom are the float instance, which is what the solver uses today.
//
// Conventions for arithmetic:
// - Dividing by zero gives no value for that part of the divisor, so the 0 is
//   dropped: `1 ÷ [0, 1]` is `[1, inf)`.
// - `0 × inf` is `0`. The infinite end is never reached, only approached.
// - A product or quotient of two single values is computed directly. Only
//   results that come from a range are widened outward.

import { floatArith } from './float.js'
import type { Arith } from './arith.js'
import { bound, makeIntervalOps, type Bound, type Interval } from './interval.js'

export type Scalar<N = number> = Interval<N>[]

export function makeScalarOps<N>(A: Arith<N>) {
  const I = makeIntervalOps(A)
  const zero = A.fromNumber(0)
  const one = A.fromNumber(1)

  // ── Building ───────────────────────────────────────────────────────────────

  /** Unknown: any number. */
  const wholeScalar = (): Scalar<N> => [{ low: bound<N>(null), high: bound<N>(null) }]

  /** Exactly these values, one singleton interval each. */
  const scalarOf = (values: N[]): Scalar<N> =>
    normalise(values.map(n => ({ low: bound(n), high: bound(n) })))

  /** Exactly one value. */
  const exactScalar = (n: N): Scalar<N> => scalarOf([n])

  /** Sorts intervals and joins any that overlap or touch, so the result has one form. */
  function normalise(intervals: Interval<N>[]): Scalar<N> {
    const out: Interval<N>[] = []
    for (const next of [...intervals].sort(I.compareIntervals)) {
      const last = out[out.length - 1]
      if (last && I.connects(last, next)) out[out.length - 1] = I.join(last, next)
      else out.push(next)
    }
    return out
  }

  // ── Sets ───────────────────────────────────────────────────────────────────

  /** Every number that either scalar could be. */
  function union(a: Scalar<N>, b: Scalar<N>): Scalar<N> {
    return normalise([...a, ...b])
  }

  /** Every number that both scalars could be. */
  function intersectScalars(a: Scalar<N>, b: Scalar<N>): Scalar<N> {
    const parts: Interval<N>[] = []
    for (const x of a) {
      for (const y of b) {
        const part = I.intersectIntervals(x, y)
        if (part) parts.push(part)
      }
    }
    return normalise(parts)
  }

  /** Every number the scalar could not be. */
  function complement(s: Scalar<N>): Scalar<N> {
    const out: Interval<N>[] = []
    // Where the next gap starts. `null` once nothing above is left to cover.
    let start: Bound<N> | null = bound<N>(null)
    for (const i of s) {
      if (i.low.value !== null && start) {
        const gap = I.interval(start, flip(i.low))
        if (gap) out.push(gap)
      }
      start = i.high.value === null ? null : flip(i.high)
    }
    if (start) out.push({ low: start, high: bound<N>(null) })
    return out
  }

  /** The same value, with the open and closed ends swapped. */
  function flip(b: Bound<N>): Bound<N> {
    return { value: b.value, open: !b.open }
  }

  // ── States ─────────────────────────────────────────────────────────────────

  const isEmpty = (s: Scalar<N>): boolean => s.length === 0

  /** True when the scalar could be any number. */
  const isWhole = (s: Scalar<N>): boolean =>
    s.length === 1 && s[0]!.low.value === null && s[0]!.high.value === null

  /** True when the scalar is exactly one value. */
  const isSingleton = (s: Scalar<N>): boolean =>
    s.length === 1 && I.isSingleton(s[0]!)

  /** True when both are the same intervals, with the same ends. */
  function sameScalars(x: Scalar<N>, y: Scalar<N>): boolean {
    const sameValue = (p: N | null, q: N | null) =>
      p === null || q === null ? p === q : A.compare(p, q) === 0
    const sameBound = (p: Bound<N>, q: Bound<N>) =>
      sameValue(p.value, q.value) && p.open === q.open
    return x.length === y.length && x.every((a, i) =>
      sameBound(a.low, y[i]!.low) && sameBound(a.high, y[i]!.high))
  }

  /** The plain values, for the solver's output format. `undefined` when unknown.
   *  Throws for a range, since that format cannot show one yet. */
  function numbersOf(s: Scalar<N>): N[] | undefined {
    if (isWhole(s)) return undefined
    return s.map(i => {
      if (!I.isSingleton(i)) throw new Error('numbersOf: scalar has a range, which the output format cannot show yet')
      return i.low.value!
    })
  }

  // ── Arithmetic ─────────────────────────────────────────────────────────────

  // An end in arithmetic: a finite number, or an infinity with its sign.
  type End = { kind: 'fin'; v: N } | { kind: 'inf'; sign: -1 | 1 }
  const fin = (v: N): End => ({ kind: 'fin', v })

  /** -1, 0 or 1 for an end below, at, or above zero. */
  function signOf(e: End): -1 | 0 | 1 {
    return e.kind === 'inf' ? e.sign : A.compare(e.v, zero)
  }

  /** Orders two ends, with the infinities at either extreme. */
  function cmpEnd(x: End, y: End): number {
    if (x.kind === 'inf' && y.kind === 'inf') return x.sign - y.sign
    if (x.kind === 'inf') return x.sign
    if (y.kind === 'inf') return -y.sign
    return A.compare(x.v, y.v)
  }

  /** The product of two ends. Zero times anything is zero, even an infinity. */
  function mulEnd(x: End, y: End): End {
    if (signOf(x) === 0 || signOf(y) === 0) return fin(zero)
    if (x.kind === 'inf' || y.kind === 'inf') {
      return { kind: 'inf', sign: (signOf(x) * signOf(y)) as -1 | 1 }
    }
    return fin(A.mul(x.v, y.v))
  }

  const lowEnd = (i: Interval<N>): End =>
    i.low.value === null ? { kind: 'inf', sign: -1 } : fin(i.low.value)
  const highEnd = (i: Interval<N>): End =>
    i.high.value === null ? { kind: 'inf', sign: 1 } : fin(i.high.value)

  /** The interval spanned by some results. Its finite ends are widened outward,
   *  so rounding cannot shrink the true answer. */
  function spanOf(ends: End[]): Interval<N> {
    let lo = ends[0]!
    let hi = ends[0]!
    for (const e of ends) {
      if (cmpEnd(e, lo) < 0) lo = e
      if (cmpEnd(e, hi) > 0) hi = e
    }
    const low = lo.kind === 'inf' ? bound<N>(null) : bound(A.below(lo.v))
    const high = hi.kind === 'inf' ? bound<N>(null) : bound(A.above(hi.v))
    return { low, high }
  }

  function addInterval(a: Interval<N>, b: Interval<N>): Interval<N> {
    if (I.isSingleton(a) && I.isSingleton(b)) {
      const v = A.add(a.low.value!, b.low.value!)
      return { low: bound(v), high: bound(v) }
    }
    const low = a.low.value === null || b.low.value === null
      ? bound<N>(null)
      : bound(A.below(A.add(a.low.value, b.low.value)), a.low.open || b.low.open)
    const high = a.high.value === null || b.high.value === null
      ? bound<N>(null)
      : bound(A.above(A.add(a.high.value, b.high.value)), a.high.open || b.high.open)
    return { low, high }
  }

  function negInterval(a: Interval<N>): Interval<N> {
    const neg = (v: N | null) => (v === null ? null : A.sub(zero, v))
    return {
      low: bound(neg(a.high.value), a.high.open),
      high: bound(neg(a.low.value), a.low.open),
    }
  }

  function subInterval(a: Interval<N>, b: Interval<N>): Interval<N> {
    return addInterval(a, negInterval(b))
  }

  function mulInterval(a: Interval<N>, b: Interval<N>): Interval<N> {
    if (I.isSingleton(a) && I.isSingleton(b)) {
      const v = A.mul(a.low.value!, b.low.value!)
      return { low: bound(v), high: bound(v) }
    }
    const corners = [lowEnd(a), highEnd(a)].flatMap(x => [lowEnd(b), highEnd(b)].map(y => mulEnd(x, y)))
    return spanOf(corners)
  }

  /** The part of `b` on one side of zero, split so that zero is excluded. */
  const NEG: Interval<N> = { low: bound<N>(null), high: bound(zero, true) }
  const POS: Interval<N> = { low: bound(zero, true), high: bound<N>(null) }

  /** The reciprocal of an interval that does not reach zero. Zero's own
   *  reciprocal is unbounded, so zero ends become infinite ends. */
  function recipPiece(p: Interval<N>): Interval<N> {
    const positive = p.high.value === null || A.compare(p.high.value, zero) > 0
    if (positive) {
      const low = p.high.value === null
        ? bound(zero, true)
        : bound(A.below(A.div(one, p.high.value)), p.high.open)
      const high = p.low.value === null || A.compare(p.low.value, zero) === 0
        ? bound<N>(null)
        : bound(A.above(A.div(one, p.low.value)), p.low.open)
      return { low, high }
    }
    const low = A.compare(p.high.value!, zero) === 0
      ? bound<N>(null)
      : bound(A.below(A.div(one, p.high.value!)), p.high.open)
    const high = p.low.value === null
      ? bound(zero, true)
      : bound(A.above(A.div(one, p.low.value)), p.low.open)
    return { low, high }
  }

  /** The quotients of `a` by `b`. Zero in `b` has no value, so it is dropped. */
  function divInterval(a: Interval<N>, b: Interval<N>): Interval<N>[] {
    if (I.isSingleton(a) && I.isSingleton(b)) {
      const d = b.low.value!
      if (A.compare(d, zero) === 0) return []
      const v = A.div(a.low.value!, d)
      return [{ low: bound(v), high: bound(v) }]
    }
    const pieces = [NEG, POS]
      .map(part => I.intersectIntervals(b, part))
      .filter((p): p is Interval<N> => p !== null)
    return pieces.map(p => mulInterval(a, recipPiece(p)))
  }

  function sqrtInterval(x: Interval<N>): Interval<N>[] {
    const NONNEG: Interval<N> = { low: bound(zero), high: bound<N>(null) }
    const part = I.intersectIntervals(x, NONNEG)
    if (!part) return []
    if (I.isSingleton(part)) {
      const v = A.sqrt(part.low.value!)
      return [{ low: bound(v), high: bound(v) }]
    }
    const low = bound(A.below(A.sqrt(part.low.value!)), part.low.open)
    const high = part.high.value === null
      ? bound<N>(null)
      : bound(A.above(A.sqrt(part.high.value)), part.high.open)
    return [{ low, high }]
  }

  /** Every pair, one interval from each side. */
  const pairs = (a: Scalar<N>, b: Scalar<N>) => a.flatMap(x => b.map(y => [x, y] as const))

  const add = (a: Scalar<N>, b: Scalar<N>): Scalar<N> =>
    normalise(pairs(a, b).map(([x, y]) => addInterval(x, y)))

  const sub = (a: Scalar<N>, b: Scalar<N>): Scalar<N> =>
    normalise(pairs(a, b).map(([x, y]) => subInterval(x, y)))

  const mul = (a: Scalar<N>, b: Scalar<N>): Scalar<N> =>
    normalise(pairs(a, b).map(([x, y]) => mulInterval(x, y)))

  const div = (a: Scalar<N>, b: Scalar<N>): Scalar<N> =>
    normalise(pairs(a, b).flatMap(([x, y]) => divInterval(x, y)))

  const sqrt = (a: Scalar<N>): Scalar<N> =>
    normalise(a.flatMap(sqrtInterval))

  return {
    wholeScalar, scalarOf, exactScalar, normalise, union, intersectScalars, complement,
    isEmpty, isWhole, isSingleton, sameScalars, numbersOf,
    add, sub, mul, div, sqrt,
  }
}

export const {
  wholeScalar, scalarOf, exactScalar, normalise, union, intersectScalars, complement,
  isEmpty, isWhole, isSingleton, sameScalars, numbersOf,
  add, sub, mul, div, sqrt,
} = makeScalarOps(floatArith)
