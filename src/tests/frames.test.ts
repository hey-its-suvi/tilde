import { describe, expect, it } from 'vitest'
import { runSource } from '../lang/defs/eval.js'
import { PRELUDE } from '../lang/prelude/index.js'
import { byName } from './named.js'

const run = (src: string) => byName(runSource(`import prelude\n${src}`, PRELUDE))

describe('each call runs in a frame of its own', () => {
  it('lets a body name things with words that are also pattern words', () => {
    // `set` and `off` begin and end patterns (`set (s: Name) off`); in a Name
    // slot they are just names, and each call's are its own.
    const src = `define marks:
    point set at 0 0
    point off at 1 1
marks
marks
`
    expect(run(src).names().sort()).toEqual(['Point#1', 'Point#2', 'Point#3', 'Point#4'])
  })

  it('does not let a body see the program’s names', () => {
    const src = `point g at 0 0
define nudge:
    g at 1 1
nudge
`
    expect(() => run(src)).toThrow(/no definition of "g at 1 1" fits/)
  })

  it('labels a passed-down name where it was written, however deep', () => {
    // `inner` declares `n`; `outer` hands it its own `q`, so `q` is outer's, and
    // outer — not inner, and not the program — can go on to use it.
    const src = `define inner (n: Name):
    point n
define outer:
    inner q
    q at 1 1
outer
outer
`
    const { names, constraints } = run(src)
    expect(names().sort()).toEqual(['Point#1', 'Point#2'])
    expect(constraints.constraints).toEqual([
      { kind: 'position', point: 'Point#1', x: 1, y: 1 },
      { kind: 'position', point: 'Point#2', x: 1, y: 1 },
    ])
  })

  it('refuses the frame mark in a name', () => {
    expect(() => run('point d@0\n')).toThrow(/has a '@'/)
  })
})
