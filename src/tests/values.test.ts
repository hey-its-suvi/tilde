import { describe, expect, it } from 'vitest'
import { contains, compareIntervals, highBound, interval, isSingleton, lowBound } from '../lang/values/interval.js'

const closed = (a: number, b: number) => interval(lowBound(a), highBound(b))!
const open = (a: number, b: number) => interval(lowBound(a, true), highBound(b, true))!

describe('interval construction', () => {
  it('builds a closed interval', () => {
    expect(closed(1, 2)).toEqual({ low: { value: 1, open: false }, high: { value: 2, open: false } })
  })

  it('is empty when the low end is past the high end', () => {
    expect(interval(lowBound(3), highBound(2))).toBeNull()
  })

  it('is empty when both ends are the same value and either is open', () => {
    expect(interval(lowBound(2, true), highBound(2))).toBeNull()
    expect(interval(lowBound(2), highBound(2, true))).toBeNull()
    expect(interval(lowBound(2, true), highBound(2, true))).toBeNull()
  })

  it('keeps a single point when both ends are closed', () => {
    expect(interval(lowBound(2), highBound(2))).not.toBeNull()
  })

  it('forces an unbounded end to be open', () => {
    expect(lowBound(null, false)).toEqual({ value: null, open: true })
    expect(highBound(null, false)).toEqual({ value: null, open: true })
  })
})

describe('containment', () => {
  it('includes closed ends and excludes open ones', () => {
    expect(contains(closed(1, 2), 1)).toBe(true)
    expect(contains(closed(1, 2), 2)).toBe(true)
    expect(contains(open(1, 2), 1)).toBe(false)
    expect(contains(open(1, 2), 2)).toBe(false)
    expect(contains(open(1, 2), 1.5)).toBe(true)
  })

  it('treats a null end as unbounded', () => {
    const above = interval(lowBound(0), highBound(null))!
    expect(contains(above, 1e300)).toBe(true)
    expect(contains(above, -1)).toBe(false)
  })
})

describe('isSingleton', () => {
  it('is true for [a, a] and false otherwise', () => {
    expect(isSingleton(closed(5, 5))).toBe(true)
    expect(isSingleton(closed(5, 6))).toBe(false)
    expect(isSingleton(interval(lowBound(null), highBound(null))!)).toBe(false)
  })
})

describe('ordering', () => {
  it('sorts by start, closed before open at the same value', () => {
    const sorted = [open(0, 1), closed(0, 1), closed(-1, 0)].sort(compareIntervals)
    expect(sorted).toEqual([closed(-1, 0), closed(0, 1), open(0, 1)])
  })

  it('sorts an unbounded start first', () => {
    const below = interval(lowBound(null), highBound(0))!
    expect([closed(-5, 0), below].sort(compareIntervals)[0]).toBe(below)
  })

  it('puts an open end before a closed one at the same value', () => {
    const halfOpen = interval(lowBound(0), highBound(1, true))!
    expect(compareIntervals(halfOpen, closed(0, 1))).toBeLessThan(0)
    expect(compareIntervals(closed(0, 1), halfOpen)).toBeGreaterThan(0)
  })
})
