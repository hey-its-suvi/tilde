// ─── Solver Interface ─────────────────────────────────────────────────────────
// The contract between the elaboration layer and any solver implementation.
// A solver takes a ConstraintSet (what the user declared) and returns a
// SolveResult (where everything ended up). The solver knows nothing about
// the AST, renderer, or language syntax.
//
// Every leaf value crossing this boundary is a `Scalar` (`values/scalar.ts`)
// — a set of disjoint intervals, never a plain number — so "unknown",
// "contradiction", and "could be one of a few exact values" are all
// representable on their own, without a wrapper around the whole element.

import type { Scalar } from '../values/scalar.js'

export type { Scalar }

// ─── Errors ──────────────────────────────────────────────────────────────────

export class ConstraintError extends Error {
  constructor(message: string) {
    super(`[Constraint] ${message}`)
  }
}

// ─── Solver Input ────────────────────────────────────────────────────────────

/** A fully resolved, concrete constraint between named elements.
 *  All refs have been resolved to string keys. All units have been converted.
 *  This is pure math — no AST nodes, no syntax. */
export type ResolvedConstraint =
  | PositionConstraint
  | DistanceConstraint
  | AngleConstraint
  | OnLineConstraint
  | OnSegmentConstraint
  | OnCircleConstraint
  | LineEquationConstraint
  | CircleSpecConstraint
  | ParallelConstraint
  | PerpendicularConstraint
  | ScalarEqualityConstraint
  | ScalarsEqualConstraint

export type PositionConstraint = {
  kind: 'position'
  point: string
  x: Scalar | null
  y: Scalar | null
}

export type DistanceConstraint = {
  kind: 'distance'
  p1: string
  p2: string
  value: Scalar
}

export type AngleConstraint = {
  kind: 'angle'
  from: string
  vertex: string
  to: string
  degrees: Scalar
}

export type OnLineConstraint = {
  kind: 'on-line'
  point: string
  line: string
}

export type OnSegmentConstraint = {
  kind: 'on-segment'
  point: string
  s1: string
  s2: string
}

export type OnCircleConstraint = {
  kind: 'on-circle'
  point: string
  circle: string
}

export type LineEquationConstraint = {
  kind: 'line-equation'
  line: string
  a: Scalar | null
  b: Scalar | null
  c: Scalar | null
}

export type CircleSpecConstraint = {
  kind: 'circle-spec'
  circle: string
  /** Point ref (key into points) holding the centre, or null if unspecified. */
  center: string | null
  /** Radius value, or null if unspecified. */
  r: Scalar | null
}

export type ParallelConstraint = {
  kind: 'parallel'
  l1: string
  l2: string
  distance?: Scalar
}

export type PerpendicularConstraint = {
  kind: 'perpendicular'
  l1: string
  l2: string
}

export type ScalarEqualityConstraint = {
  kind: 'scalar-equality'
  scalar: string
  target: Scalar | { element: string; field: string }
}

/** Two named numbers are the same number. Not a copy in either direction —
 *  each is narrowed to what both could be, so the order they become known in
 *  does not matter and neither is privileged. */
export type ScalarsEqualConstraint = {
  kind: 'scalars-equal'
  a: string
  b: string
}

/** Everything the solver needs to solve a geometry problem.
 *  Produced by the elaboration layer from the AST. */
export type ConstraintSet = {
  /** All declared point keys (e.g. 'a', 'b', 't_1') */
  points: Set<string>
  /** All declared segment keys, canonical sorted pairs (e.g. 'a:b') */
  segments: Set<string>
  /** All declared line names (e.g. 'l', 'm') */
  lines: Set<string>
  /** All declared circle names (e.g. 'c') */
  circles: Set<string>
  /** All declared scalar names (e.g. 'm', 'k') */
  scalars: Set<string>
  /** Resolved constraints between elements */
  constraints: ResolvedConstraint[]
  /** User solution picks: element key → 1-based solution index. No current
   *  solver reads this — kept for whichever future solver can surface
   *  multiple solutions as whole, correlated elements again. */
  picks: Map<string, number>
}

/** The canonical key for a segment between two points — sorted, so `a:b` and
 *  `b:a` are the same segment under one key. */
export function segKey(v1: string, v2: string): string {
  return v1 < v2 ? `${v1}:${v2}` : `${v2}:${v1}`
}

// ─── Geometry Primitives ─────────────────────────────────────────────────────

export type Point = { x: Scalar; y: Scalar }
export type Line = { a: Scalar; b: Scalar; c: Scalar } // ax + by + c = 0
/** A circle. `center` is a point-ref (key into points), not a literal point —
 *  the same point may be independently constrained and drawn elsewhere, so it
 *  has to be the one shared record, not a copy. `null` until something says
 *  which point it is. */
export type Circle = { center: string | null; r: Scalar }

// ─── Solver Output ───────────────────────────────────────────────────────────

/** Everything the solver could work out, keyed by the name it was declared
 *  under. Every declared element gets an entry: its `Scalar` fields speak for
 *  themselves — whole is "unknown", `[]` is "no possible value", a singleton
 *  is "determined" — so there's no separate per-element wrapper, and nothing
 *  here reports degrees of freedom. A pass-through solver has none to report;
 *  a future geometric one can reintroduce that without changing these shapes. */
export type SolveResult = {
  points: Map<string, Point>
  lines: Map<string, Line>
  circles: Map<string, Circle>
  scalars: Map<string, Scalar>
  /** Passed through from input for the scene graph builder */
  segments: Set<string>
}

// ─── Solver Interface ────────────────────────────────────────────────────────

export interface SolverInterface {
  solve(input: ConstraintSet): SolveResult
}
