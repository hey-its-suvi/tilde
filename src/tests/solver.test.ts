// ─── Tilde Solver Tests ───────────────────────────────────────────────────────

import { describe, it, expect } from 'vitest'
import {
  run,
  assertPoint, assertPointExists, assertPointAt,
  assertSegment, assertSegmentLength,
  assertLine, assertLineEq,
  assertScalar,
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

describe('multi-target on', () => {
  it('p on l and m — point on two lines with and', () => {
    const scene = run([
      'line a = (1,0)',
      'line b = (0,1,-1)',
      'point p on a and b',
    ].join('\n'))
    assertPoint(scene, 'p', 'one')
    assertPointAt(scene, 'p', 1, 1)
  })

  it('p on l, m — point on two lines with comma', () => {
    const scene = run([
      'line a = (1,0)',
      'line b = (0,1,-1)',
      'point p on a, b',
    ].join('\n'))
    assertPoint(scene, 'p', 'one')
    assertPointAt(scene, 'p', 1, 1)
  })

  it('backtracking: in a with list, p on l and ab = 3 does not eat ab as a second on-target', () => {
    // `p on l and ab = 3` must parse as two constraints: [on(p,l), length(ab,3)]
    // The backtracking detects that `ab` is followed by `=` and stops target collection.
    const scene = run([
      'line l = (0,1,-1)',
      'segment ab with a = (0,0) and p on l and ab = 3',
    ].join('\n'))
    assertSegmentLength(scene, 'a', 'b', 3)
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
  it('bare line with no points — canonicalises to y = x, fully anchored', () => {
    const scene = run('line l')
    assertLine(scene, 'l', 'one')
    assertLineEq(scene, 'l', 1, -1, 0)
  })

  it('bare line + fixed point, not connected — line is underconstrained', () => {
    // point a fixes T. R+S free → absorb direction + distance → dof=0
    // But this should still be 'one' because all DOFs are absorbed
    const scene = run([
      'line l',
      'point a = (3, 2)',
    ].join('\n'))
    assertLine(scene, 'l', 'one')
    assertLineEq(scene, 'l', 1, -1, 0)
  })

  it('bare line + 2 fixed points, not connected — line is underconstrained', () => {
    // 2 fixed points → T+R+S all fixed. Line is genuinely free (dof=2)
    const scene = run([
      'line l',
      'point a = (1, 2)',
      'point b = (3, 4)',
    ].join('\n'))
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

describe('with slope/intercept syntax', () => {
  it('slope only — same as (m,) form', () => {
    // line l with slope=1 → a=1, b=-1, c=null
    // point a=(1,3) on l → c = -(1·1 + (-1)·3) = 2 → line: x - y + 2 = 0
    const scene = run([
      'line l with slope=1',
      'point a = (1, 3)',
      'point a on l',
    ].join('\n'))
    assertLine(scene, 'l', 'one')
    assertLineEq(scene, 'l', 1, -1, 2)
  })

  it('intercept only — same as (,k) form', () => {
    // line l with intercept=0 → a=null, b=-1, c=0 (passes through origin)
    // point a=(2,4) on l → a = 2 → line: 2x - y = 0
    const scene = run([
      'line l with intercept=0',
      'point a = (2, 4)',
      'point a on l',
    ].join('\n'))
    assertLine(scene, 'l', 'one')
    assertLineEq(scene, 'l', 2, -1, 0)
  })

  it('slope and intercept — fully determines the line', () => {
    // line l with slope=2 and intercept=1 → y = 2x + 1 → 2x - y + 1 = 0
    const scene = run('line l with slope=2 and intercept=1')
    assertLine(scene, 'l', 'one')
    assertLineEq(scene, 'l', 2, -1, 1)
  })

  it('slope and intercept with comma separator', () => {
    const scene = run('line l with slope=2, intercept=1')
    assertLine(scene, 'l', 'one')
    assertLineEq(scene, 'l', 2, -1, 1)
  })

  it('with slope and through point — line fully resolved', () => {
    // slope=1 fixes direction, through a=(1,3) solves c: c = -(1-3) = 2
    const scene = run([
      'line l with slope=1 through a',
      'point a = (1, 3)',
    ].join('\n'))
    assertLine(scene, 'l', 'one')
    assertLineEq(scene, 'l', 1, -1, 2)
  })

  it('slope without = — same as with =', () => {
    // `with slope 2` should parse identically to `with slope=2`.
    const scene = run('line l with slope 2 and intercept 1')
    assertLine(scene, 'l', 'one')
    assertLineEq(scene, 'l', 2, -1, 1)
  })

  it('intercept without = — same as with =', () => {
    const scene = run([
      'line l with intercept 0',
      'point a = (2, 4)',
      'point a on l',
    ].join('\n'))
    assertLine(scene, 'l', 'one')
    assertLineEq(scene, 'l', 2, -1, 0)
  })

  it('mixed = and no-= in the same with clause', () => {
    const scene = run('line l with slope 2, intercept=1')
    assertLine(scene, 'l', 'one')
    assertLineEq(scene, 'l', 2, -1, 1)
  })

  it('bundled: with slope s = 3 declares scalar s and uses it', () => {
    // `line l with slope s = 3` desugars to `scalar s = 3; line l with slope=s`.
    const scene = run('line l with slope s = 3')
    assertLine(scene, 'l', 'one')
    assertLineEq(scene, 'l', 3, -1, 0)
    assertScalar(scene, 's', 3)
  })

  it('bundled: with intercept k = 5 declares scalar k', () => {
    const scene = run([
      'line l with intercept k = 5',
      'point a = (2, 5)',
      'point a on l',
    ].join('\n'))
    assertLineEq(scene, 'l', 0, -1, 5)
    assertScalar(scene, 'k', 5)
  })

  it('bundled: slope and intercept both bundled', () => {
    const scene = run('line l with slope m = 2 and intercept k = 1')
    assertLineEq(scene, 'l', 2, -1, 1)
    assertScalar(scene, 'm', 2)
    assertScalar(scene, 'k', 1)
  })

  it('double = is rejected: with slope = s = 3 throws', () => {
    assertThrows('line l with slope = s = 3', '')
  })
})

describe('parallel and perpendicular', () => {
  it('a parallel m — a gets same direction as m', () => {
    // m: y = x → x - y = 0 → (1, -1, 0); a should have same direction
    const scene = run([
      'line m = (1, -1, 0)',
      'line a',
      'a parallel m',
    ].join('\n'))
    const lm = scene.lines.find(l => l.label === 'm')!
    const la = scene.lines.find(l => l.label === 'a')!
    expect(la).toBeTruthy()
    // Same direction: a.a/m.a == a.b/m.b  →  a.a * m.b == a.b * m.a
    expect(la.a * lm.b).toBeCloseTo(la.b * lm.a)
  })

  it('line a parallel line m — with optional line hints', () => {
    const scene = run([
      'line m = (1, -1, 0)',
      'line a parallel line m',
    ].join('\n'))
    const lm = scene.lines.find(l => l.label === 'm')!
    const la = scene.lines.find(l => l.label === 'a')!
    expect(la.a * lm.b).toBeCloseTo(la.b * lm.a)
  })

  it('parallel through point — direction from m, position from through-point', () => {
    // m: y = 0; n parallel m through p=(0,3) → n: y = 3 → (0, 1, -3) normalized → (0, -1, 3)
    // Actually: m=(0,1,0), parallel copies a=0,b=1; p=(0,3) on n → c = -(0*0 + 1*3) = -3
    const scene = run([
      'line m = (0, 1, 0)',
      'line n through p',
      'n parallel m',
      'point p = (0, 3)',
    ].join('\n'))
    assertLine(scene, 'n', 'one')
    const ln = scene.lines.find(l => l.label === 'n')!
    // n is parallel to m (y-direction), through p=(0,3): 0*x + 1*y - 3 = 0
    expect(ln.a).toBeCloseTo(0)
    expect(ln.b).toBeCloseTo(1)
    expect(ln.c).toBeCloseTo(-3)
  })

  it('l perpendicular m — direction rotated 90°', () => {
    // m: x = 0 (vertical) → (1, 0, 0); l ⊥ m should be horizontal → (0, 1, *)
    const scene = run([
      'line m = (1, 0, 0)',
      'line l',
      'l perpendicular m',
    ].join('\n'))
    const ll = scene.lines.find(l => l.label === 'l')!
    const lm = scene.lines.find(l => l.label === 'm')!
    // Perpendicular: direction vectors orthogonal → a_l * a_m + b_l * b_m = 0
    // (this follows from: direction of line ax+by+c=0 is (-b, a))
    expect(ll.a * lm.a + ll.b * lm.b).toBeCloseTo(0)
  })

  it('l perpendicular m — oblique case', () => {
    // m: y = 2x → 2x - y = 0 → (2, -1, 0); l ⊥ m: direction = (m.b, -m.a) = (-1, -2)
    const scene = run([
      'line m = (2, -1, 0)',
      'line l',
      'l perpendicular m',
    ].join('\n'))
    const ll = scene.lines.find(l => l.label === 'l')!
    const lm = scene.lines.find(l => l.label === 'm')!
    expect(ll.a * lm.a + ll.b * lm.b).toBeCloseTo(0)
  })

  it('l perpendicular m at p — p placed at intersection', () => {
    // m: x = 2 (vertical); l ⊥ m → l horizontal; p on both
    // l gets canonical c=0 (y=0), then p = intersection(l, m) = (2, 0)
    const scene = run([
      'line m = (1, 0, -2)',
      'line l perpendicular m at p',
    ].join('\n'))
    const pt = scene.points.find(p => p.label === 'p')!
    const ll = scene.lines.find(l => l.label === 'l')!
    const lm = scene.lines.find(l => l.label === 'm')!
    expect(pt).toBeTruthy()
    // p lies on m: a_m * p.x + b_m * p.y + c_m ≈ 0
    expect(lm.a * pt.x + lm.b * pt.y + lm.c).toBeCloseTo(0)
    // p lies on l
    expect(ll.a * pt.x + ll.b * pt.y + ll.c).toBeCloseTo(0)
    // l ⊥ m
    expect(ll.a * lm.a + ll.b * lm.b).toBeCloseTo(0)
  })

  it('l perpendicular m at p with p placed — l fully resolved', () => {
    // p placed at (2, 5) → l perpendicular to m=(1,0,-2) through p
    // l direction: (m.b, -m.a) = (0, -1); c = -(0*2 + (-1)*5) = 5
    const scene = run([
      'line m = (1, 0, -2)',
      'point p = (2, 5)',
      'line l perpendicular m at p',
    ].join('\n'))
    assertLine(scene, 'l', 'one')
    const ll = scene.lines.find(l => l.label === 'l')!
    // l: 0*x - 1*y + 5 = 0 → y = 5
    expect(ll.a).toBeCloseTo(0)
    expect(ll.b).toBeCloseTo(-1)
    expect(ll.c).toBeCloseTo(5)
  })

  it('l parallel m at 3 — two solutions at distance 3', () => {
    // m: y = 0 → (0, 1, 0); l parallel m at distance 3
    // l gets a=0, b=1; two c values: c = 0 ± 3*sqrt(0+1) = ±3
    // y = -3 (c=3) and y = 3 (c=-3)
    const scene = run([
      'line m = (0, 1, 0)',
      'line l',
      'l parallel m at 3',
    ].join('\n'))
    const ls = scene.lines.filter(l => l.label === 'l')
    expect(ls).toHaveLength(2)
    expect(ls[0]!.solutions).toBe('multiple')
    expect(ls[1]!.solutions).toBe('multiple')
    const cs = ls.map(l => l.c).sort((a, b) => a - b)
    expect(cs[0]).toBeCloseTo(-3)
    expect(cs[1]).toBeCloseTo(3)
  })

  it('l parallel m at 3 — oblique m, distances are correct', () => {
    // m: x - y = 0 → (1, -1, 0); norm = sqrt(2)
    // delta = 3 * sqrt(2); c values: 0 ± 3*sqrt(2)
    const scene = run([
      'line m = (1, -1, 0)',
      'line l',
      'l parallel m at 3',
    ].join('\n'))
    const ls = scene.lines.filter(l => l.label === 'l')
    expect(ls).toHaveLength(2)
    const delta = 3 * Math.sqrt(2)
    const cs = ls.map(l => l.c).sort((a, b) => a - b)
    expect(cs[0]).toBeCloseTo(-delta)
    expect(cs[1]).toBeCloseTo(delta)
  })

  it('pick l 1 — selects first parallel solution, emits one line', () => {
    const scene = run([
      'line m = (0, 1, 0)',
      'line l parallel m at 3',
      'pick l 1',
    ].join('\n'))
    const ls = scene.lines.filter(l => l.label === 'l')
    expect(ls).toHaveLength(1)
    expect(ls[0]!.solutions).toBe('one')
  })

  it('pick l 2 — selects second parallel solution', () => {
    const scene = run([
      'line m = (0, 1, 0)',
      'line l parallel m at 3',
      'pick l 2',
    ].join('\n'))
    const ls = scene.lines.filter(l => l.label === 'l')
    expect(ls).toHaveLength(1)
    expect(ls[0]!.solutions).toBe('one')
    // solution 2 is c = m.c - delta = 0 - 3 = -3
    expect(ls[0]!.c).toBeCloseTo(-3)
  })
})

describe('inline tuple refs', () => {
  it('perpendicular at (x, y) — inline point as intersection', () => {
    const scene = run([
      'line m = (1, 0, -2)',
      'line l perpendicular m at (2, 5)',
    ].join('\n'))
    const ll = scene.lines.find(l => l.label === 'l')!
    const lm = scene.lines.find(l => l.label === 'm')!
    // l is perpendicular to m
    expect(ll.a * lm.a + ll.b * lm.b).toBeCloseTo(0)
    // anonymous point should not appear in the rendered scene
    expect(scene.points.find(p => p.label.startsWith('_'))).toBeUndefined()
    // but the constraint should be satisfied: l passes through (2, 5)
    expect(ll.a * 2 + ll.b * 5 + ll.c).toBeCloseTo(0)
  })

  it('perpendicular at point (x, y) — with hint keyword', () => {
    const scene = run([
      'line m = (1, 0, -2)',
      'line l perpendicular m at point (2, 5)',
    ].join('\n'))
    // anonymous point not rendered
    expect(scene.points.find(p => p.label.startsWith('_'))).toBeUndefined()
    const ll = scene.lines.find(l => l.label === 'l')!
    expect(ll.a * 2 + ll.b * 5 + ll.c).toBeCloseTo(0)
  })

  it('line l parallel (1, -1, 0) — inline line as parallel target', () => {
    const scene = run([
      'line l parallel (1, -1, 0)',
    ].join('\n'))
    const ll = scene.lines.find(l => l.label === 'l')!
    // l should be parallel to y=x, so direction (1, -1)
    expect(ll.a).toBeCloseTo(1)
    expect(ll.b).toBeCloseTo(-1)
    // anonymous line not rendered
    expect(scene.lines.find(l => l.label.startsWith('_'))).toBeUndefined()
  })

  it('line l parallel line (1, -1, 0) — with hint keyword', () => {
    const scene = run([
      'line l parallel line (1, -1, 0)',
    ].join('\n'))
    const ll = scene.lines.find(l => l.label === 'l')!
    expect(ll.a).toBeCloseTo(1)
    expect(ll.b).toBeCloseTo(-1)
    expect(scene.lines.find(l => l.label.startsWith('_'))).toBeUndefined()
  })

  it('p on (1, -1, 0) — point on inline line', () => {
    const scene = run([
      'point p',
      'p on (1, -1, 0)',
    ].join('\n'))
    const pt = scene.points.find(p => p.label === 'p')!
    // p should lie on x - y = 0, i.e. p.x ≈ p.y
    expect(pt.x).toBeCloseTo(pt.y)
  })

  it('line l through (3, 4) — inline point in through clause', () => {
    const scene = run('line l through (3, 4)')
    const ll = scene.lines.find(l => l.label === 'l')!
    // Line should pass through (3,4): a*3 + b*4 + c ≈ 0
    expect(ll.a * 3 + ll.b * 4 + ll.c).toBeCloseTo(0)
  })
})

describe('scalar declarations', () => {
  it('scalar used in point coordinates', () => {
    const scene = run([
      'scalar k = 3',
      'point a = (k, 2)',
    ].join('\n'))
    assertPointAt(scene, 'a', 3, 2)
  })

  it('scalar used in line equation', () => {
    const scene = run([
      'scalar m = 2',
      'line l = (m, -1, 0)',
    ].join('\n'))
    assertLineEq(scene, 'l', 2, -1, 0)
  })

  it('same scalar shared across two lines', () => {
    const scene = run([
      'scalar m = 1',
      'line a = (m, -1, 0)',
      'line b = (m, -1, -3)',
    ].join('\n'))
    const la = scene.lines.find(l => l.label === 'a')!
    const lb = scene.lines.find(l => l.label === 'b')!
    // Same direction (same slope)
    expect(la.a * lb.b).toBeCloseTo(la.b * lb.a)
    // Different intercepts
    expect(la.c).toBeCloseTo(0)
    expect(lb.c).toBeCloseTo(-3)
  })

  it('scalar used in length constraint', () => {
    const scene = run([
      'scalar d = 5',
      'segment ab',
      'ab = d',
    ].join('\n'))
    assertSegmentLength(scene, 'a', 'b', 5)
  })

  it('scalar used in inline tuple ref', () => {
    const scene = run([
      'scalar s = 1',
      'line l parallel (s, -1, 0)',
    ].join('\n'))
    const ll = scene.lines.find(l => l.label === 'l')!
    expect(ll.a).toBeCloseTo(1)
    expect(ll.b).toBeCloseTo(-1)
  })

  it('forward reference — scalar declared after use', () => {
    const scene = run([
      'point a = (k, 2)',
      'scalar k = 7',
    ].join('\n'))
    assertPointAt(scene, 'a', 7, 2)
  })

  it('scalar referencing another scalar', () => {
    const scene = run([
      'scalar a = 3',
      'scalar b = a',
      'point p = (b, 0)',
    ].join('\n'))
    assertPointAt(scene, 'p', 3, 0)
  })

  it('unknown scalar throws', () => {
    assertThrows('point a = (nope, 2)', 'unknown scalar')
  })

  it('resolved scalar value appears in scene scalars', () => {
    const scene = run('scalar k = 3')
    assertScalar(scene, 'k', 3)
  })
})

describe('solver-derived scalars', () => {
  it('scalar derived from line through two points — slope', () => {
    const scene = run([
      'scalar m',
      'line l = (m, -1, 0)',
      'point a = (0, 0)',
      'point b = (1, 2.5)',
      'a on l',
      'b on l',
    ].join('\n'))
    assertScalar(scene, 'm', 2.5)
  })

  it('scalar derived from line through two points — intercept', () => {
    const scene = run([
      'scalar c',
      'line l = (1, -1, c)',
      'point a = (0, 3)',
      'point b = (1, 4)',
      'a on l',
      'b on l',
    ].join('\n'))
    // y = x + 3  →  x - y + 3 = 0  →  c = 3
    assertScalar(scene, 'c', 3)
  })

  it('multiple scalars derived from same line', () => {
    const scene = run([
      'scalar m',
      'scalar c',
      'line l = (m, -1, c)',
      'point a = (0, 5)',
      'point b = (2, 11)',
      'a on l',
      'b on l',
    ].join('\n'))
    // slope = (11-5)/(2-0) = 3, intercept = 5
    assertScalar(scene, 'm', 3)
    assertScalar(scene, 'c', 5)
  })

  it('bare scalar declaration with no value — unresolved', () => {
    const scene = run('scalar m')
    // m is unresolved — should have no value in scene
    const sc = scene.scalars.find(s => s.label === 'm')
    expect(sc).toBeUndefined()
  })
})
