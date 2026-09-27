import { describe, expect, it } from 'vitest'
import { Scope, asKey } from '../lang/defs/scope.js'

describe('a scope holds labels', () => {
  it('looks a label up by name', () => {
    const scope = new Scope()
    scope.add({ name: 'a', key: asKey('t.point1') })
    expect(scope.get('a')).toBe('t.point1')
    expect(scope.has('a')).toBe(true)
    expect(scope.get('b')).toBeUndefined()
  })

  it('lets two labels point at one key', () => {
    const scope = new Scope()
    scope.add({ name: 'a', key: asKey('t.point1') })
    scope.add({ name: 'first', key: asKey('t.point1') })
    expect([...scope.labels()]).toEqual([
      { name: 'a', key: 't.point1' },
      { name: 'first', key: 't.point1' },
    ])
  })

  it('never points a name somewhere else once set', () => {
    const scope = new Scope()
    scope.add({ name: 'a', key: asKey('p') })
    expect(() => scope.add({ name: 'a', key: asKey('q') })).toThrow(/already a label/)
  })
})
