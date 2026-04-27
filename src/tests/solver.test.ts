// ─── Tilde Solver Tests ───────────────────────────────────────────────────────

import { describe, it, expect } from 'vitest'
import {
  run,
  assertPoint, assertPointExists, assertPointAt,
  assertSegment, assertSegmentLength,
  assertThrows,
} from './helpers.js'

describe('bare declarations', () => {
  it('point a — anchored at origin, solutions one', () => {
    const scene = run('point a')
    assertPointExists(scene, 'a')
    assertPoint(scene, 'a', 'one')
    expect(scene.points).toHaveLength(1)
    expect(scene.segments).toHaveLength(0)
  })

  it('segment ab — anchor is one, other vertex is infinite, one segment', () => {
    const scene = run('segment ab')
    // 'a' is the first free point, so it becomes the anchor: placed at origin, solutions='one'.
    // 'b' is placed relative to 'a' with no length constraint: solutions='infinite'.
    assertPoint(scene, 'a', 'one')
    assertPoint(scene, 'b', 'infinite')
    assertSegment(scene, 'a', 'b')
    expect(scene.segments).toHaveLength(1)
    expect(scene.points).toHaveLength(2)
  })

  it('triangle abc — anchor is one, other two vertices are infinite, three segments', () => {
    const scene = run('triangle abc')
    assertPoint(scene, 'a', 'one')
    assertPoint(scene, 'b', 'infinite')
    assertPoint(scene, 'c', 'infinite')
    assertSegment(scene, 'a', 'b')
    assertSegment(scene, 'b', 'c')
    assertSegment(scene, 'a', 'c')
    expect(scene.segments).toHaveLength(3)
    expect(scene.points).toHaveLength(3)
  })

  it('subscript triangle t — t_1 is anchor, t_2 and t_3 are infinite, three segments', () => {
    const scene = run('triangle t')
    assertPointExists(scene, 't_1')
    assertPointExists(scene, 't_2')
    assertPointExists(scene, 't_3')
    assertPoint(scene, 't_1', 'one')
    assertPoint(scene, 't_2', 'infinite')
    assertPoint(scene, 't_3', 'infinite')
    assertSegment(scene, 't_1', 't_2')
    assertSegment(scene, 't_2', 't_3')
    assertSegment(scene, 't_1', 't_3')
    expect(scene.segments).toHaveLength(3)
    expect(scene.points).toHaveLength(3)
  })
})

describe('length constraints', () => {
  it('segment ab = 3 — both endpoints placed, correct length', () => {
    const scene = run('segment ab = 3')
    // 'a' is anchor (one). 'b' is placed via circle from 'a' with dist=3;
    // orientationFixed=false at that moment so b also gets solutions='one'.
    assertPoint(scene, 'a', 'one')
    assertPoint(scene, 'b', 'one')
    assertSegmentLength(scene, 'a', 'b', 3)
  })

  it('3-4-5 triangle — all side lengths correct, c has two mirror solutions', () => {
    const scene = run([
      'triangle abc',
      'ab = 3',
      'bc = 4',
      'ac = 5',
    ].join('\n'))
    // a and b are fully determined (anchor + orientation fix)
    assertPoint(scene, 'a', 'one')
    assertPoint(scene, 'b', 'one')
    // c satisfies two circles — the triangle reflected across ab — neither picked
    assertPoint(scene, 'c', 'multiple')
    expect(scene.points.filter(p => p.label === 'c')).toHaveLength(2)
    // both solutions are valid 3-4-5 geometry; assertSegmentLength checks the first
    assertSegmentLength(scene, 'a', 'b', 3)
    assertSegmentLength(scene, 'b', 'c', 4)
    assertSegmentLength(scene, 'a', 'c', 5)
  })
})

describe('point declarations', () => {
  it('point a = (2,2); point b = (3,3) — both placed at given coordinates', () => {
    const scene = run('point a = (2,2)\npoint b = (3,3)')
    assertPointAt(scene, 'a', 2, 2)
    assertPointAt(scene, 'b', 3, 3)
  })

  it('segment ab with point a = (2,2) and point b = (3,3) — implicit vertices get placed', () => {
    const scene = run('segment ab\npoint a = (2,2)\npoint b = (3,3)')
    assertPointAt(scene, 'a', 2, 2)
    assertPointAt(scene, 'b', 3, 3)
    assertSegment(scene, 'a', 'b')
    assertSegmentLength(scene, 'a', 'b', Math.sqrt(2))
  })

  it('points declared before segment — same result regardless of order', () => {
    const scene = run('point a = (3,3)\npoint b = (2,2)\nsegment ab')
    assertPointAt(scene, 'a', 3, 3)
    assertPointAt(scene, 'b', 2, 2)
    assertSegment(scene, 'a', 'b')
    assertSegmentLength(scene, 'a', 'b', Math.sqrt(2))
  })
})

describe('error cases', () => {
  it('contradictory position declarations throw with "already placed"', () => {
    assertThrows('point a = (1,0)\npoint a = (2,0)', 'already placed')
  })
})

describe('line intersection', () => {
  it('point on two lines is placed at their intersection', () => {
    // line a = (1,0)    → 2-tuple: a=1, b=-1, c=0  → x - y = 0 → y = x
    // line b = (0,1,-1) → 3-tuple: a=0, b=1,  c=-1 → y - 1 = 0 → y = 1
    // intersection: x = y = 1, so p = (1, 1)
    const scene = run([
      'line a = (1,0)',
      'line b = (0,1,-1)',
      'point p on a',
      'p on b',
    ].join('\n'))
    assertPoint(scene, 'p', 'one')
    assertPointAt(scene, 'p', 1, 1)
  })
})
