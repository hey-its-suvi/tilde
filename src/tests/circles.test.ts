// ─── Tilde Solver — Circle Tests ──────────────────────────────────────────────
// Circle declarations from direct facts only — a free centre or any kind of
// on-circle derivation needs the real geometric solver, which the shell
// solver deliberately doesn't have. See plans/interval-backend.md.

import { describe, it, expect } from 'vitest'
import {
  run,
  assertCircle,
  assertPointAt,
} from './helpers.js'

describe('circle declarations', () => {
  it('takes a named centre and a radius', () => {
    const scene = run('point p at 2 3\ncircle c with center p and radius 4')
    assertCircle(scene, 'c', 2, 3, 4)
    assertPointAt(scene, 'p', 2, 3)
  })

  it('takes a bracketed centre, which is not drawn', () => {
    const scene = run('circle c with center (1, 2) and radius 5')
    assertCircle(scene, 'c', 1, 2, 5)
    expect(scene.points).toHaveLength(0)
  })

  it('takes a named radius', () => {
    const scene = run('scalar r = 7\ncircle c with center (0, 0) and radius r')
    assertCircle(scene, 'c', 0, 0, 7)
  })
})
