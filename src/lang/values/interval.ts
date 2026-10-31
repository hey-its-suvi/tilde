// ─── Interval ─────────────────────────────────────────────────────────────────
// One connected run of numbers. Each end is a Bound: a value and whether that
// end is open (not included) or closed (included). `value: null` means the end
// is unbounded, and an unbounded end is always open, since infinity is never in
// a set.
//
// The operations are built from an Arith backend by makeIntervalOps. The names
// exported at the bottom are the float instance, which is what the rest of the
// code uses today.

import type { Arith } from './arith.js'
import { floatArith } from './float.js'

/** One end of an interval: where it is, and whether it is excluded. */
export type Bound<N = number> = { value: N | null; open: boolean }
/** A connected run of numbers, from `low` to `high`. */
export type Interval<N = number> = { low: Bound<N>; high: Bound<N> }

/** An end at `value`, open or closed. `null` is unbounded, and then always open. */
export function bound<N = number>(value: N | null, open = false): Bound<N> {
  return value === null ? { value, open: true } : { value, open }
}

/** The interval operations for one number type. */
export function makeIntervalOps<N>(A: Arith<N>) {
  /** The interval from `low` to `high`, or `null` when no number lies in it. */
  function interval(low: Bound<N>, high: Bound<N>): Interval<N> | null {
    if (low.value !== null && high.value !== null) {
      const c = A.compare(low.value, high.value)
      if (c > 0) return null
      if (c === 0 && (low.open || high.open)) return null
    }
    return { low, high }
  }

  /** True when `x` lies inside the interval, respecting open and closed ends. */
  function contains(i: Interval<N>, x: N): boolean {
    const { low, high } = i
    if (low.value !== null) {
      const c = A.compare(x, low.value)
      if (c < 0 || (c === 0 && low.open)) return false
    }
    if (high.value !== null) {
      const c = A.compare(x, high.value)
      if (c > 0 || (c === 0 && high.open)) return false
    }
    return true
  }

  /** True when the interval holds exactly one number, e.g. `[5, 5]`. */
  function isSingleton(i: Interval<N>): boolean {
    return i.low.value !== null && i.high.value !== null && A.compare(i.low.value, i.high.value) === 0
  }

  /** Orders intervals by where they start, then where they end. At the same
   *  value, a closed start comes before an open one, since it includes more. */
  function compareIntervals(a: Interval<N>, b: Interval<N>): number {
    return compareLows(a.low, b.low) || compareHighs(a.high, b.high)
  }

  /** The numbers both intervals contain, or `null` when they share none. */
  function intersectIntervals(a: Interval<N>, b: Interval<N>): Interval<N> | null {
    const low = compareLows(a.low, b.low) >= 0 ? a.low : b.low
    const high = compareHighs(a.high, b.high) <= 0 ? a.high : b.high
    return interval(low, high)
  }

  /** True when the two intervals leave no gap between them, so they can be
   *  joined into one. `a` must start no later than `b`. */
  function connects(a: Interval<N>, b: Interval<N>): boolean {
    if (a.high.value === null || b.low.value === null) return true
    const c = A.compare(a.high.value, b.low.value)
    if (c !== 0) return c > 0
    return !(a.high.open && b.low.open)
  }

  /** The one interval covering both. Only meaningful when `connects` holds. */
  function join(a: Interval<N>, b: Interval<N>): Interval<N> {
    const low = compareLows(a.low, b.low) <= 0 ? a.low : b.low
    const high = compareHighs(a.high, b.high) >= 0 ? a.high : b.high
    return { low, high }
  }

  /** Orders two lower ends. An unbounded end comes first; at the same value a
   *  closed end comes before an open one. */
  function compareLows(a: Bound<N>, b: Bound<N>): number {
    if (a.value === null || b.value === null) {
      if (a.value === b.value) return closedFirst(a, b)
      return a.value === null ? -1 : 1
    }
    const c = A.compare(a.value, b.value)
    return c !== 0 ? c : closedFirst(a, b)
  }

  /** Orders two upper ends. An unbounded end comes last; at the same value an
   *  open end comes before a closed one, since it stops sooner. */
  function compareHighs(a: Bound<N>, b: Bound<N>): number {
    if (a.value === null || b.value === null) {
      if (a.value === b.value) return openFirst(a, b)
      return a.value === null ? 1 : -1
    }
    const c = A.compare(a.value, b.value)
    return c !== 0 ? c : openFirst(a, b)
  }

  return { interval, contains, isSingleton, compareIntervals, intersectIntervals, connects, join }
}

function closedFirst(a: Bound<unknown>, b: Bound<unknown>): number {
  if (a.open === b.open) return 0
  return a.open ? 1 : -1
}

function openFirst(a: Bound<unknown>, b: Bound<unknown>): number {
  if (a.open === b.open) return 0
  return a.open ? -1 : 1
}

export const {
  interval, contains, isSingleton, compareIntervals, intersectIntervals, connects, join,
} = makeIntervalOps(floatArith)
