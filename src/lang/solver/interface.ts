// ─── Solver Interface ─────────────────────────────────────────────────────────
// The contract between the elaboration layer and any solver implementation.
// A solver takes a ConstraintSet (what the user declared) and returns a
// SolveResult (where everything ended up). The solver knows nothing about
// the AST, renderer, or language syntax.

import type { ConstraintSet } from "../constraints.js"
export { ConstraintError } from "../constraints.js"
export type {
  ResolvedConstraint, PositionConstraint, DistanceConstraint, AngleConstraint,
  OnLineConstraint, OnSegmentConstraint, OnCircleConstraint, LineEquationConstraint,
  CircleSpecConstraint, ParallelConstraint, PerpendicularConstraint,
  ScalarEqualityConstraint, ScalarsEqualConstraint, ConstraintSet,
} from "../constraints.js"

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
