// ─── Tilde Solver Tests ───────────────────────────────────────────────────────

import { describe, it, expect } from 'vitest'
import {
  run,
  assertPoint, assertPointExists, assertPointAt,
  assertSegment, assertSegmentLength,
  assertLine, assertLineEq,
  assertThrows,
} from './helpers.js'

describe('bare declarations', () => {
  it('point a — no explicit placements, solutions one', () => {
    const scene = run('point a')
    assertPointExists(scene, 'a')
    assertPoint(scene, 'a', 'one')
    expect(scene.points).toHaveLength(1)
    expect(scene.segments).toHaveLength(0)
  })

  it('segment ab — both vertices placed, segment exists', () => {
    const scene = run('segment ab')
    assertPoint(scene, 'a', 'one')
    assertPoint(scene, 'b', 'one')
    expect(scene.segments).toHaveLength(1)
    expect(scene.points).toHaveLength(2)
  })

  it('triangle abc — a and b placed, c is free, all three segments exist', () => {
    const scene = run('triangle abc')
    assertPoint(scene, 'a', 'one')
    assertPoint(scene, 'b', 'one')
    assertPoint(scene, 'c', 'infinite')
    assertSegment(scene, 'a', 'b')
    assertSegment(scene, 'b', 'c')
    assertSegment(scene, 'a', 'c')
    expect(scene.segments).toHaveLength(3)
    expect(scene.points).toHaveLength(3)
  })

  it('subscript triangle t — t_1 and t_2 placed, t_3 is free, all segments exist', () => {
    const scene = run('triangle t')
    assertPointExists(scene, 't_1')
    assertPointExists(scene, 't_2')
    assertPointExists(scene, 't_3')
    assertPoint(scene, 't_1', 'one')
    assertPoint(scene, 't_2', 'one')
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

describe('through syntax', () => {
  it('line through p is equivalent to point p on line', () => {
    // same geometry as the line intersection test above, written with through
    const scene = run([
      'line a = (1,0) through p',
      'line b = (0,1,-1) through p',
    ].join('\n'))
    assertPoint(scene, 'p', 'one')
    assertPointAt(scene, 'p', 1, 1)
  })

  it('line through point p — optional point keyword', () => {
    const scene = run([
      'line a = (1,0) through point p',
      'line b = (0,1,-1) through point p',
    ].join('\n'))
    assertPointAt(scene, 'p', 1, 1)
  })

  it('bare line through two explicit points — fully determines the line', () => {
    // line through (3,2) and (1,4): a=4-2=2, b=3-1=2, c=-(2·3+2·2)=-10 → 2x+2y-10=0
    const scene = run([
      'line l through a and b',
      'point a = (3, 2)',
      'point b = (1, 4)',
    ].join('\n'))
    assertLine(scene, 'l', 'one')
    assertLineEq(scene, 'l', 2, 2, -10)
  })

  it('comma separator works: line l through p, q', () => {
    const scene = run([
      'line l through a, b',
      'point a = (3, 2)',
      'point b = (1, 4)',
    ].join('\n'))
    assertLine(scene, 'l', 'one')
    assertLineEq(scene, 'l', 2, 2, -10)
  })

  it('standalone: l through p is equivalent to point p on l', () => {
    const scene = run([
      'line a = (1,0)',
      'line b = (0,1,-1)',
      'a through p',
      'b through p',
    ].join('\n'))
    assertPoint(scene, 'p', 'one')
    assertPointAt(scene, 'p', 1, 1)
  })
})

describe('bare line declarations', () => {
  it('bare line with no points — canonicalises to y = x (infinite)', () => {
    const scene = run('line l')
    assertLine(scene, 'l', 'infinite')
    assertLineEq(scene, 'l', 1, -1, 0)
  })

  it('bare line with 1 placed point — direction canonical (slope 1), position constrained (infinite)', () => {
    // point a = (3,2) on l → a=1, b=-1, c = -(3-2) = -1 → x - y - 1 = 0
    // direction was chosen canonically so dof=1 → solutions='infinite'
    const scene = run([
      'line l',
      'point a = (3, 2)',
      'point a on l',
    ].join('\n'))
    assertLine(scene, 'l', 'infinite')
    assertLineEq(scene, 'l', 1, -1, -1)
  })

  it('bare line with 2 placed points — fully determined (one)', () => {
    // point a=(3,2), b=(1,4): a=4-2=2, b=3-1=2, c=-(2·3+2·2)=-10 → 2x+2y-10=0 → x+y=5
    const scene = run([
      'line l',
      'point a = (3, 2)',
      'point b = (1, 4)',
      'point a on l',
      'point b on l',
    ].join('\n'))
    assertLine(scene, 'l', 'one')
    assertLineEq(scene, 'l', 2, 2, -10)
  })

  it('bare line with 2 points — intersection with a known line resolves correctly', () => {
    // line l through (3,2) and (1,4): x+y=5
    // line m = (0,1,-3): y=3
    // intersection: x=5-3=2, y=3 → p=(2,3)
    const scene = run([
      'line l',
      'point a = (3, 2)',
      'point b = (1, 4)',
      'point a on l',
      'point b on l',
      'line m = (0, 1, -3)',
      'point p on l',
      'p on m',
    ].join('\n'))
    assertPoint(scene, 'p', 'one')
    assertPointAt(scene, 'p', 2, 3)
  })
})

describe('partial line declarations', () => {
  // ── Default path: no constraining point, solver fills in a canonical value ────
  // The line's position/direction is arbitrary → solutions='infinite'

  it('slope-only (m,): no constraining point — line is infinite', () => {
    const scene = run([
      'line l = (1,)',
      'point p on l',
    ].join('\n'))
    assertLine(scene, 'l', 'infinite')
    assertPoint(scene, 'p', 'infinite')
  })

  it('direction-only 3-tuple (a,b,): no constraining point — line is infinite', () => {
    const scene = run([
      'line l = (0, 1,)',
      'point p on l',
    ].join('\n'))
    assertLine(scene, 'l', 'infinite')
    assertPoint(scene, 'p', 'infinite')
  })

  it('y-intercept-only (,b): no constraining point — line is infinite', () => {
    const scene = run([
      'line l = (,3)',
      'point p on l',
    ].join('\n'))
    assertLine(scene, 'l', 'infinite')
    assertPoint(scene, 'p', 'infinite')
  })

  // ── Constraint path: placed point fills in the missing parameter exactly ──────
  // The line becomes fully determined → solutions='one'
  // Verified by checking the resolved coefficients and placing a second point
  // at the intersection with a known full line.

  it('slope-only (m,): placed point constrains intercept → line resolved to one', () => {
    // line l = (1,) → a=1, b=-1, c=null
    // point a = (1,3) on l → c = -(1·1 + (-1)·3) = 2 → line: x - y + 2 = 0
    const scene = run([
      'line l = (1,)',
      'point a = (1, 3)',
      'point a on l',
    ].join('\n'))
    assertLine(scene, 'l', 'one')
    assertLineEq(scene, 'l', 1, -1, 2)
  })

  it('slope-only (m,): resolved line intersects a full line at a known point', () => {
    // line l = (1,) resolved to x - y + 2 = 0 (y = x+2) via point a=(1,3)
    // line m = (0,1,-5) → y = 5 (full)
    // intersection: x+2=5 → x=3 → p=(3,5)
    const scene = run([
      'line l = (1,)',
      'point a = (1, 3)',
      'point a on l',
      'line m = (0, 1, -5)',
      'point p on l',
      'p on m',
    ].join('\n'))
    assertPoint(scene, 'p', 'one')
    assertPointAt(scene, 'p', 3, 5)
  })

  it('direction-only 3-tuple (a,b,): placed point constrains position → line resolved to one', () => {
    // line l = (0,1,) → a=0, b=1, c=null (horizontal, unknown height)
    // point a = (3,5) on l → c = -(0·3 + 1·5) = -5 → line: y - 5 = 0
    const scene = run([
      'line l = (0, 1,)',
      'point a = (3, 5)',
      'point a on l',
    ].join('\n'))
    assertLine(scene, 'l', 'one')
    assertLineEq(scene, 'l', 0, 1, -5)
  })

  it('y-intercept-only (,b): placed point constrains slope → line resolved to one', () => {
    // line l = (,0) → a=null, b=-1, c=0 (passes through origin, unknown slope)
    // point a = (2,4) on l → a·2 + (-1)·4 + 0 = 0 → a = 2 → line: 2x - y = 0
    const scene = run([
      'line l = (,0)',
      'point a = (2, 4)',
      'point a on l',
    ].join('\n'))
    assertLine(scene, 'l', 'one')
    assertLineEq(scene, 'l', 2, -1, 0)
  })
})
