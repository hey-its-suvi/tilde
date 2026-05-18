// ─── Tilde Solver — Line Tests ────────────────────────────────────────────────
// Line-line intersection, through syntax, bare and partial line declarations,
// slope/intercept syntax, parallel/perpendicular relationships.

import { describe, it, expect } from 'vitest'
import {
  run,
  assertPoint, assertPointAt,
  assertLine, assertLineEq,
  assertScalar,
  assertThrows,
} from './helpers.js'

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
  // ── Default path: the partial line plus a free on-line point consume the
  // remaining T-gauge — both end up uniquely determined up to that gauge.
  // The free point is placed at the line's "natural" point:
  //   slope-only / direction-only (c null) → origin
  //   y-intercept-only (c known)           → the line's pinned point

  it('slope-only (m,) with free on-line point — both resolved at origin', () => {
    // line l = (1,) → a=1, b=-1, c=null; T-anchor places p at origin,
    // which fixes c=0 → line is y = x passing through (0, 0).
    const scene = run([
      'line l = (1,)',
      'point p on l',
    ].join('\n'))
    assertLine(scene, 'l', 'one')
    assertLineEq(scene, 'l', 1, -1, 0)
    assertPoint(scene, 'p', 'one')
    assertPointAt(scene, 'p', 0, 0)
  })

  it('direction-only 3-tuple (a,b,) with free on-line point — both resolved at origin', () => {
    // line l = (0, 1,) → horizontal line, unknown height. T-anchor at origin
    // fixes the line to y = 0.
    const scene = run([
      'line l = (0, 1,)',
      'point p on l',
    ].join('\n'))
    assertLine(scene, 'l', 'one')
    assertLineEq(scene, 'l', 0, 1, 0)
    assertPoint(scene, 'p', 'one')
    assertPointAt(scene, 'p', 0, 0)
  })

  it('y-intercept-only (,b) with free on-line point — p at the y-intercept', () => {
    // line l = (,3) → a=null, b=-1, c=3; the line family pivots around (0, 3).
    // T-anchor places p at (0, 3) (the natural invariant point); resolve fills
    // in the canonical slope-1 default (a = -b = 1) → line y = x + 3.
    const scene = run([
      'line l = (,3)',
      'point p on l',
    ].join('\n'))
    assertLine(scene, 'l', 'one')
    assertLineEq(scene, 'l', 1, -1, 3)
    assertPoint(scene, 'p', 'one')
    assertPointAt(scene, 'p', 0, 3)
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
