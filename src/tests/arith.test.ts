import { describe, expect, it } from 'vitest'
import { floatArith as A } from '../lang/values/float.js'

describe('float backend: stepping to the neighbouring double', () => {
  it('steps strictly away from a positive number and back again', () => {
    expect(A.below(1)).toBeLessThan(1)
    expect(A.above(1)).toBeGreaterThan(1)
    expect(A.above(A.below(1))).toBe(1)
    expect(A.below(A.above(1))).toBe(1)
  })

  it('steps strictly away from a negative number on each side', () => {
    expect(A.below(-1)).toBeLessThan(-1)
    expect(A.above(-1)).toBeGreaterThan(-1)
  })

  it('steps off zero by the smallest positive and negative doubles', () => {
    expect(A.above(0)).toBe(Number.MIN_VALUE)
    expect(A.below(0)).toBe(-Number.MIN_VALUE)
  })

  it('leaves the infinities where they are', () => {
    expect(A.below(-Infinity)).toBe(-Infinity)
    expect(A.above(Infinity)).toBe(Infinity)
  })
})

describe('float backend: operations and comparisons', () => {
  it('does the four operations and the square root', () => {
    expect(A.add(2, 3)).toBe(5)
    expect(A.sub(2, 3)).toBe(-1)
    expect(A.mul(2, 3)).toBe(6)
    expect(A.div(3, 2)).toBe(1.5)
    expect(A.sqrt(16)).toBe(4)
  })

  it('compares in the order a before, equal to, or after b', () => {
    expect(A.compare(1, 2)).toBe(-1)
    expect(A.compare(2, 2)).toBe(0)
    expect(A.compare(3, 2)).toBe(1)
  })

  it('takes a written number as the nearest double', () => {
    expect(A.fromNumber(1.5)).toBe(1.5)
  })
})
