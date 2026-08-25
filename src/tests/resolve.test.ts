import { describe, expect, it } from 'vitest'
import { resolveStatement, form, type Store } from '../lang/defs/resolve.js'
import type { Definition } from '../lang/defs/types.js'

import { loadModule } from '../lang/defs/modules.js'
import { PRELUDE } from '../lang/prelude/index.js'

// Everything below runs against the real prelude, loaded the way a program
// loads it: `import prelude`, which re-exports shapes and constraints.
const prelude = loadModule('prelude', PRELUDE)
const table: Definition[] = prelude.scope

const symbols = (entries: Record<string, string>): Store => ({
  types: new Map(Object.entries(entries)),
  parts: new Map(),
  decls: prelude.types,
  aliases: new Map(),
})

/** The surface form resolution settles on, so assertions read like the prelude
 *  rather than referencing definitions by index. */
const chosen = (statement: string, types: Record<string, string> = {}) =>
  form(resolveStatement(statement, symbols(types), table))

describe('type-directed dispatch', () => {
  it('picks the Line `on` when the locus is a line', () => {
    expect(chosen('p on l', { p: 'Point', l: 'Line' })).toBe('(p: Point) on (l: Line)')
  })

  it('picks the Circle `on` when the locus is a circle', () => {
    expect(chosen('p on c', { p: 'Point', c: 'Circle' })).toBe('(p: Point) on (c: Circle)')
  })

  it('rejects a use whose argument types no definition accepts', () => {
    // Both points: neither on-Line nor on-Circle fits.
    expect(() => chosen('p on q', { p: 'Point', q: 'Point' })).toThrow(
      /no definition of "p on q" fits/,
    )
  })

  it('names the candidates it tried when nothing fits', () => {
    expect(() => chosen('p on q', { p: 'Point', q: 'Point' })).toThrow(/\(p: Point\) on \(l: Line\)/)
  })
})

describe('Name slots are declaration sites', () => {
  it('accepts an undeclared name in a Name slot', () => {
    expect(chosen('point p')).toBe('point (n: Name)')
  })

  it('picks the declaring form when the subject is a fresh name', () => {
    expect(chosen('line l parallel m', { m: 'Line' })).toBe('line (n: Name) parallel (m: Line)')
  })

  it('rejects a literal in a Name slot', () => {
    expect(() => chosen('point 3')).toThrow(/no definition of "point 3" fits/)
  })
})

describe('declaration before use', () => {
  it('rejects using a name before it is declared', () => {
    expect(() => chosen('p on l', { p: 'Point' })).toThrow(/no definition of "p on l" fits/)
  })

  it('needs only the type, not the value', () => {
    // `l` is declared with unknown coefficients; using it immediately is fine.
    expect(() => chosen('p on l', { p: 'Point', l: 'Line' })).not.toThrow()
  })
})

describe('literals', () => {
  it('accepts a number in a Scalar slot', () => {
    expect(chosen('p at 3 5', { p: 'Point' })).toBe('(p: Point) at (x: Scalar) (y: Scalar)')
  })

  it('rejects a number in a Point slot', () => {
    expect(() => chosen('p on 3', { p: 'Point' })).toThrow(/no definition of "p on 3" fits/)
  })
})

describe('unmatched', () => {
  it('rejects an unknown statement', () => {
    expect(() => chosen('frobnicate x')).toThrow(/no definition matches/)
  })
})
