import { describe, expect, it } from 'vitest'
import { runSource } from '../lang/defs/eval.js'
import { PRELUDE } from '../lang/prelude/index.js'
import { byName } from './named.js'

const run = (src: string) => byName(runSource(`import prelude\n${src}`, PRELUDE))

describe('an output slot hands a name back to the caller', () => {
  it('gives the caller the name it wrote, for what the body made', () => {
    const src = `define spot (n: new Point) at (x: Scalar):
    point n
    n at x 0
spot p at 4
p at 4 0
`
    const { typeOf, constraints } = run(src)
    expect(typeOf('p')).toBe('Point')
    expect(constraints.constraints).toContainEqual({ kind: 'position', point: 'p', x: 4, y: 0 })
  })

  it('makes a fresh one of the promised type if the body never named it', () => {
    const src = `define spot (n: new Point):
    scalar k
spot p
p at 1 1
`
    expect(run(src).typeOf('p')).toBe('Point')
  })

  it('refuses a body that names the output with the wrong kind of thing', () => {
    const src = `define spot (n: new Point):
    line n
spot p
`
    expect(() => run(src)).toThrow(/promised a Point for "n" but made a Line/)
  })

  it('refuses a name the caller already has, before the body runs', () => {
    const src = `define spot (n: new Point):
    point n
point p
spot p
`
    expect(() => run(src)).toThrow(/"p" is already declared as a Point/)
  })

  it('refuses an output of any type that the body never made', () => {
    const src = `define vague (n: new Any):
    scalar k
vague v
`
    expect(() => run(src)).toThrow(/never made its "n"/)
  })

  it('can name something that already exists', () => {
    // `point p = (3, 4)`: the output names the point the brackets made.
    const { globals } = run('point p = (3, 4)\n')
    expect([...globals.labels()].map(l => l.name)).toEqual(['p'])
  })
})

describe('a Type slot takes the name of a type', () => {
  it('is written into the body as itself', () => {
    // `ty` is a word to pass on, not a name to give — so `new ty n` runs as
    // `new Triangle n`.
    const src = `define make (ty: Type) (n: new Any):
    new ty n
make Triangle t
`
    expect(run(src).typeOf('t')).toBe('Triangle')
  })

  it('takes a built-in type or a declared one', () => {
    expect(run('new Point p\n').typeOf('p')).toBe('Point')
    expect(run('new Triangle t\n').typeOf('t')).toBe('Triangle')
  })

  it('refuses a word that is not a type, where it is written', () => {
    expect(() => run('new Triangel t\n')).toThrow(/there is no type called "Triangel"/)
  })
})
