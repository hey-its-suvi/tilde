import { describe, expect, it } from 'vitest'
import { runSource } from '../lang/defs/eval.js'
import { PRELUDE } from '../lang/prelude/index.js'

// How tightly definitions bind (decision 20), with made-up operators so the
// prelude's own levels do not come into it: `plus` at 6, `times` at 7, and
// everything else at the default, 5.
const ops = `define (a: Scalar) plus (b: Scalar) => Scalar at 6:
    tsx\`
    return a + b
    \`

define (a: Scalar) times (b: Scalar) => Scalar at 7:
    tsx\`
    return a * b
    \`

`
const printed = (src: string) => runSource(`import prelude\n${ops}${src}`, PRELUDE).prints

describe('a looser call cannot sit inside a tighter one', () => {
  it('reads the tighter one first, wherever it is', () => {
    expect(printed('print 1 plus 2 times 3\n')).toEqual([7])
    expect(printed('print 2 times 3 plus 4\n')).toEqual([10])
    expect(printed('print 2 times 3 plus 4 times 5\n')).toEqual([26])
  })

  it('reads equal ones left to right', () => {
    expect(printed('print 1 plus 2 plus 3\n')).toEqual([6])
  })

  it('keeps equal ones left to right even across a tighter one', () => {
    // Without the left-to-right rule for equal levels, the restart would read
    // `1 minus ((2 times 3) minus 4)` = -1.
    const src = `define (a: Scalar) minus (b: Scalar) => Scalar at 6:
    tsx\`
    return a - b
    \`
print 1 minus 2 times 3 minus 4
print 2 times 3 minus 4 times 5 minus 1
print 10 minus 2 minus 3
`
    expect(printed(src)).toEqual([-9, -15, 5])
  })

  it('never checks what is in brackets', () => {
    expect(printed('print (1 plus 2) times 3\n')).toEqual([9])
  })

  it('lets a longer definition take the whole line', () => {
    // One call, nothing nested at its edges: nothing to check.
    const src = `define (a: Scalar) times (b: Scalar) plus (c: Scalar) times (d: Scalar) => Scalar:
    tsx\`
    return 999
    \`
print 2 times 3 plus 4 times 5
`
    expect(printed(src)).toEqual([999])
  })

  it('does not check a call that is closed on the side facing it', () => {
    // `two` has no slots, so nothing can be fought over at its edges, even at 1.
    const src = `define two => Scalar at 1:
    return 2
print two times 3
`
    expect(printed(src)).toEqual([6])
  })

  it('does not check a slot fenced in by words', () => {
    const src = `define (a: Scalar) between (b: Scalar) and (c: Scalar) => Scalar at 9:
    return b
print 1 between 2 plus 3 and 4
`
    expect(printed(src)).toEqual([5])
  })
})

describe('a loose definition takes everything after it', () => {
  it('reads `line n = l rotated 60` as naming the rotated line', () => {
    // Here `=` gives back a Line, so left to right would happily read
    // `(line n = l) rotated 60`. Only the levels rule that out.
    const src = `import core
define (l: Line) rotated (s: Scalar) => Line:
    line r
    r parallel l
    return r
define line (n: new Line) = (m: Line) => Line at 1:
    call m n
    return m
line l
line n = l rotated 60
`
    const program = runSource(src, PRELUDE)
    expect(program.globals.get('n')).not.toBe(program.globals.get('l'))
  })
})
