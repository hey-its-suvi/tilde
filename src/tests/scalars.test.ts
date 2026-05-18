// ─── Tilde Solver — Scalar Tests ──────────────────────────────────────────────
// Named scalar declarations, forward references, and solver-derived scalars.

import { describe, it, expect } from 'vitest'
import {
  run,
  assertPointAt,
  assertSegmentLength,
  assertLineEq,
  assertScalar,
  assertThrows,
} from './helpers.js'

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
