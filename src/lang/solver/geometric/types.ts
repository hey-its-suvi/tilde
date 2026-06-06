// ─── Geometric Solver — Internal Types ────────────────────────────────────────

import type { Scalar, Point, Line, Nullable } from '../interface.js'
export type { Scalar, Point, Line, Nullable }

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

/** Create a working line from nullable coefficients. */
export function makeWorkingLine(a: number | null, b: number | null, c: number | null): WorkingLine {
  return { resolved: [{ a, b, c }], dof: lineDofFromState(a, b, c) }
}

/** Geometric DOF count for a line with the given coefficient state. A line in
 *  2D has at most 2 DOFs: direction (1) and position (1). The direction is
 *  determined by the (a, b) pair as a whole — having BOTH null counts as one
 *  unknown DOF, not two, because their ratio is what matters. */
export function lineDofFromState(a: number | null, b: number | null, c: number | null): number {
  const directionKnown = a !== null && b !== null
  const positionKnown = c !== null
  return (directionKnown ? 0 : 1) + (positionKnown ? 0 : 1)
}

/** Create a working scalar — null value means unknown (dof=1). */
export function makeWorkingScalar(value: number | null = null): WorkingScalar {
  return { resolved: [value], dof: value === null ? 1 : 0 }
}

// ── Resolution state ──────────────────────────────────────────────────────────

export type PlacementState = {
  placed:           Set<string>
  hdX:              number   // heading for 1-locus circle placements
  hdY:              number
  isolatedSeedIdx:  number
}

/** Build a fresh PlacementState from a model. The `placed` set is seeded with
 *  all points that already have both coordinates filled in. */
export function makePlacementState(model: { points: Map<string, WorkingPoint> }): PlacementState {
  const placed = new Set<string>()
  for (const [k, wp] of model.points) {
    if (isWorkingComplete(wp)) placed.add(k)
  }
  return { placed, hdX: 1, hdY: 0, isolatedSeedIdx: 0 }
}
