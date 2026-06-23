// ─── Tilde Solver — Circle Tests ──────────────────────────────────────────────
// Circle declarations, on-circle constraints, and cross-shape intersections
// (circle∩circle, circle∩line) that exercise the circle resolution path.

import { describe, it, expect } from 'vitest'
import {
  run,
  assertCircle,
  assertCircleStatus,
  assertPointAt,
  assertScalar,
  assertThrows,
} from './helpers.js'

describe('circle declarations', () => {
  it('bare circle — center at origin, radius 1', () => {
    const scene = run('circle c')
    assertCircle(scene, 'c', 0, 0, 1)
    // anonymous center should not appear in the rendered scene
    expect(scene.points.find(p => p.label.startsWith('_'))).toBeUndefined()
    // S-freedom was consumed by setting r = 1 → fully determined
    expect(scene.circles.find(c => c.label === 'c')!.solutions).toBe('one')
  })

  it('bare circle alongside a free point — radius is underconstrained', () => {
    // `point a` consumes T; anchor then uses R+S to place the circle's anon
    // center at (1, 0). No scale freedom is left for the radius, so r = 1 is
    // just a representative choice → circle renders as infinite.
    const scene = run([
      'point a',
      'circle c',
    ].join('\n'))
    expect(scene.circles.find(c => c.label === 'c')!.solutions).toBe('infinite')
  })

  it('bare line alongside bare circle — line wins T, circle center underdetermined', () => {
    // Both compete for translation gauge. The anonymous circle center yields,
    // letting the line consume T (canonical y = x through origin). The circle
    // then gets r = 1 from S, but its center stays unanchored → wavy.
    const scene = run([
      'line l',
      'circle c',
    ].join('\n'))
    expect(scene.lines.find(l => l.label === 'l')!.solutions).toBe('one')
    expect(scene.circles.find(c => c.label === 'c')!.solutions).toBe('infinite')
  })

  it('circle from named point and radius', () => {
    const scene = run([
      'point p = (2, 3)',
      'circle c = (p, 4)',
    ].join('\n'))
    assertCircle(scene, 'c', 2, 3, 4)
    assertPointAt(scene, 'p', 2, 3)
  })

  it('circle from inline center tuple', () => {
    const scene = run('circle c = ((1, 2), 5)')
    assertCircle(scene, 'c', 1, 2, 5)
    // anonymous center not in the scene
    expect(scene.points.find(p => p.label.startsWith('_'))).toBeUndefined()
  })

  it('circle radius from scalar reference', () => {
    const scene = run([
      'scalar r = 7',
      'circle c = ((0, 0), r)',
    ].join('\n'))
    assertCircle(scene, 'c', 0, 0, 7)
  })

  it('circle redeclaration throws', () => {
    assertThrows([
      'circle c = ((0, 0), 1)',
      'circle c = ((1, 1), 2)',
    ].join('\n'), 'already declared')
  })

  it('circle name conflicts with point throws', () => {
    assertThrows([
      'point c = (0, 0)',
      'circle c = (c, 1)',
    ].join('\n'), 'already declared')
  })
})

