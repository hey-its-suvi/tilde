// ─── Shell Solver ──────────────────────────────────────────────────────────────
// A solver that solves nothing. It only merges facts that are directly about
// the same name — two `position` constraints on the same point, a named
// scalar bound to another element's field, two names declared the same
// number — and never derives one element from another (on-line, on-circle,
// distance, angle, parallel, perpendicular are accepted but narrow nothing).
//
// This exists so the lang↔solver and solver↔renderer boundary can move onto
// interval `Scalar`s without first rewriting the real geometric solver, which
// the old `model.ts` / `model-io.ts` / `propagate/` / `pick/` did and no
// longer compile against this interface. They stay in git history for
// whenever that rewrite happens.

import {
  ConstraintSet, SolveResult, SolverInterface, ResolvedConstraint,
  Point, Line, Circle, ConstraintError,
} from './interface.js'
import { wholeScalar, intersectScalars, type Scalar } from '../values/scalar.js'

type FieldBinding = { scalar: string; element: string; field: string }

export class ShellSolver implements SolverInterface {
  solve(input: ConstraintSet): SolveResult {
    const points = new Map<string, Point>()
    const lines = new Map<string, Line>()
    const circles = new Map<string, Circle>()
    const scalars = new Map<string, Scalar>()

    for (const key of input.points) points.set(key, { x: wholeScalar(), y: wholeScalar() })
    for (const name of input.lines) lines.set(name, { a: wholeScalar(), b: wholeScalar(), c: wholeScalar() })
    for (const name of input.circles) circles.set(name, { center: null, r: wholeScalar() })
    for (const name of input.scalars) scalars.set(name, wholeScalar())

    const pairs: { a: string; b: string }[] = []
    const bindings: FieldBinding[] = []

    for (const c of input.constraints) {
      applyDirect(c, points, lines, circles, scalars, pairs, bindings)
    }

    // Field bindings and equal-pairs can chain through each other (a scalar
    // bound to a field that's itself tied to another scalar), so run a
    // couple of fixed passes rather than just one — never an open-ended
    // propagate-to-fixpoint loop, just enough for a short chain to settle.
    for (let pass = 0; pass < 2; pass++) {
      for (const { a, b } of pairs) {
        const merged = intersectScalars(scalars.get(a)!, scalars.get(b)!)
        scalars.set(a, merged)
        scalars.set(b, merged)
      }
      for (const b of bindings) resolveBinding(b, points, lines, circles, scalars)
    }

    return { points, lines, circles, scalars, segments: input.segments }
  }
}

function applyDirect(
  c: ResolvedConstraint,
  points: Map<string, Point>,
  lines: Map<string, Line>,
  circles: Map<string, Circle>,
  scalars: Map<string, Scalar>,
  pairs: { a: string; b: string }[],
  bindings: FieldBinding[],
): void {
  switch (c.kind) {
    case 'position': {
      const p = points.get(c.point)
      if (!p) throw new ConstraintError(`point "${c.point}" is not declared`)
      if (c.x !== null) p.x = intersectScalars(p.x, c.x)
      if (c.y !== null) p.y = intersectScalars(p.y, c.y)
      break
    }
    case 'line-equation': {
      const l = lines.get(c.line)
      if (!l) throw new ConstraintError(`line "${c.line}" is not declared`)
      if (c.a !== null) l.a = intersectScalars(l.a, c.a)
      if (c.b !== null) l.b = intersectScalars(l.b, c.b)
      if (c.c !== null) l.c = intersectScalars(l.c, c.c)
      break
    }
    case 'circle-spec': {
      const circ = circles.get(c.circle)
      if (!circ) throw new ConstraintError(`circle "${c.circle}" is not declared`)
      if (c.center !== null) circ.center = c.center
      if (c.r !== null) circ.r = intersectScalars(circ.r, c.r)
      break
    }
    case 'scalar-equality': {
      if (!scalars.has(c.scalar)) throw new ConstraintError(`scalar "${c.scalar}" is not declared`)
      if (Array.isArray(c.target)) {
        scalars.set(c.scalar, intersectScalars(scalars.get(c.scalar)!, c.target))
      } else {
        bindings.push({ scalar: c.scalar, element: c.target.element, field: c.target.field })
      }
      break
    }
    case 'scalars-equal': {
      for (const name of [c.a, c.b]) {
        if (!scalars.has(name)) throw new ConstraintError(`scalar "${name}" is not declared`)
      }
      pairs.push({ a: c.a, b: c.b })
      break
    }
    // Relational — need real geometric derivation, which this solver never
    // does. Accepted so `ConstraintSet` doesn't change shape, narrows nothing.
    case 'on-line':
    case 'on-segment':
    case 'on-circle':
    case 'distance':
    case 'angle':
    case 'parallel':
    case 'perpendicular':
      break
  }
}

/** A field a scalar can be bound to: a point's x/y, a line's a/b/c, or a
 *  circle's r. A circle's `center` is a point-ref, not a Scalar, so it's not
 *  reachable here — nothing in the language binds a scalar to it. */
function getField(
  element: string, field: string,
  points: Map<string, Point>, lines: Map<string, Line>, circles: Map<string, Circle>,
): Scalar | undefined {
  const p = points.get(element)
  if (p) return field === 'x' ? p.x : field === 'y' ? p.y : undefined
  const l = lines.get(element)
  if (l) return field === 'a' ? l.a : field === 'b' ? l.b : field === 'c' ? l.c : undefined
  const circ = circles.get(element)
  if (circ) return field === 'r' ? circ.r : undefined
  return undefined
}

function setField(
  element: string, field: string, value: Scalar,
  points: Map<string, Point>, lines: Map<string, Line>, circles: Map<string, Circle>,
): void {
  const p = points.get(element)
  if (p) { if (field === 'x') p.x = value; else if (field === 'y') p.y = value; return }
  const l = lines.get(element)
  if (l) { if (field === 'a') l.a = value; else if (field === 'b') l.b = value; else if (field === 'c') l.c = value; return }
  const circ = circles.get(element)
  if (circ && field === 'r') circ.r = value
}

function resolveBinding(
  b: FieldBinding,
  points: Map<string, Point>,
  lines: Map<string, Line>,
  circles: Map<string, Circle>,
  scalars: Map<string, Scalar>,
): void {
  const fieldValue = getField(b.element, b.field, points, lines, circles)
  const scalarValue = scalars.get(b.scalar)
  if (fieldValue === undefined || scalarValue === undefined) return
  const merged = intersectScalars(fieldValue, scalarValue)
  scalars.set(b.scalar, merged)
  setField(b.element, b.field, merged, points, lines, circles)
}
