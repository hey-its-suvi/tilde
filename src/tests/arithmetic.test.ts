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

  it('works * and / out before + and -', () => {
    // `* /` are at 7 and `+ -` at 6 in the prelude (decision 20).
    expect(value('scalar r = (2 + 3 * 4)\n')).toBe(14)
    expect(value('scalar r = (2 * 3 + 4)\n')).toBe(10)
    expect(value('scalar r = (1 - 2 * 3 - 4)\n')).toBe(-9)
    expect(value('scalar r = (2 * 3 - 4 * 5 - 1)\n')).toBe(-15)
  })

  it('works equal ones out left to right', () => {
    expect(value('scalar r = (10 - 2 - 3)\n')).toBe(5)
    expect(value('scalar r = (8 / 2 / 2)\n')).toBe(2)
    expect(value('scalar r = (2 * 3 / 6 * 4)\n')).toBe(4)
  })

  it('still lets brackets say otherwise', () => {
    expect(value('scalar r = ((2 + 3) * 4)\n')).toBe(20)
    expect(value('scalar r = (10 - (2 - 3))\n')).toBe(11)
  })

  it('works the arithmetic out before `=`, with no brackets', () => {
    // `=` gives nothing back, so `(scalar r = 2) + 3` has nothing to add to; the
    // line is read again with `2 + 3` first (decision 19).
    expect(value('scalar r = 2 + 3\n')).toBe(5)
    expect(value('scalar r = 2 + 3 * 4\n')).toBe(14)
  })

  it('refuses a named number rather than guessing', () => {
    // The solver decides `k` after these run, so there is nothing to add yet.
    expect(fails('scalar k = 2\nscalar r = (k + 1)\n')).toThrow(/arithmetic on a named number is not supported yet/)
  })

  it('refuses to divide by zero', () => {
    expect(fails('scalar r = (1 / 0)\n')).toThrow(/division by zero/)
  })
})
