// ─── Geometric Solver — Internal Types ────────────────────────────────────────

import type { Scalar, Point, Line, Circle, Nullable } from '../interface.js'
export type { Scalar, Point, Line, Circle, Nullable }

// ── Internal working types (mutable, solver scratchpad) ───────────────────────
// `resolved` accumulates solutions as the solver runs:
//   • Always has at least one entry (the current working state at resolved[0]).
//   • resolved[0] fields are filled in incrementally — null ↔ number.
//   • Multiple entries = multiple discrete solutions (all non-null fields).
// `dof` tracks geometric degrees of freedom:
//   • 0 = fully determined (one or multiple discrete solutions).
//   • >0 = underconstrained (infinite solutions).  The value represents how many
//          parameters remain free due to canonical/default choices, not constraints.

export type WorkingElement<T> = {
  resolved: Nullable<T>[]
  dof: number
}

export type WorkingPoint  = WorkingElement<Point>
export type WorkingLine   = WorkingElement<Line>
export type WorkingCircle = WorkingElement<Circle>
export type WorkingScalar = WorkingElement<Scalar>

// ── Public output types (consumed by renderer) ────────────────────────────────
// `allSolutions` contains only complete (all non-null) solutions.
// `dof` is passed through from the working element unchanged.

export type GeomElement<T> = {
  allSolutions?: T[]
  dof: number
}

export type GeomPoint = GeomElement<Point>
export type GeomLine  = GeomElement<Line>

// ── Working element helpers ───────────────────────────────────────────────────

/** The current working state — first entry in resolved. */
export function workingVal<T>(w: WorkingElement<T>): Nullable<T> {
  return w.resolved[0]!
}

/** True if all fields in resolved[0] are non-null (structurally complete). */
export function isWorkingComplete<T>(w: WorkingElement<T>): boolean {
  return Object.values(w.resolved[0]!).every(v => v !== null)
}

/** Create a working point from nullable coordinates.
 *  dof = number of null fields (0 = fully placed, 1-2 = partially/fully unknown). */
export function makeWorkingPoint(x: number | null = null, y: number | null = null): WorkingPoint {
  const dof = (x === null ? 1 : 0) + (y === null ? 1 : 0)
  return { resolved: [{ x, y }], dof }
}

/** Create a working line from nullable coefficients.
 *  dof = number of null fields (0 = fully specified, 1 = one unknown). */
export function makeWorkingLine(a: number | null, b: number | null, c: number | null): WorkingLine {
  const nulls = (a === null ? 1 : 0) + (b === null ? 1 : 0) + (c === null ? 1 : 0)
  const dof = Math.min(nulls, 2)  // a line in 2D has at most 2 geometric DOF
  return { resolved: [{ a, b, c }], dof }
}

/** Create a working scalar — null value means unknown (dof=1). */
export function makeWorkingScalar(value: number | null = null): WorkingScalar {
  return { resolved: [value], dof: value === null ? 1 : 0 }
}

/** Create a working circle from nullable center ref and nullable radius.
 *  dof tracks parameters that aren't pinned by the declaration:
 *    no center, no r → 3 (center has 2, radius has 1)
 *    center, no r    → 1
 *    no center, r    → 2
 *    center, r       → 0 (placement of center handled by point machinery) */
export function makeWorkingCircle(center: string | null = null, r: number | null = null): WorkingCircle {
  const dof = (center === null ? 2 : 0) + (r === null ? 1 : 0)
  return { resolved: [{ center, r }], dof }
}

// ── Resolution state ──────────────────────────────────────────────────────────

export type PlacementState = {
  placed:           Set<string>
  orientationFixed: boolean
  hdX:              number   // heading for 1-locus circle placements
  hdY:              number
  isolatedSeedIdx:  number
}
