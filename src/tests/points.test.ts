// ─── Tilde Solver — Point Tests ───────────────────────────────────────────────
// Bare declarations, explicit point coords, length-only constraints, and
// multi-target `on` constraints involving points and lines/segments.

import { describe, it, expect } from 'vitest'
import {
  run,
  assertPoint, assertPointExists, assertPointAt,
  assertSegment, assertSegmentLength,
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
