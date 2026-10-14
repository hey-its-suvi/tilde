// ─── Tilde Solver Tests ───────────────────────────────────────────────────────
// How the solver places things, written in the definition syntax. A line whose
// position is given is written as the line through two placed points, since
// equations for lines (`line m = (1, 0, -2)`) went with the classic syntax.

import { describe, it, expect } from 'vitest'
import type { SceneGraph } from '@renderer/interface.js'
import {
  run,
  assertPoint, assertPointAt,
  assertSegment, assertSegmentLength,
  assertLine,
  assertThrows,
} from './helpers.js'

const lineOf = (scene: SceneGraph, label: string) => {
  const found = scene.lines.find(l => l.label === label)
  if (!found) throw new Error(`no line "${label}" (lines: ${scene.lines.map(l => l.label).join(', ')})`)
  return found
}
/** Whether (x, y) lies on the line ax + by + c = 0. */
const passesThrough = (l: { a: number; b: number; c: number }, x: number, y: number) =>
  expect(l.a * x + l.b * y + l.c).toBeCloseTo(0)
const parallel = (l: { a: number; b: number }, m: { a: number; b: number }) =>
  expect(l.a * m.b).toBeCloseTo(l.b * m.a)
const perpendicular = (l: { a: number; b: number }, m: { a: number; b: number }) =>
  expect(l.a * m.a + l.b * m.b).toBeCloseTo(0)

describe('bare declarations', () => {
  it('a free point is placed', () => {
    const scene = run('point a')
    assertPoint(scene, 'a', 'one')
    expect(scene.points).toHaveLength(1)
    expect(scene.segments).toHaveLength(0)
  })

  it('a segment between two free points places both', () => {
    const scene = run('point a\npoint b\nsegment a b')
    assertPoint(scene, 'a', 'one')
    assertPoint(scene, 'b', 'one')
    assertSegment(scene, 'a', 'b')
    expect(scene.points).toHaveLength(2)
  })

  it('a triangle places two corners and leaves the third free', () => {
    const scene = run('triangle t with a b c')
    assertPoint(scene, 'a', 'one')
    assertPoint(scene, 'b', 'one')
    assertPoint(scene, 'c', 'infinite')
    assertSegment(scene, 'a', 'b')
    assertSegment(scene, 'b', 'c')
    assertSegment(scene, 'a', 'c')
    expect(scene.segments).toHaveLength(3)
    expect(scene.points).toHaveLength(3)
  })
})

describe('lengths', () => {
  it('a distance between two free points is kept', () => {
    const scene = run('point a\npoint b\ndistance between a and b is 3')
    assertSegmentLength(scene, 'a', 'b', 3)
  })

  it('a 3-4-5 triangle leaves the third corner with two mirror positions', () => {
    const scene = run([
      'triangle t with a b c',
      'distance between a and b is 3',
      'distance between b and c is 4',
      'distance between a and c is 5',
    ].join('\n'))
    assertPoint(scene, 'a', 'one')
    assertPoint(scene, 'b', 'one')
    // c is on two circles — the triangle reflected across ab — and neither is chosen.
    assertPoint(scene, 'c', 'multiple')
    expect(scene.points.filter(p => p.label === 'c')).toHaveLength(2)
    assertSegmentLength(scene, 'a', 'b', 3)
    assertSegmentLength(scene, 'b', 'c', 4)
    assertSegmentLength(scene, 'a', 'c', 5)
  })
})

describe('placement', () => {
  it('places points where they are put', () => {
    const scene = run('point a at 2 2\npoint b = (3, 3)')
    assertPointAt(scene, 'a', 2, 2)
    assertPointAt(scene, 'b', 3, 3)
  })

  it('a segment between placed points has their distance', () => {
    const scene = run('point a at 2 2\npoint b at 3 3\nsegment a b')
    assertSegmentLength(scene, 'a', 'b', Math.sqrt(2))
  })

  it('refuses a point put in two different places', () => {
    assertThrows('point a at 1 0\na at 2 0', 'already placed')
  })
})

describe('lines through points', () => {
  it('a point on two lines is at their crossing', () => {
    const scene = run([
      'line a through (0, 0) (1, 1)',   // y = x
      'line b through (0, 1) (1, 1)',   // y = 1
      'point p on a',
      'p on b',
    ].join('\n'))
    assertPointAt(scene, 'p', 1, 1)
  })

  it('a line through two placed points is fixed', () => {
    const scene = run('point a at 3 2\npoint b at 1 4\nline l through a b')
    assertLine(scene, 'l', 'one')
    passesThrough(lineOf(scene, 'l'), 3, 2)
    passesThrough(lineOf(scene, 'l'), 1, 4)
  })

  it('says it a point at a time, to a line that already exists', () => {
    const scene = run('point a at 3 2\npoint b at 1 4\nline l\nl through a\nl through b')
    assertLine(scene, 'l', 'one')
    passesThrough(lineOf(scene, 'l'), 3, 2)
    passesThrough(lineOf(scene, 'l'), 1, 4)
  })
})

