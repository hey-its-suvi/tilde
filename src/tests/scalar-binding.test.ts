import { describe, expect, it } from 'vitest'
import { ShellSolver } from '../lang/solver/shell.js'
import type { ConstraintSet, ResolvedConstraint } from '../lang/solver/interface.js'
import { solveSource } from '../lang/solver/index.js'
import { exactScalar, wholeScalar, singleValue } from '@lang/values/scalar.js'

/** A scalar bound to a field of an element: `scalar = element.field`. */
const bind = (scalar: string, element: string, field: string): ResolvedConstraint => ({
  kind: 'scalar-equality',
  scalar,
  target: { element, field },
})

const value = (scalar: string, n: number): ResolvedConstraint => ({
  kind: 'scalar-equality',
  scalar,
  target: exactScalar(n),
})

const solve = (build: (cs: ConstraintSet) => void) => {
  const cs: ConstraintSet = {
    points: new Set(), segments: new Set(), lines: new Set(), circles: new Set(),
    scalars: new Set(), constraints: [], picks: new Map(),
  }
  build(cs)
  return new ShellSolver().solve(cs)
}

describe('a known element fills in its scalar', () => {
  it('reads a coordinate off a placed point', () => {
    const r = solve(cs => {
      cs.points.add('p')
      cs.scalars.add('k')
      cs.constraints.push(
        { kind: 'position', point: 'p', x: exactScalar(7), y: exactScalar(2) },
        bind('k', 'p', 'x'),
      )
    })
    expect(singleValue(r.scalars.get('k')!)).toBe(7)
  })

  it('reads a radius off a specified circle', () => {
    const r = solve(cs => {
      cs.points.add('o')
      cs.circles.add('c')
      cs.scalars.add('k')
      cs.constraints.push(
        { kind: 'position', point: 'o', x: exactScalar(0), y: exactScalar(0) },
        { kind: 'circle-spec', circle: 'c', center: 'o', r: exactScalar(4) },
        bind('k', 'c', 'r'),
      )
    })
    expect(singleValue(r.scalars.get('k')!)).toBe(4)
  })
})

describe('a known scalar fills in the element', () => {
  it('drives one coordinate of a point', () => {
    // Previously the binding was recorded and never fired this way round: `k`
    // came out 7 and the point sat at the origin.
    const r = solve(cs => {
      cs.points.add('p')
      cs.scalars.add('k')
      cs.constraints.push(value('k', 7), bind('k', 'p', 'x'))
    })
    expect(singleValue(r.points.get('p')!.x)).toBe(7)
  })

  it('drives both coordinates', () => {
    const r = solve(cs => {
      cs.points.add('p')
      cs.scalars.add('k')
      cs.scalars.add('j')
      cs.constraints.push(
        value('k', 7), bind('k', 'p', 'x'),
        value('j', 2), bind('j', 'p', 'y'),
      )
    })
    const p = r.points.get('p')!
    expect({ x: singleValue(p.x), y: singleValue(p.y) }).toEqual({ x: 7, y: 2 })
  })

  it('drives a radius', () => {
    const r = solve(cs => {
      cs.points.add('o')
      cs.circles.add('c')
      cs.scalars.add('k')
      cs.constraints.push(
        { kind: 'position', point: 'o', x: exactScalar(0), y: exactScalar(0) },
        { kind: 'circle-spec', circle: 'c', center: 'o', r: null },
        value('k', 3), bind('k', 'c', 'r'),
      )
    })
    expect(singleValue(r.circles.get('c')!.r)).toBe(3)
  })

  it('drives a line coefficient', () => {
    const r = solve(cs => {
      cs.lines.add('l')
      cs.scalars.add('k')
      cs.constraints.push(
        { kind: 'line-equation', line: 'l', a: exactScalar(0), b: exactScalar(1), c: null },
        value('k', -5), bind('k', 'l', 'c'),
      )
    })
    // 0x + 1y - 5 = 0 — the horizontal line y = 5.
    const l = r.lines.get('l')!
    expect({ a: singleValue(l.a), b: singleValue(l.b), c: singleValue(l.c) }).toEqual({ a: 0, b: 1, c: -5 })
  })

  it('makes two shapes share a dimension', () => {
    // Neither circle is given a radius; one scalar stands for both.
    const r = solve(cs => {
      cs.points.add('o')
      cs.circles.add('c')
      cs.circles.add('d')
      cs.scalars.add('k')
      cs.constraints.push(
        { kind: 'position', point: 'o', x: exactScalar(0), y: exactScalar(0) },
        { kind: 'circle-spec', circle: 'c', center: 'o', r: null },
        { kind: 'circle-spec', circle: 'd', center: 'o', r: null },
        value('k', 3), bind('k', 'c', 'r'), bind('k', 'd', 'r'),
      )
    })
    expect(singleValue(r.circles.get('c')!.r)).toBe(3)
    expect(singleValue(r.circles.get('d')!.r)).toBe(3)
  })
})

