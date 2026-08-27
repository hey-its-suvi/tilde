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

// ─── Geometry Primitives ─────────────────────────────────────────────────────

export type Scalar = number
export type Point  = { x: Scalar; y: Scalar }
export type Line   = { a: Scalar; b: Scalar; c: Scalar }  // ax + by + c = 0
/** A circle. `center` is a point-ref (key into model.points), not a literal
 *  point — this lets the existing point-placement machinery handle placement
 *  of the centre. */
export type Circle = { center: string; r: Scalar }

/** Makes every leaf of T nullable. Numbers and strings become `T | null`;
 *  object fields recurse. Used by the solver's working types to represent
 *  partial knowledge (e.g. a circle whose centre is known but radius isn't). */
export type Nullable<T> = T extends number
  ? T | null
  : T extends string
  ? T | null
  : { [K in keyof T]: Nullable<T[K]> }

// ─── Solver Output ───────────────────────────────────────────────────────────

/** What an element could be — the certainty states, made representable.
 *
 *      undefined   infinite: nothing pins it down, so it could be anything
 *      [a, b]      multiple: finitely many discrete answers
 *      [a]         one
 *      []          none: no possible answer, i.e. over-constrained
 *
 *  `undefined` and `[]` are opposites and were once the same value. Written as a
 *  set they behave properly under intersection: `undefined` is the identity and
 *  `[]` absorbs, so combining two elements known to be the same is just
 *  intersecting what each could be.
 *
 *  A contradiction is a *value* rather than a thrown error, which is what makes
 *  `[]` reachable at all — and lets the rest of a drawing survive one impossible
 *  part. */
export type Solutions<T> = T[] | undefined

export type ElementResult<T> = {
  solutions: Solutions<T>
  /** Geometric degrees of freedom remaining. 0 = fully determined. */
  dof: number
}

export type SolveResult = {
  points: Map<string, ElementResult<Point>>
  lines: Map<string, ElementResult<Line>>
  circles: Map<string, ElementResult<Circle>>
  scalars: Map<string, ElementResult<Scalar>>
  /** Passed through from input for the scene graph builder */
  segments: Set<string>
}

// ─── Solver Interface ────────────────────────────────────────────────────────

export interface SolverInterface {
  solve(input: ConstraintSet): SolveResult
}
