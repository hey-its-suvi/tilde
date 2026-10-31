// ─── Shell Solver ─────────────────────────────────────────────────────────────
// The smallest solver that honours the seam. It reports only what the
// constraints state outright: a point with both coordinates given, a scalar
// given a number, a segment between them. It derives nothing, so anything that
// would need reasoning is left unknown.
//
// It is here to keep the language → solver → renderer path honest while the
// real solver is redesigned. It is not wired into `solveSource`.

import type {
  ConstraintSet, ElementResult, Circle, Line, Point, Scalar, SolveResult, SolverInterface,
} from './interface.js'

export class ShellSolver implements SolverInterface {
  solve(input: ConstraintSet): SolveResult {
    const points = new Map<string, ElementResult<Point>>()
    for (const key of input.points) points.set(key, { solutions: undefined, dof: 2 })
    for (const c of input.constraints) {
      if (c.kind === 'position' && c.x !== null && c.y !== null) {
        points.set(c.point, { solutions: [{ x: c.x, y: c.y }], dof: 0 })
      }
    }

    const scalars = new Map<string, ElementResult<Scalar>>()
    for (const name of input.scalars) scalars.set(name, { solutions: undefined, dof: 1 })
    for (const c of input.constraints) {
      if (c.kind === 'scalar-equality' && typeof c.target === 'number') {
        scalars.set(c.scalar, { solutions: [c.target], dof: 0 })
      }
    }

    const lines = new Map<string, ElementResult<Line>>()
    for (const name of input.lines) lines.set(name, { solutions: undefined, dof: 2 })

    const circles = new Map<string, ElementResult<Circle>>()
    for (const name of input.circles) circles.set(name, { solutions: undefined, dof: 3 })

    return { points, lines, circles, scalars, segments: input.segments }
  }
}