describe('the gauge is not spent twice', () => {
  it('leaves a driven coordinate alone; the other axis is simply unknown', () => {
    // There's no gauge fixer any more — a free axis just stays whole, it
    // doesn't get placed at the origin the way the real solver once did.
    const r = solve(cs => {
      cs.points.add('p')
      cs.scalars.add('k')
      cs.constraints.push(value('k', 7), bind('k', 'p', 'x'))
    })
    const p = r.points.get('p')!
    expect(singleValue(p.x)).toBe(7)
    expect(p.y).toEqual(wholeScalar())
  })

  it('does not disturb a point that is already fully placed', () => {
    const r = solve(cs => {
      cs.points.add('p')
      cs.scalars.add('k')
      cs.constraints.push(
        { kind: 'position', point: 'p', x: exactScalar(1), y: exactScalar(2) },
        value('k', 1), bind('k', 'p', 'x'),
      )
    })
    const p = r.points.get('p')!
    expect({ x: singleValue(p.x), y: singleValue(p.y) }).toEqual({ x: 1, y: 2 })
  })
})

// ─── The language surface ────────────────────────────────────────────────────

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

// ─── Two numbers that are the same number ────────────────────────────────────

describe('scalar equality narrows both sides', () => {
  const pair = (build: (cs: ConstraintSet) => void) =>
    solve(cs => {
      cs.scalars.add('a')
      cs.scalars.add('b')
      build(cs)
    })
  const val = value
  const same = (a: string, b: string): ResolvedConstraint => ({ kind: 'scalars-equal', a, b })

  it('leaves two unknowns unknown', () => {
    // Nothing known constrains nothing — whole is the identity.
    const r = pair(cs => cs.constraints.push(same('a', 'b')))
    expect(r.scalars.get('a')).toEqual(wholeScalar())
    expect(r.scalars.get('b')).toEqual(wholeScalar())
  })

  it('settles the unknown one, whichever side is known', () => {
    for (const order of [[val('a', 7), same('a', 'b')], [same('a', 'b'), val('b', 7)]]) {
      const r = pair(cs => cs.constraints.push(...order))
      expect(singleValue(r.scalars.get('a')!)).toBe(7)
      expect(singleValue(r.scalars.get('b')!)).toBe(7)
    }
  })

  it('is content when both agree', () => {
    const r = pair(cs => cs.constraints.push(val('a', 7), val('b', 7), same('a', 'b')))
    expect(singleValue(r.scalars.get('a')!)).toBe(7)
  })

  it('gives `none` when they disagree, rather than throwing', () => {
    // A contradiction is a value here. That is what makes `none ∩ X = none`
    // reachable at all, and it lets the rest of a drawing survive.
    const r = pair(cs => cs.constraints.push(val('a', 7), val('b', 3), same('a', 'b')))
    expect(r.scalars.get('a')).toEqual([])
    expect(r.scalars.get('b')).toEqual([])
  })

  it('carries along a chain', () => {
    const r = solve(cs => {
      cs.scalars.add('a'); cs.scalars.add('b'); cs.scalars.add('c')
      cs.constraints.push(val('a', 4), same('a', 'b'), same('b', 'c'))
    })
    expect(singleValue(r.scalars.get('c')!)).toBe(4)
  })
})

describe('unknown and impossible are different answers', () => {
  it('reports a fresh scalar as unknown, not as having no answer', () => {
    const r = solve(cs => { cs.scalars.add('k') })
    expect(r.scalars.get('k')).toEqual(wholeScalar())
  })

  it('reports an unplaced line as unknown too', () => {
    const cs: ConstraintSet = {
      points: new Set(), segments: new Set(), lines: new Set(['l']), circles: new Set(),
      scalars: new Set(), constraints: [], picks: new Map(),
    }
    const r = new ShellSolver().solve(cs)
    const l = r.lines.get('l')!
    expect([l.a, l.b, l.c]).toEqual([wholeScalar(), wholeScalar(), wholeScalar()])
  })
})
