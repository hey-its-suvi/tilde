import { describe, expect, it } from 'vitest'
import { runSource } from '../lang/defs/eval.js'
import { PRELUDE } from '../lang/prelude/index.js'
import { byName } from './named.js'

// A call's numbers, text and words are held by its frame and read where a body
// line names them — never written into the line as text.

const run = (src: string) => runSource(`import prelude\n${src}`, PRELUDE)
const named = (src: string) => byName(run(src))

describe('a body reads what its caller passed', () => {
  it('passes a number on to a nested call', () => {
    const src = `define spot (n: new Point) at (x: Scalar) => Point:
    point n at x x
    return n
spot p at 3
`
    expect(named(src).constraints.constraints).toContainEqual(
      { kind: 'position', point: 'p', x: 3, y: 3 },
    )
  })

  it('passes text on', () => {
    const src = `define shout (s: Text):
    print (s + "!")
shout "hi"
`
    expect(run(src).prints).toEqual([{ text: 'hi!' }])
  })

  it('passes a word on to a Name slot as the word the caller wrote', () => {
    const src = `define hide (s: Name):
    set s off
hide grid
`
    expect(run(src).settings.get('grid')).toBe(false)
  })

  it('passes a type on to a Type slot', () => {
    const src = `define make (ty: Type) (n: new Any):
    new ty n
make Triangle t
`
    expect(run(src).data.typeOf(run(src).globals.get('t')!)).toBe('Triangle')
  })

  it('returns a number it was given', () => {
    const src = `define same (x: Scalar) => Scalar:
    return x
print (same 4)
`
    expect(run(src).prints).toEqual([4])
  })

  it('leaves a longer word that starts with a slot name alone', () => {
    // A slot `x` must not touch the name `xs`.
    const src = `define spot (n: new Point) at (x: Scalar) => Point:
    point xs at 1 2
    point n at x x
    return n
spot p at 5
`
    expect(named(src).constraints.constraints).toContainEqual(
      { kind: 'position', point: 'p', x: 5, y: 5 },
    )
  })
})