describe('bare lines', () => {
  it('a line on its own is y = x', () => {
    const scene = run('line l')
    assertLine(scene, 'l', 'one')
    passesThrough(lineOf(scene, 'l'), 0, 0)
    passesThrough(lineOf(scene, 'l'), 1, 1)
  })

  it('beside one unrelated placed point it is still fixed', () => {
    // The point fixes where things are; turning and size are still free, and
    // the line uses them.
    const scene = run('line l\npoint a at 3 2')
    assertLine(scene, 'l', 'one')
  })

  it('beside two unrelated placed points it is free', () => {
    // Two placed points fix where, which way and how big. Nothing is left to
    // decide the line, so any line would do.
    const scene = run('line l\npoint a at 1 2\npoint b at 3 4')
    assertLine(scene, 'l', 'infinite')
  })

  it('through one placed point it can still turn', () => {
    const scene = run('line l\npoint a at 3 2\na on l')
    assertLine(scene, 'l', 'infinite')
    passesThrough(lineOf(scene, 'l'), 3, 2)
  })

  it('through two placed points it is fixed', () => {
    const scene = run('line l\npoint a at 3 2\npoint b at 1 4\na on l\nb on l')
    assertLine(scene, 'l', 'one')
    passesThrough(lineOf(scene, 'l'), 3, 2)
    passesThrough(lineOf(scene, 'l'), 1, 4)
  })

  it('once fixed, it crosses another line where it should', () => {
    // l: x + y = 5; m: y = 3; they cross at (2, 3).
    const scene = run([
      'line l',
      'point a at 3 2',
      'point b at 1 4',
      'a on l',
      'b on l',
      'line m through (0, 3) (1, 3)',
      'point p on l',
      'p on m',
    ].join('\n'))
    assertPointAt(scene, 'p', 2, 3)
  })
})

describe('parallel and perpendicular', () => {
  it('a parallel line takes the other one’s direction', () => {
    const scene = run('line m through (0, 0) (1, 1)\nline a\na parallel m')
    parallel(lineOf(scene, 'a'), lineOf(scene, 'm'))
  })

  it('direction from the parallel, position from a point', () => {
    const scene = run([
      'line m through (0, 0) (1, 0)',   // y = 0
      'point p at 0 3',
      'line n parallel m through p',
    ].join('\n'))
    assertLine(scene, 'n', 'one')
    passesThrough(lineOf(scene, 'n'), 0, 3)
    passesThrough(lineOf(scene, 'n'), 5, 3)
  })

  it('a perpendicular line is turned a quarter turn', () => {
    const scene = run('line m through (0, 0) (0, 1)\nline l\nl perpendicular m')
    perpendicular(lineOf(scene, 'l'), lineOf(scene, 'm'))
  })

  it('a perpendicular to a slanted line is turned a quarter turn too', () => {
    const scene = run('line m through (0, 0) (1, 2)\nline l\nl perpendicular m')
    perpendicular(lineOf(scene, 'l'), lineOf(scene, 'm'))
  })

  it('perpendicular at a point puts the point on both', () => {
    const scene = run('line m through (2, 0) (2, 1)\nline l\npoint p\nl perpendicular m at p')
    const p = scene.points.find(q => q.label === 'p')!
    passesThrough(lineOf(scene, 'm'), p.x, p.y)
    passesThrough(lineOf(scene, 'l'), p.x, p.y)
    perpendicular(lineOf(scene, 'l'), lineOf(scene, 'm'))
  })

  it('perpendicular at a placed point fixes the line', () => {
    const scene = run('line m through (2, 0) (2, 1)\npoint p at 2 5\nline l\nl perpendicular m at p')
    assertLine(scene, 'l', 'one')
    passesThrough(lineOf(scene, 'l'), 2, 5)
    passesThrough(lineOf(scene, 'l'), 7, 5)
  })

  it('perpendicular at a bracketed point, which is not drawn', () => {
    const scene = run('line m through (2, 0) (2, 1)\nline l\nl perpendicular m at (2, 5)')
    passesThrough(lineOf(scene, 'l'), 2, 5)
    perpendicular(lineOf(scene, 'l'), lineOf(scene, 'm'))
    expect(scene.points.filter(p => p.label === 'p')).toHaveLength(0)
  })

  it('parallel at a distance has two answers, one each side', () => {
    const scene = run('line m through (0, 0) (1, 0)\nline l\nl parallel m at 3')
    const ls = scene.lines.filter(l => l.label === 'l')
    expect(ls).toHaveLength(2)
    expect(ls.every(l => l.solutions === 'multiple')).toBe(true)
    // y = 3 and y = -3, whichever way round the coefficients come out.
    const ys = ls.map(l => -l.c / l.b).sort((a, b) => a - b)
    expect(ys[0]).toBeCloseTo(-3)
    expect(ys[1]).toBeCloseTo(3)
  })

  it('parallel at a distance to a slanted line keeps the distance', () => {
    const scene = run('line m through (0, 0) (1, 1)\nline l\nl parallel m at 3')
    const ls = scene.lines.filter(l => l.label === 'l')
    expect(ls).toHaveLength(2)
    for (const l of ls) {
      // Distance from the origin, which is on m.
      expect(Math.abs(l.c) / Math.hypot(l.a, l.b)).toBeCloseTo(3)
      parallel(l, lineOf(scene, 'm'))
    }
  })
})
