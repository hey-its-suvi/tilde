// ─── Anchor / canonical form tests ────────────────────────────────────────────
// Verifies that pass 2 correctly detects free DOFs and applies canonical fixers.

import { describe, it } from 'vitest'
import { run, assertPoint, assertPointAt, assertSegmentLength } from './helpers.js'
import {
  CANONICAL_X, CANONICAL_Y,
  CANONICAL_DIR_X, CANONICAL_DIR_Y,
  CANONICAL_SCALE,
} from '@lang/solver/anchor.js'

// Expected positions of the anchor and reference points in canonical form.
// Derived from the solver constants so assertions stay correct if conventions change.
const anchorX = CANONICAL_X
const anchorY = CANONICAL_Y
const refX    = CANONICAL_X + CANONICAL_DIR_X * CANONICAL_SCALE
const refY    = CANONICAL_Y + CANONICAL_DIR_Y * CANONICAL_SCALE

// ── Translation ───────────────────────────────────────────────────────────────

describe('translation', () => {
  it('single free point is placed at origin', () => {
    const scene = run('point a')
    assertPointAt(scene, 'a', anchorX, anchorY)
  })

  it('two free points: first at origin, second at canonical reference', () => {
    const scene = run('point a\npoint b')
    assertPointAt(scene, 'a', anchorX, anchorY)
    assertPointAt(scene, 'b', refX, refY)
  })

  it('explicit point: translation fixed, stays at declared coords', () => {
    const scene = run('point a = (3, 4)')
    assertPointAt(scene, 'a', 3, 4)
  })

  it('explicit point + free point: free point is mapped to origin', () => {
    // b=(3,4) fixes translation. R and S are still free — we can rotate around b
    // then scale so that a lands on the origin. canonical reference target is (anchorX,anchorY).
    const scene = run('point a\npoint b = (3, 4)')
    assertPointAt(scene, 'b', 3, 4)
    assertPointAt(scene, 'a', anchorX, anchorY)
  })

  it('explicit point + disconnected free segment: first segment endpoint mapped to origin, other end free', () => {
    // a=(3,4) fixes T. R+S still free — rotate+scale around a maps b to origin.
    // c has no length constraint tying it anywhere, so it remains free.
    const scene = run('point a = (3, 4)\nsegment bc')
    assertPointAt(scene, 'a', 3, 4)
    assertPointAt(scene, 'b', anchorX, anchorY)
    assertPoint(scene, 'c', 'infinite')
  })

  it('explicit point + connected segment with known length: b placed along line through origin', () => {
    // a=(3,4) fixes T. |ab|=7 fixes S. R is free — rotate around a until ab points
    // toward the canonical target (origin). b lands at distance 7 from a along that
    // direction, so the segment ab passes through the origin. Good canonical default.
    const ax = 3, ay = 4, len = 7
    const dx = anchorX - ax, dy = anchorY - ay, d = Math.sqrt(dx*dx + dy*dy)
    const scene = run('point a = (3, 4)\nsegment ab = 7')
    assertPointAt(scene, 'a', ax, ay)
    assertPointAt(scene, 'b', ax + (dx/d)*len, ay + (dy/d)*len)
  })

  it('explicit point + disconnected segment with known length: both endpoints remain free', () => {
    // a=(3,4) fixes T. S is fixed by |bc|=5. R is free but the R fixer needs a known
    // distance from the anchor to a reference point — there is none (a is disconnected
    // from bc). Rotating around a only moves b along an arc of unknown radius, which
    // doesn't fix its position. Both b and c stay infinite.
    const scene = run('point a = (3, 4)\nsegment bc = 5')
    assertPointAt(scene, 'a', 3, 4)
    assertPoint(scene, 'b', 'infinite')
    assertPoint(scene, 'c', 'infinite')
    assertSegmentLength(scene, 'b', 'c', 5)
  })
})

// ── Rotation + Scale ──────────────────────────────────────────────────────────

describe('rotation + scale (T, R, S all free)', () => {
  it('segment ab — a at anchor, b at canonical reference, length = scale', () => {
    const scene = run('segment ab')
    assertPointAt(scene, 'a', anchorX, anchorY)
    assertPointAt(scene, 'b', refX, refY)
    assertSegmentLength(scene, 'a', 'b', CANONICAL_SCALE)
  })

  it('triangle abc — a and b canonical, c remains free', () => {
    const scene = run('triangle abc')
    assertPointAt(scene, 'a', anchorX, anchorY)
    assertPointAt(scene, 'b', refX, refY)
    assertPoint(scene, 'c', 'infinite')
  })

  it('subscript triangle t — t_1 and t_2 canonical, t_3 remains free', () => {
    const scene = run('triangle t')
    assertPointAt(scene, 't_1', anchorX, anchorY)
    assertPointAt(scene, 't_2', refX, refY)
    assertPoint(scene, 't_3', 'infinite')
  })
})

describe('rotation (T+R free, S fixed)', () => {
  it('segment ab = 3 — a at anchor, b along canonical direction at known length', () => {
    const scene = run('segment ab = 3')
    assertPointAt(scene, 'a', anchorX, anchorY)
    assertPointAt(scene, 'b', anchorX + CANONICAL_DIR_X * 3, anchorY + CANONICAL_DIR_Y * 3)
  })
})

// ── Anchor suppression ────────────────────────────────────────────────────────

describe('anchor suppression', () => {
  it('floating segment alongside an explicit point — both endpoints infinite', () => {
    // segment ab = 3 is floating, but point c fixes the coordinate system.
    // We can no longer rotate the scene to put ab on the x-axis, so both
    // endpoints must be 'infinite', not orientation-fixed to 'one'.
    const scene = run('segment ab = 3\npoint c = (5,0)')
    assertPoint(scene, 'a', 'infinite')
    assertPoint(scene, 'b', 'infinite')
    assertPoint(scene, 'c', 'one')
    assertSegmentLength(scene, 'a', 'b', 3)
  })

  it('isolated free point alongside a fixed segment is not anchored at origin', () => {
    const scene = run([
      'segment ab with a = (2,2) and b = (3,2)',
      'point c',
    ].join('\n'))
    assertPointAt(scene, 'a', 2, 2)
    assertPointAt(scene, 'b', 3, 2)
    assertPoint(scene, 'c', 'infinite')
  })

  it('free point with a length constraint to a fixed point is not anchored at origin', () => {
    // c is free but has segment ca = 3 tying it to fixed a=(2,2).
    // The anchor must not select c — placing it at (0,0) would give distance
    // sqrt(8) ≈ 2.83, violating the length constraint.
    const scene = run([
      'segment ab with a = (2,2) and b = (3,2)',
      'segment ca = 3',
    ].join('\n'))
    assertPointAt(scene, 'a', 2, 2)
    assertPointAt(scene, 'b', 3, 2)
    // c is on a circle of radius 3 around a — genuinely underconstrained
    assertPoint(scene, 'c', 'infinite')
    assertSegmentLength(scene, 'c', 'a', 3)
  })
})
