// ─── Interval ─────────────────────────────────────────────────────────────────
// One connected run of numbers. Each end is a Bound: a value and whether that
// end is open (not included) or closed (included). `value: null` means the end
// is unbounded, and an unbounded end is always open, since infinity is never in
// a set.
//
// Numbers are plain `number` for now. The arithmetic behind them is swapped
// later, through the Arith interface.

export type Bound = { value: number | null; open: boolean }
export type Interval = { low: Bound; high: Bound }

/** A lower end at `value`. `null` is unbounded below, and then always open. */
export const lowBound = (value: number | null, open = false): Bound =>
  value === null ? { value, open: true } : { value, open }

/** An upper end at `value`. `null` is unbounded above, and then always open. */
export const highBound = (value: number | null, open = false): Bound =>
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
export function isPoint(i: Interval): boolean {
  return i.low.value !== null && i.low.value === i.high.value
}

/** Orders intervals by where they start, then where they end. At the same
 *  value, a closed start comes before an open one, since it includes more. */
export function compareIntervals(a: Interval, b: Interval): number {
  return compareLows(a.low, b.low) || compareHighs(a.high, b.high)
}

function compareLows(a: Bound, b: Bound): number {
  if (a.value === b.value) return Number(a.open) - Number(b.open)
  if (a.value === null) return -1
  if (b.value === null) return 1
  return a.value - b.value
}

function compareHighs(a: Bound, b: Bound): number {
  // An open end stops sooner, so it comes first at the same value.
  if (a.value === b.value) return Number(b.open) - Number(a.open)
  if (a.value === null) return 1
  if (b.value === null) return -1
  return a.value - b.value
}
