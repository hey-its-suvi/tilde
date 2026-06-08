// ─── Numeric tolerance helpers ────────────────────────────────────────────────
// The shared epsilon used everywhere the solver compares floats. Higher-level
// geometric operations (intersections) live next to the strategy that uses
// them; only the tolerance predicates are shared.

const EPS = 1e-10

export function isZero(x: number, eps = EPS): boolean {
  return Math.abs(x) < eps
}

export function isEqual(a: number, b: number, eps = EPS): boolean {
  return Math.abs(a - b) < eps
}