describe('circle with syntax', () => {
  it('with center=p binds center to a named point', () => {
    const scene = run([
      'circle c with center=p',
      'point p = (2, 3)',
    ].join('\n'))
    assertCircle(scene, 'c', 2, 3, 1)   // radius defaults to 1
    assertPointAt(scene, 'p', 2, 3)
  })

  it('with center p (no =) is equivalent to center=p', () => {
    const scene = run([
      'circle c with center p',
      'point p = (2, 3)',
    ].join('\n'))
    assertCircle(scene, 'c', 2, 3, 1)
  })

  it('with center declares the point if it does not exist', () => {
    // No `point p` — the circle's `with center p` declares it as a free point.
    const scene = run('circle c with center p')
    assertCircle(scene, 'c', 0, 0, 1)   // p anchored at origin, r defaults to 1
    assertPointAt(scene, 'p', 0, 0)
  })

  it('with center=(x, y) places an anonymous center', () => {
    const scene = run('circle c with center=(4, 1)')
    assertCircle(scene, 'c', 4, 1, 1)
    expect(scene.points.find(p => p.label.startsWith('_'))).toBeUndefined()
  })

  it('with radius=3 sets the radius, center defaults', () => {
    const scene = run('circle c with radius=3')
    assertCircle(scene, 'c', 0, 0, 3)
  })

  it('with radius 3 (no =)', () => {
    const scene = run('circle c with radius 3')
    assertCircle(scene, 'c', 0, 0, 3)
  })

  it('with diameter 6 sets radius to 3', () => {
    const scene = run('circle c with diameter 6')
    assertCircle(scene, 'c', 0, 0, 3)
  })

  it('with diameter=8 sets radius to 4', () => {
    const scene = run('circle c with diameter=8')
    assertCircle(scene, 'c', 0, 0, 4)
  })

  it('with center and diameter combined', () => {
    const scene = run([
      'point p = (1, 1)',
      'circle c with center p and diameter 6',
    ].join('\n'))
    assertCircle(scene, 'c', 1, 1, 3)
  })

  it('bundled: with diameter d = 6 declares scalar d (the diameter) and sets r=3', () => {
    const scene = run('circle c with diameter d = 6')
    assertCircle(scene, 'c', 0, 0, 3)
    assertScalar(scene, 'd', 6)
  })

  it('with diameter <scalar-ref> is rejected (literals only for now)', () => {
    assertThrows([
      'scalar d = 6',
      'circle c with diameter d',
    ].join('\n'), 'literal number')
  })

  it('with center and radius combined', () => {
    const scene = run([
      'circle c with center=p and radius=4',
      'point p = (1, 1)',
    ].join('\n'))
    assertCircle(scene, 'c', 1, 1, 4)
  })

  it('with center and radius — comma + no =', () => {
    const scene = run([
      'circle c with center p, radius 4',
      'point p = (1, 1)',
    ].join('\n'))
    assertCircle(scene, 'c', 1, 1, 4)
  })

  it('bundled: with center p = (5, 3) declares p AND places it', () => {
    const scene = run('circle c with center p = (5, 3) and radius 2')
    assertCircle(scene, 'c', 5, 3, 2)
    assertPointAt(scene, 'p', 5, 3)
  })

  it('bundled: with radius r = 4 declares scalar r', () => {
    const scene = run([
      'circle c with center=p and radius r = 4',
      'point p = (0, 0)',
    ].join('\n'))
    assertCircle(scene, 'c', 0, 0, 4)
    assertScalar(scene, 'r', 4)
  })

  it('bundled: both center and radius bundled', () => {
    const scene = run('circle c with center p = (2, 1) and radius r = 5')
    assertCircle(scene, 'c', 2, 1, 5)
    assertPointAt(scene, 'p', 2, 1)
    assertScalar(scene, 'r', 5)
  })

  it('double = is rejected: with center = p = (1, 2) throws', () => {
    assertThrows('circle c with center = p = (1, 2)', '')
  })

  it('double = is rejected: with radius = r = 3 throws', () => {
    assertThrows('circle c with radius = r = 3', '')
  })
})

describe('on-circle constraints', () => {
  it('point on circle — placed at radius from center', () => {
    const scene = run([
      'point a = (0, 0)',
      'circle c = (a, 5)',
      'point p',
      'p on c',
    ].join('\n'))
    const p = scene.points.find(p => p.label === 'p')!
    const dist = Math.sqrt(p.x * p.x + p.y * p.y)
    expect(dist).toBeCloseTo(5)
  })

  it('point on two circles — exact intersection', () => {
    const scene = run([
      'point a = (0, 0)',
      'point b = (4, 0)',
      'circle c1 = (a, 3)',
      'circle c2 = (b, 5)',
      'point p',
      'p on c1',
      'p on c2',
    ].join('\n'))
    // (0,0)-(4,0) with radii 3,5 → intersections satisfy x^2+y^2=9, (x-4)^2+y^2=25
    // → x = 0, y = ±3
    const ps = scene.points.filter(p => p.label === 'p')
    expect(ps.length).toBeGreaterThanOrEqual(1)
    for (const p of ps) {
      expect(p.x * p.x + p.y * p.y).toBeCloseTo(9)
      expect((p.x - 4) ** 2 + p.y * p.y).toBeCloseTo(25)
    }
  })

  it('point on circle and line — intersection', () => {
    const scene = run([
      'point a = (0, 0)',
      'circle c = (a, 5)',
      'line l = (0, 1, 0)',
      'point p',
      'p on c',
      'p on l',
    ].join('\n'))
    // Circle radius 5 at origin, line y = 0 → p at (±5, 0)
    const ps = scene.points.filter(p => p.label === 'p')
    expect(ps.length).toBeGreaterThanOrEqual(1)
    for (const p of ps) {
      expect(p.y).toBeCloseTo(0)
      expect(Math.abs(p.x)).toBeCloseTo(5)
    }
  })

  it('three points determine a circle — center and radius derived', () => {
    const scene = run([
      'point a = (1, 0)',
      'point b = (-1, 0)',
      'point c = (0, 1)',
      'circle k = (o, 1)',
      'point o',
      'a on k',
      'b on k',
      'c on k',
    ].join('\n'))
    // Three points (1,0), (-1,0), (0,1) lie on the unit circle centered at origin
    assertCircle(scene, 'k', 0, 0, 1)
    assertPointAt(scene, 'o', 0, 0)
  })

  it('explicit center with solver-derived radius from one point', () => {
    const scene = run([
      'scalar r',
      'point o = (0, 0)',
      'point p = (3, 4)',
      'circle k = (o, r)',
      'p on k',
    ].join('\n'))
    assertCircle(scene, 'k', 0, 0, 5)
    assertScalar(scene, 'r', 5)
  })

  // ── Under-constrained: bare circle through one or two placed points ─────────
  // Centre is anonymous; only 1 or 2 placed points pin the circle. Choose a
  // canonical centre so the circle visibly passes through the points, and
  // render the circle as wavy (its position is a representative choice).

  it('bare circle through one placed point — centre at origin, wavy', () => {
    // 3 placed points consume all gauges; only p is on c. Pick a canonical
    // centre at origin and derive r from there.
    const scene = run([
      'point p = (1, 2)',
      'point q = (2, 3)',
      'point r = (0, 5)',
      'circle c',
      'p on c',
    ].join('\n'))
    assertCircle(scene, 'c', 0, 0, Math.sqrt(5))
    assertCircleStatus(scene, 'c', 'infinite')
  })

  it('bare circle through two placed points — centre at midpoint, wavy', () => {
    // Smallest circle through both: centre at the chord midpoint.
    const scene = run([
      'point p = (1, 2)',
      'point q = (2, 3)',
      'point r = (0, 5)',
      'circle c',
      'p on c',
      'q on c',
    ].join('\n'))
    assertCircle(scene, 'c', 1.5, 2.5, Math.sqrt(0.5))
    assertCircleStatus(scene, 'c', 'infinite')
  })

  it('bare circle through one bare point — circle solid, point on the locus', () => {
    // Centre wins T-anchor (at origin); circle takes S for r=1; the bare
    // point is placed on the circle locus (wavy).
    const scene = run([
      'point p',
      'circle c',
      'p on c',
    ].join('\n'))
    assertCircle(scene, 'c', 0, 0, 1)
    assertCircleStatus(scene, 'c', 'one')
  })
})

