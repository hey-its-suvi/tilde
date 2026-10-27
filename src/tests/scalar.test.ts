import { describe, expect, it } from 'vitest'
import { bound, interval, type Interval } from '../lang/values/interval.js'
import {
  complement, exactScalar, intersectScalars, isEmpty, isSingleton, isWhole, normalise,
  numbersOf, sameScalars, scalarOf, union, wholeScalar,
} from '../lang/values/scalar.js'

const closed = (a: number, b: number): Interval => interval(bound(a), bound(b))!
const open = (a: number, b: number): Interval => interval(bound(a, true), bound(b, true))!
const halfOpen = (a: number, b: number): Interval => interval(bound(a), bound(b, true))!

describe('normalise', () => {
  it('joins overlapping intervals', () => {
    expect(normalise([closed(1, 3), closed(2, 5)])).toEqual([closed(1, 5)])
  })

  it('joins touching intervals when one end includes the shared point', () => {
    expect(normalise([closed(0, 1), halfOpen(1, 2)])).toEqual([interval(bound(0), bound(2, true))!])
  })

  it('keeps apart intervals that touch only at an excluded point', () => {
    expect(normalise([open(0, 1), open(1, 2)])).toEqual([open(0, 1), open(1, 2)])
  })

  it('sorts its output', () => {
    expect(normalise([closed(5, 6), closed(0, 1)])).toEqual([closed(0, 1), closed(5, 6)])
  })
})

describe('union', () => {
  it('holds every value either side could be', () => {
    expect(union(exactScalar(1), exactScalar(3))).toEqual([closed(1, 1), closed(3, 3)])
  })
})

describe('intersectScalars', () => {
  it('keeps the numbers both sides share', () => {
    expect(intersectScalars([closed(0, 5)], [closed(3, 8)])).toEqual([closed(3, 5)])
  })

  it('is empty when the two share no number', () => {
    expect(intersectScalars([closed(0, 1)], [closed(2, 3)])).toEqual([])
  })

  it('treats the whole line as no constraint', () => {
    expect(intersectScalars(wholeScalar(), [closed(2, 3)])).toEqual([closed(2, 3)])
  })
})

describe('complement', () => {
  it('turns the whole line into nothing, and nothing into the whole line', () => {
    expect(complement(wholeScalar())).toEqual([])
    expect(complement([])).toEqual(wholeScalar())
  })

  it('leaves the two sides of a single value', () => {
    expect(complement(exactScalar(0))).toEqual([
      { low: bound<number>(null), high: bound(0, true) },
      { low: bound(0, true), high: bound<number>(null) },
    ])
  })

  it('leaves the two outer sides of a closed interval', () => {
    expect(complement([closed(0, 1)])).toEqual([
      { low: bound<number>(null), high: bound(0, true) },
      { low: bound(1, true), high: bound<number>(null) },
    ])
  })
})

describe('states', () => {
  it('tells unknown, determined and contradictory apart', () => {
    expect(isWhole(wholeScalar())).toBe(true)
    expect(isSingleton(exactScalar(5))).toBe(true)
    expect(isEmpty([])).toBe(true)
    expect(isWhole(exactScalar(5))).toBe(false)
    expect(isSingleton(scalarOf([1, 2]))).toBe(false)
  })
})

describe('sameScalars', () => {
  it('compares the intervals and their ends', () => {
    expect(sameScalars([closed(1, 2)], [closed(1, 2)])).toBe(true)
    expect(sameScalars([closed(1, 2)], [halfOpen(1, 2)])).toBe(false)
    expect(sameScalars([closed(1, 2)], [])).toBe(false)
  })
})

describe('numbersOf', () => {
  it('reports the values of exact scalars, in order', () => {
    expect(numbersOf(scalarOf([5, -5]))).toEqual([-5, 5])
  })

  it('reports undefined for an unknown scalar', () => {
    expect(numbersOf(wholeScalar())).toBeUndefined()
  })

  it('reports nothing for a contradiction', () => {
    expect(numbersOf([])).toEqual([])
  })

  it('throws for a range, which the solver cannot report yet', () => {
    expect(() => numbersOf([closed(0, 1)])).toThrow()
  })
})
