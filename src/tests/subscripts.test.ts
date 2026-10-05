import { describe, expect, it } from 'vitest'
import { solveSource } from '../lang/solver/index.js'
import { labelRuns } from '../renderer/label.js'

const run = (src: string) => solveSource(`import prelude\n${src}`)

/** Runs flattened back to text, with subscripts marked `[...]`. */
const shown = (text: string) =>
  labelRuns(text).map(r => (r.sub ? `[${r.text}]` : r.text)).join('')

describe('underscores in names', () => {
  it('allows one between a name and its subscript', () => {
    expect(() => run('point t_1 at 0 0\npoint t_1_2 at 1 0\n')).not.toThrow()
  })

  it('rejects a name that starts with one', () => {
    expect(() => run('point _a at 0 0\n')).toThrow(/'_a' starts with '_'/)
  })

  it('rejects a name that ends with one', () => {
    expect(() => run('point a_ at 0 0\n')).toThrow(/'a_' ends with '_'/)
  })

  it('rejects two in a row', () => {
    expect(() => run('point a__1 at 0 0\n')).toThrow(/'a__1' has two of '_'/)
  })

  it('checks each part of a path on its own', () => {
    expect(() => run('triangle t with a b c\nprint t._a\n')).toThrow(/starts with '_'/)
    expect(() => run('triangle t with a b c\nprint t_.a\n')).toThrow(/ends with '_'/)
  })

  it('checks names in definitions too', () => {
    expect(() => run('define spot (_n: new Point) => Point:\n    point _n\n    return _n\n')).toThrow(/starts with '_'/)
  })

  it('still lets a definition keep locals of its own', () => {
    const src = `define marked (n: new Point) => Point:
    point m at 1 1
    point n at 2 2
    return n
marked p
marked q
print p
`
    expect(run(src).printed).toEqual(['p = (2, 2)'])
  })
})

describe('set subscripts', () => {
  it('is on unless set off', () => {
    expect(run('point t_1 at 0 0\n').config.subscripts).toBe(true)
  })

  it('turns on and off', () => {
    expect(run('set subscripts on\n').config.subscripts).toBe(true)
    expect(run('set subscripts off\n').config.subscripts).toBe(false)
  })

  it('means the same wherever it is written', () => {
    expect(run('point t_1 at 0 0\nset subscripts off\n').config.subscripts).toBe(false)
  })

  it('may be said twice, but not two different ways', () => {
    expect(run('set subscripts on\nset subscripts on\n').config.subscripts).toBe(true)
    expect(() => run('set subscripts on\nset subscripts off\n')).toThrow(
      /subscripts is already set to on, so it cannot also be off/,
    )
  })

  it('only knows on and off', () => {
    expect(() => run('set subscripts yes\n')).toThrow()
  })

  it('leaves the labels themselves as written', () => {
    const { scene } = run('set subscripts on\npoint t_1 at 0 0\n')
    expect(scene.points.map(p => p.label)).toEqual(['t_1'])
  })
})

describe('how a subscripted label is shown', () => {
  it('subscripts everything after the first underscore', () => {
    expect(shown('t_1')).toBe('t[1]')
    expect(shown('t_abc')).toBe('t[abc]')
  })

  it('separates further subscripts with commas', () => {
    expect(shown('t_1_2')).toBe('t[1,2]')
  })

  it('puts primes after the subscript', () => {
    expect(shown("l_1'")).toBe("l[1]'")
    expect(shown("l''")).toBe("l''")
  })

  it('treats each part of a path as its own name', () => {
    expect(shown('t_1.point_2')).toBe('t[1].point[2]')
    expect(shown('t.point1')).toBe('t.point1')
  })

  it('finds names inside longer text and leaves numbers alone', () => {
    expect(shown('r_1 = 3.5')).toBe('r[1] = 3.5')
    expect(shown('a_1–b_2')).toBe('a[1]–b[2]')
    expect(shown('p_1 = (1.25, 2)')).toBe('p[1] = (1.25, 2)')
  })

  it('leaves text without underscores as one plain run', () => {
    expect(labelRuns('q = (5, 0) or (-5, 0)')).toEqual([{ text: 'q = (5, 0) or (-5, 0)', sub: false }])
  })
})
