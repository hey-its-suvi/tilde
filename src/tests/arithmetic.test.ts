import { describe, expect, it } from 'vitest'
import { lexHeader } from '../lang/defs/lexer.js'
import { solveSource } from '../lang/solver/index.js'

const lex = (s: string) =>
  lexHeader(s, 0).filter(t => t.kind !== 'EOF').map(t => `${t.kind}:${t.value}`)
const value = (src: string, name = 'r') =>
  solveSource(`import prelude\n${src}`).scene.scalars.find(s => s.label === name)?.value
const fails = (src: string) => () => solveSource(`import prelude\n${src}`)

describe('operators and negative numbers lex', () => {
  it('reads the four operators', () => {
    expect(lex('1 + 2 - 3 * 4 / 5')).toEqual([
      'NUMBER:1', 'OPERATOR:+', 'NUMBER:2', 'OPERATOR:-', 'NUMBER:3',
      'OPERATOR:*', 'NUMBER:4', 'OPERATOR:/', 'NUMBER:5',
    ])
  })

  it('reads a minus touching a value on its left as subtraction', () => {
    expect(lex('a - 3')).toEqual(['WORD:a', 'OPERATOR:-', 'NUMBER:3'])
    expect(lex('a-3')).toEqual(['WORD:a', 'OPERATOR:-', 'NUMBER:3'])
  })

  it('reads a minus with nothing value-like before it as a sign', () => {
    expect(lex('at -3 4')).toEqual(['WORD:at', 'NUMBER:-3', 'NUMBER:4'])
    expect(lex('(1, -2)')).toEqual(['LPAREN:(', 'NUMBER:1', 'COMMA:,', 'NUMBER:-2', 'RPAREN:)'])
    expect(lex('a * -2')).toEqual(['WORD:a', 'OPERATOR:*', 'NUMBER:-2'])
    expect(lex('-3')).toEqual(['NUMBER:-3'])
  })

  it('still reads -- as a comment', () => {
    expect(lex('x -- note')).toEqual(['WORD:x'])
  })
})

describe('arithmetic on written numbers', () => {
  it('works the four operations out', () => {
    expect(value('scalar r = (2 + 3)\n')).toBe(5)
    expect(value('scalar r = (2 - 3)\n')).toBe(-1)
    expect(value('scalar r = (2 * 3)\n')).toBe(6)
    expect(value('scalar r = (7 / 2)\n')).toBe(3.5)
  })

  it('nests through brackets', () => {
    expect(value('scalar r = ((2 + 3) * 4)\n')).toBe(20)
    expect(value('scalar r = (5 - -2)\n')).toBe(7)
  })

  it('works anywhere a number goes', () => {
    const p = solveSource('import prelude\npoint p at (1 + 1) (10 / 5)\n').scene.points[0]!
    expect([p.x, p.y]).toEqual([2, 2])
  })

  it('needs brackets, since there is no precedence yet', () => {
    // A slot takes one word, number or group, so neither form matches.
    expect(fails('scalar r = 2 + 3\n')).toThrow(/no definition matches "scalar r = 2 \+ 3"/)
    expect(fails('scalar r = (2 + 3 * 4)\n')).toThrow(/no definition matches "2 \+ 3 \* 4"/)
  })

  it('refuses a named number rather than guessing', () => {
    // The solver decides `k` after these run, so there is nothing to add yet.
    expect(fails('scalar k = 2\nscalar r = (k + 1)\n')).toThrow(/arithmetic on a named number is not supported yet/)
  })

  it('refuses to divide by zero', () => {
    expect(fails('scalar r = (1 / 0)\n')).toThrow(/division by zero/)
  })
})
