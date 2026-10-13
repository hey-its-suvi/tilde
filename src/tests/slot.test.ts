import { describe, expect, it } from 'vitest'
import { runSource } from '../lang/defs/eval.js'
import { PRELUDE } from '../lang/prelude/index.js'

// Letting the slot decide (decision 19). The prelude's `(x) , (y)` gives back a
// Point; this adds one that gives back a Line — the slope-intercept reading of
// a pair of numbers. Same words, different answer: where it lands says which.
const withLine = `define (m: Scalar) , (k: Scalar) => Line:
    line ln
    return ln
`
const run = (src: string) => runSource(`import prelude\n${withLine}${src}`, PRELUDE)
const typeOf = (program: ReturnType<typeof run>, name: string) =>
  program.data.typeOf(program.globals.get(name)!)

describe('the slot picks between overloads that differ by what they give back', () => {
  it('takes the Point one where a point goes', () => {
    const program = run('line k through (1, 2) (3, 4)\n')
    // Both groups are worked out first, as points; then the line goes through them.
    expect(program.constraints.constraints.map(c => c.kind)).toEqual(['position', 'position', 'on-line', 'on-line'])
  })

  it('takes the Line one where a line goes', () => {
    const program = run('line l\nl parallel (2, 1)\n')
    const parallel = program.constraints.constraints.find(c => c.kind === 'parallel')!
    expect(parallel).toMatchObject({ l1: program.globals.get('l') })
    expect(program.data.typeOf((parallel as { l2: string }).l2 as never)).toBe('Line')
  })

  it('picks by slot without brackets too', () => {
    // `l parallel 2` cannot be read; from the third word, `2 , 1` could be
    // either, and the slot of `parallel` wants a Line.
    const program = run('line l\nl parallel 2 , 1\n')
    expect(program.constraints.constraints.map(c => c.kind)).toEqual(['parallel'])
  })

  it('takes the Point one when naming a point', () => {
    expect(typeOf(run('point p = (2, 1)\n'), 'p')).toBe('Point')
  })
})

describe('when nothing says which', () => {
  it('refuses a line that is only the pair', () => {
    expect(() => run('2 , 1\n')).toThrow(/"2 , 1" is ambiguous: it could give a Line or a Point/)
  })

  it('asks for a name where any kind of thing would do', () => {
    expect(() => run('print (2, 1)\n')).toThrow(
      /"\(2 , 1\)" is ambiguous: it could give a Line or a Point, and nothing around it says which — give it a name first/,
    )
  })
})
