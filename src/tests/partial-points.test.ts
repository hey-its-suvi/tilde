// ─── Partial point exploration tests ──────────────────────────────────────────
// Drive minimal `point p = (5,)` cases through the solver to surface where the
// existing pipeline assumes points are fully placed. Some of these tests will
// fail in interesting ways — that's the point.

import { describe, it, expect } from 'vitest'
import { run, assertPoint, assertPointAt, assertPointCoords } from './helpers.js'

describe('partial point declarations (exploration)', () => {
  it('parses point p = (5,)', () => {
    // Should not throw at parse / elaborate time.
    expect(() => run('point p = (5,)')).not.toThrow()
  })

  it('parses point p = (,3)', () => {
    expect(() => run('point p = (,3)')).not.toThrow()
  })

  it('parses point p with scalar: point p = (s,); scalar s = 5', () => {
    expect(() => run('scalar s = 5\npoint p = (s,)')).not.toThrow()
  })

  it('point p = (5,) — solo: p still has y free, should render as underconstrained', () => {
    // The point has x pinned. y is unknown. Expectation: solutions = 'infinite',
    // dof = 1 (one axis free).
    const scene = run('point p = (5,)')
    assertPoint(scene, 'p', 'infinite')
  })

  it('point p = (5,) with later y-pin: point p = (5,); point p = (,3) → p at (5, 3)', () => {
    // Two partial declarations merge into a full position. This exercises the
    // merge logic in buildModel.
    const scene = run('point p = (5,)\npoint p = (,3)')
    assertPoint(scene, 'p', 'one')
    assertPointAt(scene, 'p', 5, 3)
  })

  it('point p = (5,) + point q = (,3) — two half-points, T should be fully consumed', () => {
    // p pins T-x at x=5; q pins T-y at y=3. Both render underconstrained.
    // Mostly we want this to NOT crash — correctness of underconstrained rendering
    // is what we're trying to expose cracks in.
    const scene = run('point p = (5,)\npoint q = (,3)')
    assertPoint(scene, 'p', 'infinite')
    assertPoint(scene, 'q', 'infinite')
  })

  it('point p = (5,) + point q free — q gets case-1 origin? what happens to T-x?', () => {
    // p has x=5, y null. T-x is consumed.
    // Bare q tries case-1 (T-full free). T-x is gone, so case-1 should fail.
    // What does the budget claimant do? This is the crack-exposure case.
    const scene = run('point p = (5,)\npoint q')
    assertPointCoords(scene, 'p', 5, 0)  // best-guess representative for p
    // q's expected behaviour is unclear — log whatever happens.
  })

  it('point p = (5,); line l = (3, 2); p on l → p resolves at (5, 17) via propagate', () => {
    // l = (3, 2) is slope-intercept: y = 3x + 2, so a=3, b=-1, c=2.
    // At x=5: y = 3·5 + 2 = 17. The synthetic axis-line x=5 plus user line l
    // form two complete lines on p; line∩line in propagate should fire.
    const scene = run([
      'point p = (5,)',
      'line l = (3, 2)',
      'p on l',
    ].join('\n'))
    assertPointAt(scene, 'p', 5, 17)
  })
})
