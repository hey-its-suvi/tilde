import { describe, expect, it } from 'vitest'
import { matchStatement, type Match } from '../lang/defs/match.js'
import type { Definition } from '../lang/defs/types.js'

import { loadModule } from '../lang/defs/modules.js'
import { PRELUDE } from '../lang/prelude/index.js'

// Everything below runs against the real prelude, loaded the way a program
// loads it: `import prelude`, which re-exports shapes and constraints.
const prelude = loadModule('prelude', PRELUDE)
const table: Definition[] = prelude.scope

/** Render a match's pattern back to its surface form, so assertions read like
 *  the prelude source rather than referencing table indices. */
const show = (m: Match) =>
  m.def.pattern
    .map(p => (p.part === 'keyword' ? p.word : `(${p.name}: ${p.type.name})`))
    .join(' ')

const forms = (stmt: string) => matchStatement(stmt, table).map(show)

const bindings = (stmt: string) => {
  const ms = matchStatement(stmt, table)
  expect(ms).toHaveLength(1)
  return Object.fromEntries(ms[0]!.bindings.map(b => [b.slot, b.token.value]))
}

describe('single unambiguous matches', () => {
  it('matches an infix constraint', () => {
    expect(forms('l parallel m')).toEqual(['(a: Line) parallel (b: Line)'])
  })

  it('matches a prefix-keyword declaring form', () => {
    // `line l parallel m` can only be the declaring form. The bare
    // `(a: Line) parallel (b: Line)` fails: its first slot would eat `line`,
    // then the keyword `parallel` meets `l` and the match dies.
    expect(forms('line l parallel m')).toEqual(['line (n: Name) parallel (m: Line)'])
  })

  it('matches a mixfix measurement', () => {
    expect(forms('distance between a and b is 5')).toEqual([
      'distance between (p: Point) and (q: Point) is (d: Scalar)',
    ])
  })

  it('matches adjacent slots', () => {
    expect(forms('point p at 3 5')).toEqual(['point (n: Name) at (x: Scalar) (y: Scalar)'])
    expect(bindings('point p at 3 5')).toEqual({ n: 'p', x: '3', y: '5' })
  })

  it('matches the longest keyword run, not a prefix of it', () => {
    // `circle c` alone is also a definition, but a full statement match must
    // consume every token, so the prefix form is not a candidate here.
    expect(forms('circle c with center o and radius r')).toEqual([
      'circle (n: Name) with center (p: Point) and radius (r: Scalar)',
    ])
  })
})

describe('ambiguous matches — the case resolution must settle', () => {
  it('returns both on-loci for `p on l`', () => {
    // Syntactically identical patterns; only the type of the second slot
    // separates them. Matching must surface both.
    expect(forms('p on l').sort()).toEqual([
      '(p: Point) on (c: Circle)',
      '(p: Point) on (l: Line)',
    ])
  })
})

describe('non-matches', () => {
  it('returns nothing for an unknown shape', () => {
    expect(forms('frobnicate x y')).toEqual([])
  })

  it('rejects a statement with leftover tokens', () => {
    expect(forms('l parallel m extra')).toEqual([])
  })

  it('rejects a keyword slot filled by the wrong word', () => {
    // `a and b` has no definition — `and` only appears mid-pattern in `distance
    // between _ and _`, never as a bare infix.
    expect(forms('a and b')).toEqual([])
  })

  it('rejects a non-atom where a slot is expected', () => {
    expect(forms('point (2, 1) at 3 5')).toEqual([])
  })
})

describe('every composed prelude body line matches something', () => {
  it('has a candidate for each statement the prelude composes from', () => {
    const composed = table.flatMap(d => (d.body.body === 'tilde' ? d.body.lines : []))
    expect(composed.length).toBeGreaterThan(0)

    const unmatched = composed.filter(line => matchStatement(line, table).length === 0)
    expect(unmatched).toEqual([])
  })
})
