// ─── Arith ────────────────────────────────────────────────────────────────────
// The arithmetic that scalars and intervals are built on, behind one interface.
// A backend supplies a number type `N` and these operations. Interval code uses
// nothing else, so an exact backend can replace the rounding float one without
// changing anything above it.
//
// Rounding is handled by the interval code, not by the operations: it takes
// each result and widens it with `below` or `above`, so an interval always
// contains the true answer. An exact backend makes `below` and `above` the
// identity.

export type Arith<N> = {
  /** The number for a written number such as `3` or `1.5`. */
  fromNumber(n: number): N
  add(a: N, b: N): N
  sub(a: N, b: N): N
  mul(a: N, b: N): N
  /** `b` must not be zero. Zero divisors are handled by the caller. */
  div(a: N, b: N): N
  /** `a` must not be negative. */
  sqrt(a: N): N
  /** -1, 0 or 1, for a before, equal to, or after b. */
  compare(a: N, b: N): -1 | 0 | 1
  /** The nearest number below `a`, or `a` itself when the backend is exact. */
  below(a: N): N
  /** The nearest number above `a`, or `a` itself when the backend is exact. */
  above(a: N): N
}
