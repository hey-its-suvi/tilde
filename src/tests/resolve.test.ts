import { describe, expect, it } from 'vitest'
import { parseFile } from '../lang/defs/parser.js'
import { resolveProgram } from '../lang/defs/resolve.js'
import type { Definition } from '../lang/defs/types.js'

import shapesSrc from '../lang/prelude/shapes.til?raw'
import constraintsSrc from '../lang/prelude/constraints.til?raw'

const table: Definition[] = [
  ...parseFile(shapesSrc).definitions,
  ...parseFile(constraintsSrc).definitions,
]

/** Resolve a program and render each statement's chosen form, so assertions
 *  read like the prelude rather than referencing definitions by index. */
const chosen = (program: string[]) =>
  resolveProgram(program, table).statements.map(r =>
    r.def.pattern
      .map(p => (p.part === 'keyword' ? p.word : `(${p.name}: ${p.type.name})`))
      .join(' '),
  )

describe('type-directed dispatch', () => {
  it('picks the Line `on` when the locus is a line', () => {
    expect(chosen(['point p', 'line l', 'p on l']).at(-1)).toBe('(p: Point) on (l: Line)')
  })

  it('picks the Circle `on` when the locus is a circle', () => {
    expect(chosen(['point p', 'circle c', 'p on c']).at(-1)).toBe('(p: Point) on (c: Circle)')
  })

  it('rejects a use whose argument type no definition accepts', () => {
    // `p on q` with both points: neither on-Line nor on-Circle fits.
    expect(() => resolveProgram(['point p', 'point q', 'p on q'], table)).toThrow(
      /no definition of "p on q" fits/,
    )
  })
})

describe('declarations build the symbol table', () => {
  it('types the first Name slot with the return type', () => {
    const { types } = resolveProgram(['point p', 'line l', 'circle c'], table)
    expect(types.get('p')).toBe('Point')
    expect(types.get('l')).toBe('Line')
    expect(types.get('c')).toBe('Circle')
  })

  it('a declaring constraint form declares its subject', () => {
    // `line l parallel m` declares l as a Line; m must already be one.
    const { types } = resolveProgram(['line m', 'line l parallel m'], table)
    expect(types.get('l')).toBe('Line')
    expect(chosen(['line m', 'line l parallel m']).at(-1)).toBe('line (n: Name) parallel (m: Line)')
  })

  it('types a point declared with a position', () => {
    const { types } = resolveProgram(['point p at 3 5'], table)
    expect(types.get('p')).toBe('Point')
  })

  it('rejects redeclaring a name', () => {
    expect(() => resolveProgram(['point p', 'point p'], table)).toThrow(/"p" is already declared/)
  })
})

describe('declaration before use', () => {
  it('rejects using a name before it is declared', () => {
    expect(() => resolveProgram(['p on l', 'point p', 'line l'], table)).toThrow(
      /no definition of "p on l" fits/,
    )
  })

  it('accepts a value whose type is known but whose position is not', () => {
    // `l` is declared with unknown coefficients; using it immediately is fine —
    // resolution needs the type, not the value.
    expect(() => resolveProgram(['point p', 'line l', 'p on l'], table)).not.toThrow()
  })
})

describe('unmatched and unsupported', () => {
  it('rejects an unknown statement', () => {
    expect(() => resolveProgram(['frobnicate x'], table)).toThrow(/no definition matches/)
  })

  it('defers multi-Name declaration forms with a clear message', () => {
    // triangle declares t, a, b, c — typing a/b/c needs body expansion.
    expect(() => resolveProgram(['triangle t with a b c'], table)).toThrow(
      /needs body expansion/,
    )
  })
})

describe('a small program resolves end to end', () => {
  it('resolves declarations and constraints together', () => {
    const program = [
      'point a',
      'point b',
      'line l',
      'a on l',
      'b on l',
      'distance between a and b',
    ]
    const { statements, types } = resolveProgram(program, table)
    expect(statements).toHaveLength(6)
    expect(types.get('a')).toBe('Point')
    expect(chosen(program).slice(3, 5)).toEqual([
      '(p: Point) on (l: Line)',
      '(p: Point) on (l: Line)',
    ])
  })
})
