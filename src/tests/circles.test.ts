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
} from './helpers.js'

// A circle with nothing said about it has no centre in the definition syntax,
// and is not drawn — so these give it a free centre, `o`, by name.
const free = 'point o\ncircle c with center o'

describe('circle declarations', () => {
  it('a circle with a free centre is at the origin with radius 1', () => {
    const scene = run(free)
    assertCircle(scene, 'c', 0, 0, 1)
    expect(scene.circles.find(c => c.label === 'c')!.solutions).toBe('one')
  })

  it('after a free point, its radius is only a stand-in', () => {
    // The point takes where; turning and size then place the circle's centre,
    // and nothing is left to fix the radius — 1 is just a representative.
    const scene = run(`point a\n${free}`)
    assertCircleStatus(scene, 'c', 'infinite')
  })

  it('takes a named centre and a radius', () => {
    const scene = run('point p at 2 3\ncircle c with center p and radius 4')
    assertCircle(scene, 'c', 2, 3, 4)
    assertPointAt(scene, 'p', 2, 3)
  })

  it('takes a bracketed centre, which is not drawn', () => {
    const scene = run('circle c with center (1, 2) and radius 5')
    assertCircle(scene, 'c', 1, 2, 5)
    expect(scene.points).toHaveLength(0)
  })

  it('takes a named radius', () => {
    const scene = run('scalar r = 7\ncircle c with center (0, 0) and radius r')
    assertCircle(scene, 'c', 0, 0, 7)
  })
})

describe('on-circle constraints', () => {
  it('a point on a circle is at its radius from the centre', () => {
    const scene = run([
      'point a at 0 0',
      'circle c with center a and radius 5',
      'point p on c',
    ].join('\n'))
    const p = scene.points.find(p => p.label === 'p')!
    expect(Math.hypot(p.x, p.y)).toBeCloseTo(5)
  })

  it('a point on two circles is where they cross', () => {
    const scene = run([
      'point a at 0 0',
      'point b at 4 0',
      'circle c1 with center a and radius 3',
      'circle c2 with center b and radius 5',
      'point p on c1',
      'p on c2',
    ].join('\n'))
    // x² + y² = 9 and (x − 4)² + y² = 25 → x = 0, y = ±3
    const ps = scene.points.filter(p => p.label === 'p')
    expect(ps.length).toBeGreaterThanOrEqual(1)
    for (const p of ps) {
      expect(p.x * p.x + p.y * p.y).toBeCloseTo(9)
      expect((p.x - 4) ** 2 + p.y * p.y).toBeCloseTo(25)
    }
  })

  it('a point on a circle and a line is where they cross', () => {
    const scene = run([
      'point a at 0 0',
      'circle c with center a and radius 5',
      'line l through (0, 0) (1, 0)',
      'point p on c',
      'p on l',
    ].join('\n'))
    const ps = scene.points.filter(p => p.label === 'p')
    expect(ps.length).toBeGreaterThanOrEqual(1)
    for (const p of ps) {
      expect(p.y).toBeCloseTo(0)
      expect(Math.abs(p.x)).toBeCloseTo(5)
    }
  })

  it('three points fix a circle — its centre and radius are worked out', () => {
    const scene = run([
      'point a at 1 0',
      'point b at -1 0',
      'point c at 0 1',
      'point o',
      'scalar r',
      'circle k with center o and radius r',
      'a on k',
      'b on k',
      'c on k',
    ].join('\n'))
    assertCircle(scene, 'k', 0, 0, 1)
    assertPointAt(scene, 'o', 0, 0)
  })

  it('a known centre and one point on it give the radius', () => {
    const scene = run([
      'scalar r',
      'point o at 0 0',
      'point p at 3 4',
      'circle k with center o and radius r',
      'p on k',
    ].join('\n'))
    assertCircle(scene, 'k', 0, 0, 5)
    assertScalar(scene, 'r', 5)
  })

  it('through one free point — the circle is fixed and the point slides on it', () => {
    const scene = run(`point p\n${free}\np on c`)
    assertCircle(scene, 'c', 0, 0, 1)
    assertCircleStatus(scene, 'c', 'one')
  })
})
