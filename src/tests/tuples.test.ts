// ─── Tilde Solver — Inline Tuple Ref Tests ────────────────────────────────────
// Numeric tuples appearing wherever a name is expected — as a target of
// perpendicular/parallel/through/on, with or without a type hint keyword.

import { describe, it, expect } from 'vitest'
import { run } from './helpers.js'

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
