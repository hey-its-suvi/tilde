// ─── Naming a number, through the language ───────────────────────────────────
// End to end: a named number tied to another element's field, written the way
// a program actually writes it. The underlying mechanics are covered directly
// in src/tests/solver/shell.test.ts.

import { describe, expect, it } from 'vitest'
import { solveSource } from '../lang/solver/index.js'

describe('a program can name a number', () => {
  const draw = (source: string) => solveSource('import prelude\n' + source)
  const radius = (source: string, name: string) =>
    draw(source).scene.circles.find(c => c.label === name)!.r
  const point = (source: string, name: string) =>
    draw(source).scene.points.find(p => p.label === name)!

  it('places a point from named coordinates', () => {
    expect(point('scalar k is 7\nscalar j is 2\npoint p at k j\n', 'p')).toMatchObject({
      x: 7,
      y: 2,
    })
  })

  it('mixes a name and a literal in one placement', () => {
    expect(point('scalar k is 7\npoint p at k 2\n', 'p')).toMatchObject({ x: 7, y: 2 })
  })

  it('ties two circles to one size', () => {
    // Neither circle is given a number; `r` is what makes them agree.
    const src = `scalar r is 3
point o at 0 0
circle c with center o
c with radius r
circle d with center o
d with radius r
`
    expect(radius(src, 'c')).toBe(3)
    expect(radius(src, 'd')).toBe(3)
  })

  it('works out a scalar from the shape instead', () => {
    // `r` is declared with no value; the circle's size settles it.
    const src = `scalar r
point o at 0 0
circle c with center o and radius 5
c with radius r
`
    expect(draw(src).scene.scalars.find(s => s.label === 'r')!.value).toBe(5)
  })

  it('still takes a plain number where one is written', () => {
    expect(radius('point o at 0 0\ncircle c with center o and radius 3\n', 'c')).toBe(3)
  })
})
