import { describe, expect, it } from 'vitest'
import { literalType } from '../lang/defs/match.js'
import { isScalarValue, isText } from '../lang/defs/values.js'
import { exactScalar } from '../lang/values/scalar.js'

describe('a scalar as a runtime value', () => {
  const value = { scalar: exactScalar(5) }

  it('is recognised as a scalar value', () => {
    expect(isScalarValue(value)).toBe(true)
  })

  it('is not mistaken for a number, text or an element key', () => {
    expect(isScalarValue(5)).toBe(false)
    expect(isScalarValue({ text: 'five' })).toBe(false)
    expect(isScalarValue('p')).toBe(false)
    expect(isText(value)).toBe(false)
  })

  it('has the type Scalar', () => {
    expect(literalType(value)).toBe('Scalar')
  })
})
