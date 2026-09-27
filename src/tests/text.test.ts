import { describe, expect, it } from 'vitest'
import { lexHeader } from '../lang/defs/lexer.js'
import { solveSource } from '../lang/solver/index.js'

const printed = (src: string) => solveSource(`import prelude\n${src}`).printed
const fails = (src: string) => () => solveSource(`import prelude\n${src}`)

describe('text lexes', () => {
  it('keeps the quotes on the token, so it can be written back out', () => {
    expect(lexHeader('print "hi"', 0)[1]).toMatchObject({ kind: 'STRING', value: '"hi"' })
  })

  it('reads -- inside text as text, not a comment', () => {
    expect(lexHeader('print "a -- b"', 0)[1]).toMatchObject({ kind: 'STRING', value: '"a -- b"' })
  })

  it('reports text that never closes', () => {
    expect(() => lexHeader('print "open', 0)).toThrow(/never closed/)
  })

  it('rejects an escape it does not know', () => {
    expect(() => lexHeader('print "bad \\q"', 0)).toThrow(/not valid text/)
  })
})

describe('text is a value', () => {
  it('prints as itself', () => {
    expect(printed('print "hello"\n')).toEqual(['hello'])
    expect(printed('print "say \\"hi\\""\n')).toEqual(['say "hi"'])
  })

  it('stays distinct from a name spelled the same way', () => {
    // The point `p` and the text "p" are different things.
    expect(printed('point p at 1 2\nprint p\nprint "p"\n')).toEqual(['p = (1, 2)', 'p'])
  })

  it('joins with +', () => {
    expect(printed('print ("hello, " + "world")\n')).toEqual(['hello, world'])
  })

  it('leaves + on numbers adding', () => {
    expect(printed('print (2 + 3)\n')).toEqual(['5'])
  })

  it('does not turn a number into text on its own', () => {
    // No silent conversion: text joins only to text.
    expect(fails('print ("r is " + 5)\n')).toThrow(/no definition of "\"r is \" \+ 5" fits/)
  })

  it('can pass through a definition untouched', () => {
    const src = `define echo (t: Text) => Text:
    tsx\`
    return t
    \`

print (echo "same")
`
    expect(printed(src)).toEqual(['same'])
  })
})
