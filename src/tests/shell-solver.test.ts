// ─── Shell Solver ─────────────────────────────────────────────────────────────
// The shell reports what the constraints state outright and nothing more.

import { describe, it, expect } from 'vitest'
import { ShellSolver } from '../lang/solver/shell.js'
import type { ConstraintSet } from '../lang/solver/interface.js'

const empty = (): ConstraintSet => ({
  points: new Set(), segments: new Set(), lines: new Set(), circles: new Set(),
  scalars: new Set(), constraints: [], picks: new Map(),
})

describe('shell solver', () => {
  it('reports a point whose coordinates are both stated', () => {
    const cs: ConstraintSet = { ...empty(), points: new Set(['a', 'b']),
      constraints: [{ kind: 'position', point: 'a', x: 1, y: 2 }] }
    const r = new ShellSolver().solve(cs)
    expect(r.points.get('a')).toEqual({ solutions: [{ x: 1, y: 2 }], dof: 0 })
    expect(r.points.get('b')).toEqual({ solutions: undefined, dof: 2 })
  })

  it('leaves a point with one coordinate unknown', () => {
    const cs: ConstraintSet = { ...empty(), points: new Set(['a']),
      constraints: [{ kind: 'position', point: 'a', x: 1, y: null }] }
    expect(new ShellSolver().solve(cs).points.get('a')).toEqual({ solutions: undefined, dof: 2 })
  })

  it('reports a scalar given a number, and nothing for one that is not', () => {
    const cs: ConstraintSet = { ...empty(), scalars: new Set(['k', 'm']),
      constraints: [{ kind: 'scalar-equality', scalar: 'k', target: 5 }] }
    const r = new ShellSolver().solve(cs)
    expect(r.scalars.get('k')).toEqual({ solutions: [5], dof: 0 })
    expect(r.scalars.get('m')).toEqual({ solutions: undefined, dof: 1 })
  })

  it('passes segments through and leaves lines and circles unknown', () => {
    const cs: ConstraintSet = { ...empty(), segments: new Set(['a:b']), lines: new Set(['l']), circles: new Set(['c']) }
    const r = new ShellSolver().solve(cs)
    expect(r.segments).toEqual(new Set(['a:b']))
    expect(r.lines.get('l')).toEqual({ solutions: undefined, dof: 2 })
    expect(r.circles.get('c')).toEqual({ solutions: undefined, dof: 3 })
  })
})
