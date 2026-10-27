import { describe, expect, it } from 'vitest'
import { bound, contains, type Interval } from '../lang/values/interval.js'
import {
  add, div, exactScalar, isEmpty, mul, numbersOf, scalarOf, sqrt, sub, wholeScalar,
} from '../lang/values/scalar.js'

const closed = (a: number, b: number): Interval =>
  ({ low: bound(a), high: bound(b) })
const range = (a: number, b: number) => [closed(a, b)]
const holds = (s: ReturnType<typeof scalarOf>, x: number) => s.some(i => contains(i, x))

describe('exact values stay exact', () => {
  it('computes single values directly', () => {
    expect(numbersOf(add(exactScalar(2), exactScalar(3)))).toEqual([5])
    expect(numbersOf(sub(exactScalar(2), exactScalar(3)))).toEqual([-1])
    expect(numbersOf(mul(exactScalar(2), exactScalar(3)))).toEqual([6])
    expect(numbersOf(div(exactScalar(6), exactScalar(2)))).toEqual([3])
  })
})

describe('ranges', () => {
  it('adds ranges end to end', () => {
    const s = add(range(1, 2), range(10, 20))
    expect(holds(s, 11)).toBe(true)
    expect(holds(s, 22)).toBe(true)
    expect(holds(s, 10)).toBe(false)
    expect(holds(s, 23)).toBe(false)
  })

  it('subtracts ranges by flipping the second', () => {
    const s = sub(range(5, 6), range(1, 2))
    expect(holds(s, 3)).toBe(true)
    expect(holds(s, 5)).toBe(true)
    expect(holds(s, 2)).toBe(false)
  })

  it('multiplies ranges through every corner', () => {
    const s = mul(range(-1, 2), range(3, 4))
    expect(holds(s, -4)).toBe(true)
    expect(holds(s, 8)).toBe(true)
    expect(holds(s, 9)).toBe(false)
  })

  it('takes the square root of the non-negative part', () => {
    const s = sqrt(range(-4, 9))
    expect(holds(s, 0)).toBe(true)
    expect(holds(s, 3)).toBe(true)
    expect(holds(s, 3.1)).toBe(false)
  })

  it('has no value for a square root of only negative numbers', () => {
    expect(isEmpty(sqrt(exactScalar(-1)))).toBe(true)
  })
})

describe('division', () => {
  it('drops zero from the divisor, so 1 ÷ [0, 1] is [1, inf)', () => {
    const s = div(exactScalar(1), range(0, 1))
    expect(holds(s, 1)).toBe(true)
    expect(holds(s, 1e9)).toBe(true)
    expect(holds(s, 0.5)).toBe(false)
    expect(holds(s, -1)).toBe(false)
  })

  it('splits a divisor that crosses zero, so 1 ÷ [-1, 1] is two unbounded pieces', () => {
    const s = div(exactScalar(1), range(-1, 1))
    expect(holds(s, 1)).toBe(true)
    expect(holds(s, -1)).toBe(true)
    expect(holds(s, 1e9)).toBe(true)
    expect(holds(s, -1e9)).toBe(true)
    expect(holds(s, 0)).toBe(false)
  })

  it('has no value when the divisor is only zero', () => {
    expect(isEmpty(div(exactScalar(1), exactScalar(0)))).toBe(true)
  })

  it('divides a range by a range that does not reach zero', () => {
    const s = div(range(2, 4), range(1, 2))
    expect(holds(s, 1)).toBe(true)
    expect(holds(s, 4)).toBe(true)
    expect(holds(s, 4.5)).toBe(false)
  })
})

describe('unbounded operands', () => {
  it('treats zero times infinity as zero', () => {
    const s = mul(exactScalar(0), [{ low: bound(1), high: bound<number>(null) }])
    expect(holds(s, 0)).toBe(true)
  })

  it('keeps a whole line whole when added to anything', () => {
    expect(holds(add(wholeScalar(), exactScalar(3)), 1e300)).toBe(true)
    expect(holds(add(wholeScalar(), exactScalar(3)), -1e300)).toBe(true)
  })
})
