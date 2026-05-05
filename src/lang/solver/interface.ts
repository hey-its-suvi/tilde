// ─── Solver Interface ─────────────────────────────────────────────────────────
// The contract between the elaboration layer and any solver implementation.
// A solver takes a ConstraintSet (what the user declared) and returns a
// SolveResult (where everything ended up). The solver knows nothing about
// the AST, renderer, or language syntax.

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
  | LineEquationConstraint
  | ParallelConstraint
  | PerpendicularConstraint

export type PositionConstraint = {
  kind: 'position'
  point: string
  x: number
  y: number
}

export type DistanceConstraint = {
  kind: 'distance'
  p1: string
  p2: string
  value: number
}

export type AngleConstraint = {
  kind: 'angle'
  from: string
  vertex: string
  to: string
  degrees: number
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

export type LineEquationConstraint = {
  kind: 'line-equation'
  line: string
  a: number | null
  b: number | null
  c: number | null
}

export type ParallelConstraint = {
  kind: 'parallel'
  l1: string
  l2: string
  distance?: number
}

export type PerpendicularConstraint = {
  kind: 'perpendicular'
  l1: string
  l2: string
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
  /** Resolved constraints between elements */
  constraints: ResolvedConstraint[]
  /** User solution picks: element key → 1-based solution index */
  picks: Map<string, number>
}

// ─── Geometry Primitives ─────────────────────────────────────────────────────

export type Point = { x: number; y: number }
export type Line  = { a: number; b: number; c: number }  // ax + by + c = 0

// ─── Solver Output ───────────────────────────────────────────────────────────

/** Result for a single element. If picked or unique, solutions has length 1.
 *  If ambiguous and unpicked, solutions has length 2+. */
export type ElementResult<T> = {
  solutions: T[]
  /** Geometric degrees of freedom remaining. 0 = fully determined. */
  dof: number
}

export type SolveResult = {
  points: Map<string, ElementResult<Point>>
  lines: Map<string, ElementResult<Line>>
  /** Passed through from input for the scene graph builder */
  segments: Set<string>
}

// ─── Solver Interface ────────────────────────────────────────────────────────

export interface Solver {
  solve(input: ConstraintSet): SolveResult
}