describe('circle as point-on-locus stand-in', () => {
  // A circle in the LHS-of-on (or RHS-of-through) position acts as its centre
  // point. `c on l` ≡ `c.centre on l`. `l through c` desugars to the same.
  // Two circles can't relate this way — `c1 on c2` is rejected.

  it('c on l constrains the centre to lie on l', () => {
    // l is y = 0; circle c with named centre p; `c on l` puts p on l.
    // Combined with p's position from elsewhere, the constraint resolves.
    const scene = run([
      'line l = (0, 1, 0)',                   // y = 0
      'point p',
      'circle c = (p, 1)',
      'c on l',
    ].join('\n'))
    // p must be on l (y = 0). Its position along l comes from the anchor
    // canonicalisation; we only check the y coordinate here.
    const p = scene.points.find(pp => pp.label === 'p')!
    expect(p.y).toBeCloseTo(0)
  })

  it('l through c is equivalent to c on l', () => {
    const scene = run([
      'line l = (0, 1, 0)',
      'point p',
      'circle c = (p, 1)',
      'l through c',
    ].join('\n'))
    const p = scene.points.find(pp => pp.label === 'p')!
    expect(p.y).toBeCloseTo(0)
  })

  it('multi-target through with circles: l through c1, c2 — both centres on l', () => {
    const scene = run([
      'line l = (0, 1, 0)',
      'point p',
      'point q',
      'circle c1 = (p, 1)',
      'circle c2 = (q, 2)',
      'l through c1, c2',
    ].join('\n'))
    const p = scene.points.find(pp => pp.label === 'p')!
    const q = scene.points.find(pp => pp.label === 'q')!
    expect(p.y).toBeCloseTo(0)
    expect(q.y).toBeCloseTo(0)
  })

  it('c1 on c2 is rejected (circle-on-circle not supported)', () => {
    assertThrows([
      'point p',
      'point q',
      'circle c1 = (p, 1)',
      'circle c2 = (q, 2)',
      'c1 on c2',
    ].join('\n'), 'between two circles')
  })

  it('c1 through c2 is rejected', () => {
    assertThrows([
      'point p',
      'point q',
      'circle c1 = (p, 1)',
      'circle c2 = (q, 2)',
      'c1 through c2',
    ].join('\n'), 'between two circles')
  })

  it('using a circle name as a point position is rejected', () => {
    // `c = (3, 4)` is suspicious — c is already a circle, not a point.
    assertThrows([
      'point p',
      'circle c = (p, 1)',
      'c = (3, 4)',
    ].join('\n'), 'already declared as a circle')
  })
})
