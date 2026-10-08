import { describe, expect, it } from 'vitest'
import { runSource } from '../lang/defs/eval.js'
import { solveSource } from '../lang/solver/index.js'
import { PRELUDE } from '../lang/prelude/index.js'

const run = (src: string) => runSource(`import prelude\n${src}`, PRELUDE)

describe('a type must exist to be written', () => {
  it('refuses an unknown slot type, and suggests the one meant', () => {
    expect(() => run('define spot (p: point):\n    p at 0 0\n')).toThrow(
      /\[main:2\] there is no type called "point" — did you mean "Point"\?/,
    )
  })

  it('refuses an unknown return type', () => {
    expect(() => run('define spot (n: new Point) => Lin:\n    point n\n    return n\n')).toThrow(
      /there is no type called "Lin"/,
    )
  })

  it('refuses an unknown field type', () => {
    expect(() => run('define type TwoPoint:\n    point a\n    Point b\n')).toThrow(
      /there is no type called "point" — did you mean "Point"\?/,
    )
  })

  it('takes a type declared anywhere that is loaded', () => {
    const src = 'define spot (t: TwoPoint):\n    t.a at 0 0\ndefine type TwoPoint:\n    Point a\n    Point b\n'
    expect(() => run(src)).not.toThrow()
  })

  it('does not let a tsx body invent one either', () => {
    const src = 'define odd (n: new Any):\n    tsx`\n    declare(n, \'Lin\')\n    `\nodd x\n'
    expect(() => run(src)).toThrow(/there is no type called "Lin"/)
  })
})

describe('two points can be said to be the same', () => {
  it('holds a field to an existing point', () => {
    const src = `import prelude
point p = (3, 4)
define type TwoPoint:
    Point a
    Point b
define tp (n: new TwoPoint) = (p: Point) (q: Point):
    new TwoPoint n
    n.a = p
    n.b = q
tp x = p p
print x.a
`
    expect(solveSource(src).printed).toEqual(['x.a = (3, 4)'])
  })
})
