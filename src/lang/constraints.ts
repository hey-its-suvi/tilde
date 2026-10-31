// ─── Constraints ─────────────────────────────────────────────────────────────
// What the language says about a program, in terms that belong to no solver:
// named elements and the relations between them. The language builds this;
// the solver reads it. Nothing here imports from the solver.

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
  x: number | null
  y: number | null
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

export type OnCircleConstraint = {
  kind: 'on-circle'
  point: string
  circle: string
}

export type LineEquationConstraint = {
  kind: 'line-equation'
  line: string
  a: number | null
  b: number | null
  c: number | null
}

export type CircleSpecConstraint = {
  kind: 'circle-spec'
  circle: string
  /** Point ref (key into points) holding the centre, or null if unspecified. */
  center: string | null
  /** Radius value, or null if unspecified. */
  r: number | null
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

export type ScalarEqualityConstraint = {
  kind: 'scalar-equality'
  scalar: string
  target: number | { element: string; field: string }
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
  /** User solution picks: element key → 1-based solution index */
  picks: Map<string, number>
}

/** A segment key: the two point names in order, joined by a colon. */
export function segKey(v1: string, v2: string): string {
  return v1 < v2 ? `${v1}:${v2}` : `${v2}:${v1}`
}
