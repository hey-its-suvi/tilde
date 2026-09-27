import { describe, expect, it } from 'vitest'
import { solveSource } from '../lang/solver/index.js'

const printed = (src: string) => solveSource(`import prelude\n${src}`).printed

describe('print shows solved values', () => {
  it('prints a written number as itself', () => {
    expect(printed('print 7\nprint (2 + 3)\n')).toEqual(['7', '5'])
  })

  it('rounds away floating-point noise', () => {
    expect(printed('print (0.1 + 0.2)\n')).toEqual(['0.3'])
  })

  it('prints a named number once it is solved', () => {
    expect(printed('scalar r = ((2 + 3) * 4)\nprint r\n')).toEqual(['r = 20'])
  })

  it('says when nothing pins a number down', () => {
    expect(printed('scalar k\nprint k\n')).toEqual(['k = not known — nothing pins it down'])
  })

  it('says when a number has no possible value', () => {
    expect(printed('scalar a = 2\na = 3\nprint a\n')).toEqual(['a = no possible value'])
  })

  it('lists every possibility when there are several', () => {
    const src = `point o at 0 0
point e at 1 0
line l through o e
circle c with center o and radius 5
point q on c
q on l
print q
`
    expect(printed(src)).toEqual(['q = (5, 0) or (-5, 0)'])
  })

  it('prints shapes by the name the program gave them', () => {
    expect(printed('point p = (3, 4)\nprint p\n')).toEqual(['p = (3, 4)'])
  })

  it('writes a line as a person would', () => {
    const src = `point o at 0 0
point e at 1 0
line l through o e
point f at 2 3
line m through e f
print l
print m
`
    expect(printed(src)).toEqual(['l: y = 0', 'm: 3x - y - 3 = 0'])
  })

  it('prints a circle by its centre and radius', () => {
    expect(printed('point o at 0 0\ncircle c with center o and radius 5\nprint c\n'))
      .toEqual(['c = centre o, radius 5'])
  })

  it('prints in the order it was asked', () => {
    expect(printed('print 1\nprint 2\nprint 3\n')).toEqual(['1', '2', '3'])
  })
})
