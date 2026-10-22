// ─── Interval ─────────────────────────────────────────────────────────────────
// One connected run of numbers. Each end is a Bound: a value and whether that
// end is open (not included) or closed (included). `value: null` means the end
// is unbounded, and an unbounded end is always open, since infinity is never in
// a set.
//
// Numbers are plain `number` for now. The arithmetic behind them is swapped
// later, through the Arith interface.

/** One end of an interval: where it is, and whether it is excluded. */
export type Bound = { value: number | null; open: boolean }
/** A connected run of numbers, from `low` to `high`. */
export type Interval = { low: Bound; high: Bound }

/** An end at `value`, open or closed. `null` is unbounded, and then always open. */
export const bound = (value: number | null, open = false): Bound =>
  value === null ? { value, open: true } : { value, open }

/** The interval from `low` to `high`, or `null` when no number lies in it. */
export function interval(low: Bound, high: Bound): Interval | null {
  if (low.value !== null && high.value !== null) {
    if (low.value > high.value) return null
    if (low.value === high.value && (low.open || high.open)) return null
  }
  return { low, high }
}

/** True when `x` lies inside the interval, respecting open and closed ends. */
export function contains(i: Interval, x: number): boolean {
  const { low, high } = i
  if (low.value !== null) {
    if (x < low.value || (x === low.value && low.open)) return false
  }
  if (high.value !== null) {
    if (x > high.value || (x === high.value && high.open)) return false
  }
  return true
}

/** True when the interval holds exactly one number, e.g. `[5, 5]`. */
export function isSingleton(i: Interval): boolean {
  return i.low.value !== null && i.low.value === i.high.value
}

/** Orders intervals by where they start, then where they end. At the same
 *  value, a closed start comes before an open one, since it includes more. */
export function compareIntervals(a: Interval, b: Interval): number {
  return compareLows(a.low, b.low) || compareHighs(a.high, b.high)
}

/** The numbers both intervals contain, or `null` when they share none. */
export function intersectIntervals(a: Interval, b: Interval): Interval | null {
  const low = compareLows(a.low, b.low) >= 0 ? a.low : b.low
  const high = compareHighs(a.high, b.high) <= 0 ? a.high : b.high
  return interval(low, high)
}

/** True when the two intervals leave no gap between them, so they can be
 *  joined into one. `a` must start no later than `b`. */
export function connects(a: Interval, b: Interval): boolean {
  if (a.high.value === null || b.low.value === null) return true
  if (a.high.value !== b.low.value) return a.high.value > b.low.value
  return !(a.high.open && b.low.open)
}

/** The one interval covering both. Only meaningful when `connects` holds. */
export function join(a: Interval, b: Interval): Interval {
  const low = compareLows(a.low, b.low) <= 0 ? a.low : b.low
  const high = compareHighs(a.high, b.high) >= 0 ? a.high : b.high
  return { low, high }
}

/** Orders two lower ends. An unbounded end comes first; at the same value a
 *  closed end comes before an open one. */
function compareLows(a: Bound, b: Bound): number {
  if (a.value === b.value) {
    if (a.open === b.open) return 0
    return a.open ? 1 : -1
  }
  if (a.value === null) return -1
  if (b.value === null) return 1
  return a.value < b.value ? -1 : 1
}

/** Orders two upper ends. An unbounded end comes last; at the same value an
 *  open end comes before a closed one, since it stops sooner. */
function compareHighs(a: Bound, b: Bound): number {
  if (a.value === b.value) {
    if (a.open === b.open) return 0
    return a.open ? -1 : 1
  }
  if (a.value === null) return 1
  if (b.value === null) return -1
  return a.value < b.value ? -1 : 1
}
