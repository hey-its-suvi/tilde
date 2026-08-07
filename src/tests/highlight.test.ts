import { describe, expect, it } from 'vitest'
import { slotColumns } from '../lang/defs/highlight.js'
import { loadModule } from '../lang/defs/modules.js'
import { PRELUDE } from '../lang/prelude/index.js'

const table = [...loadModule('prelude', PRELUDE).scope]

/** Render a line with its slot fillers marked, so assertions read as the editor
 *  would show them: `[c]` is a value, everything else is a pattern word. */
const mark = (line: string) => {
  const cols = slotColumns(line, table)
  let out = ''
  for (let i = 0; i < line.length; ) {
    if (cols.has(i)) {
      const word = /^[A-Za-z0-9_.]+/.exec(line.slice(i))![0]
      out += `[${word}]`
      i += word.length
    } else {
      out += line[i]
      i++
    }
  }
  return out
}

describe('slots are found by alignment, not by spelling', () => {
  it('separates values from pattern words', () => {
    expect(mark('p on l')).toBe('[p] on [l]')
    expect(mark('point p on l')).toBe('point [p] on [l]')
  })

  it('marks only as far as a line aligns', () => {
    // `circle c on l` has no definition — the prelude declares a circle's
    // centre on a line nowhere yet. So `circle c` aligns and the tail does not,
    // which is the honest answer rather than a guess.
    expect(mark('circle c on l')).toBe('circle [c] on l')
  })

  it('marks numbers as values too', () => {
    expect(mark('point p at 3 5')).toBe('point [p] at [3] [5]')
  })

  it('handles a long mixfix pattern', () => {
    expect(mark('circle c with center o and radius 5')).toBe(
      'circle [c] with center [o] and radius [5]',
    )
  })

  it('marks the same word differently in different positions', () => {
    // `line` is a pattern word in the first, a value in the second — the whole
    // reason this cannot be done lexically.
    expect(mark('line l through p q')).toBe('line [l] through [p] [q]')
    expect(mark('p on line')).toBe('[p] on [line]')
  })

  it('keeps leading indentation aligned', () => {
    // Composed body lines are indented; columns are absolute in the line.
    expect(mark('    n at x y')).toBe('    [n] at [x] [y]')
  })
})

describe('half-typed lines still colour their values', () => {
  it('uses the definition it got furthest through', () => {
    expect(mark('circle c with center')).toBe('circle [c] with center')
  })

  it('marks values before the line is finished', () => {
    expect(mark('point p at 3')).toBe('point [p] at [3]')
  })

  it('reports nothing for a line that aligns with nothing', () => {
    expect(slotColumns('', table).size).toBe(0)
    expect(slotColumns('-- a comment', table).size).toBe(0)
  })
})

describe('a user definition extends what gets marked', () => {
  it('marks slots of a pattern the prelude never heard of', () => {
    const extra = [
      ...loadModule('main', {
        ...PRELUDE,
        main: 'define right triangle (t: Name) with legs (u: Scalar) (v: Scalar) => Triangle =\n    point t\n',
      }).scope,
    ]
    const cols = slotColumns('right triangle t with legs 3 4', extra)
    const line = 'right triangle t with legs 3 4'
    expect([...cols].sort((a, b) => a - b).map(c => line.slice(c).split(' ')[0])).toEqual([
      't',
      '3',
      '4',
    ])
  })
})
