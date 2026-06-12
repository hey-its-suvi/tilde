// ─── Partial line declaration tests ───────────────────────────────────────────
// Lines declared with a single missing parameter: slope-only `(m,)`,
// direction-only `(a, b,)`, or y-intercept-only `(, b)`. The free parameter is
// either filled in via a placed on-line point or canonicalised by the pick.

import { describe, it } from 'vitest'
import {
  run,
  assertPoint, assertPointAt,
  assertLine, assertLineEq,
} from './helpers.js'

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
