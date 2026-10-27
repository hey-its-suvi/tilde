import { describe, expect, it } from 'vitest'
import { contains, compareIntervals, interval, isSingleton, bound } from '../lang/values/interval.js'

const closed = (a: number, b: number) => interval(bound(a), bound(b))!
const open = (a: number, b: number) => interval(bound(a, true), bound(b, true))!

describe('interval construction', () => {
  it('builds a closed interval', () => {
    expect(closed(1, 2)).toEqual({ low: { value: 1, open: false }, high: { value: 2, open: false } })
  })

  it('is empty when the low end is past the high end', () => {
    expect(interval(bound(3), bound(2))).toBeNull()
  })

  it('is empty when both ends are the same value and either is open', () => {
    expect(interval(bound(2, true), bound(2))).toBeNull()
    expect(interval(bound(2), bound(2, true))).toBeNull()
    expect(interval(bound(2, true), bound(2, true))).toBeNull()
  })

  it('keeps a single point when both ends are closed', () => {
    expect(interval(bound(2), bound(2))).not.toBeNull()
  })

  it('forces an unbounded end to be open', () => {
    expect(bound(null, false)).toEqual({ value: null, open: true })
    expect(bound(null, false)).toEqual({ value: null, open: true })
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
    const above = interval(bound(0), bound<number>(null))!
    expect(contains(above, 1e300)).toBe(true)
    expect(contains(above, -1)).toBe(false)
  })
})

describe('isSingleton', () => {
  it('is true for [a, a] and false otherwise', () => {
    expect(isSingleton(closed(5, 5))).toBe(true)
    expect(isSingleton(closed(5, 6))).toBe(false)
    expect(isSingleton(interval(bound<number>(null), bound<number>(null))!)).toBe(false)
  })
})

describe('ordering', () => {
  it('sorts by start, closed before open at the same value', () => {
    const sorted = [open(0, 1), closed(0, 1), closed(-1, 0)].sort(compareIntervals)
    expect(sorted).toEqual([closed(-1, 0), closed(0, 1), open(0, 1)])
  })

  it('sorts an unbounded start first', () => {
    const below = interval(bound<number>(null), bound(0))!
    expect([closed(-5, 0), below].sort(compareIntervals)[0]).toBe(below)
  })

  it('puts an open end before a closed one at the same value', () => {
    const halfOpen = interval(bound(0), bound(1, true))!
    expect(compareIntervals(halfOpen, closed(0, 1))).toBeLessThan(0)
    expect(compareIntervals(closed(0, 1), halfOpen)).toBeGreaterThan(0)
  })
})
