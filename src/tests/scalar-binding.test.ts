import { describe, expect, it } from 'vitest'
import { Solver } from '../lang/solver/solver.js'
import { GeometricPropagate } from '../lang/solver/propagate/geometric/index.js'
import { RuleBasedPick } from '../lang/solver/pick/rule-based/index.js'
import { NonePick } from '../lang/solver/pick/none/index.js'
import type { ConstraintSet, ResolvedConstraint } from '../lang/solver/interface.js'
import { solveSource } from '../lang/solver/index.js'

/** A scalar bound to a field of an element: `scalar = element.field`. */
const bind = (scalar: string, element: string, field: string): ResolvedConstraint => ({
  kind: 'scalar-equality',
  scalar,
  target: { element, field },
})

const value = (scalar: string, n: number): ResolvedConstraint => ({
  kind: 'scalar-equality',
  scalar,
  target: n,
})

const solve = (build: (cs: ConstraintSet) => void) => {
  const cs: ConstraintSet = {
    points: new Set(), segments: new Set(), lines: new Set(), circles: new Set(),
    scalars: new Set(), constraints: [], picks: new Map(),
  }
  build(cs)
  return new Solver(new GeometricPropagate(), new RuleBasedPick()).solve(cs)
}

describe('a known element fills in its scalar', () => {
  it('reads a coordinate off a placed point', () => {
    const r = solve(cs => {
      cs.points.add('p')
      cs.scalars.add('k')
      cs.constraints.push({ kind: 'position', point: 'p', x: 7, y: 2 }, bind('k', 'p', 'x'))
    })
    expect(r.scalars.get('k')!.solutions![0]).toBe(7)
  })

  it('reads a radius off a specified circle', () => {
    const r = solve(cs => {
      cs.points.add('o')
      cs.circles.add('c')
      cs.scalars.add('k')
      cs.constraints.push(
        { kind: 'position', point: 'o', x: 0, y: 0 },
        { kind: 'circle-spec', circle: 'c', center: 'o', r: 4 },
        bind('k', 'c', 'r'),
      )
    })
    expect(r.scalars.get('k')!.solutions![0]).toBe(4)
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
    expect(r.points.get('p')!.solutions![0]!.x).toBe(7)
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
    expect(r.points.get('p')!.solutions![0]).toEqual({ x: 7, y: 2 })
    expect(r.points.get('p')!.dof).toBe(0)
  })

  it('drives a radius', () => {
    const r = solve(cs => {
      cs.points.add('o')
      cs.circles.add('c')
      cs.scalars.add('k')
      cs.constraints.push(
        { kind: 'position', point: 'o', x: 0, y: 0 },
        { kind: 'circle-spec', circle: 'c', center: 'o', r: null },
        value('k', 3), bind('k', 'c', 'r'),
      )
    })
    expect(r.circles.get('c')!.solutions![0]!.r).toBe(3)
  })

  it('drives a line coefficient', () => {
    const r = solve(cs => {
      cs.lines.add('l')
      cs.scalars.add('k')
      cs.constraints.push(
        { kind: 'line-equation', line: 'l', a: 0, b: 1, c: null },
        value('k', -5), bind('k', 'l', 'c'),
      )
    })
    // 0x + 1y - 5 = 0 — the horizontal line y = 5.
    expect(r.lines.get('l')!.solutions![0]).toEqual({ a: 0, b: 1, c: -5 })
  })

  it('makes two shapes share a dimension', () => {
    // Neither circle is given a radius; one scalar stands for both.
    const r = solve(cs => {
      cs.points.add('o')
      cs.circles.add('c')
      cs.circles.add('d')
      cs.scalars.add('k')
      cs.constraints.push(
        { kind: 'position', point: 'o', x: 0, y: 0 },
        { kind: 'circle-spec', circle: 'c', center: 'o', r: null },
        { kind: 'circle-spec', circle: 'd', center: 'o', r: null },
        value('k', 3), bind('k', 'c', 'r'), bind('k', 'd', 'r'),
      )
    })
    expect(r.circles.get('c')!.solutions![0]!.r).toBe(3)
    expect(r.circles.get('d')!.solutions![0]!.r).toBe(3)
  })
})

describe('the gauge is not spent twice', () => {
  it('leaves a driven coordinate alone when placing the rest', () => {
    // A point with one axis fixed is no longer free to translate along it. The
    // gauge fixer pins free points at the origin, so a raw write to `x` would be
    // overwritten — the coordinate goes in as an axis-aligned line the point
    // lies on, which is the same route `point p = (5,)` takes.
    const r = solve(cs => {
      cs.points.add('p')
      cs.scalars.add('k')
      cs.constraints.push(value('k', 7), bind('k', 'p', 'x'))
    })
    const p = r.points.get('p')!.solutions![0]!
    expect(p.x).toBe(7)
    expect(p.y).toBe(0) // free, so the gauge choice still lands at the origin
  })

  it('does not disturb a point that is already fully placed', () => {
    const r = solve(cs => {
      cs.points.add('p')
      cs.scalars.add('k')
      cs.constraints.push(
        { kind: 'position', point: 'p', x: 1, y: 2 },
        value('k', 1), bind('k', 'p', 'x'),
      )
    })
    expect(r.points.get('p')!.solutions![0]).toEqual({ x: 1, y: 2 })
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

// ─── Multiple answers ────────────────────────────────────────────────────────

describe('a scalar carries every answer, like any other element', () => {
  /** A point where a circle meets the x-axis: two places, at x = ±5. */
  const twoWays = (picks: [string, number][] = []) =>
    solve(cs => {
      cs.points.add('o')
      cs.points.add('p')
      cs.lines.add('l')
      cs.circles.add('c')
      cs.scalars.add('k')
      cs.picks = new Map(picks)
      cs.constraints.push(
        { kind: 'position', point: 'o', x: 0, y: 0 },
        { kind: 'circle-spec', circle: 'c', center: 'o', r: 5 },
        { kind: 'line-equation', line: 'l', a: 0, b: 1, c: 0 },
        { kind: 'on-circle', point: 'p', circle: 'c' },
        { kind: 'on-line', point: 'p', line: 'l' },
        bind('k', 'p', 'x'),
      )
    })

  it('reports both when the element has both', () => {
    // Previously this said [5] — one answer as though a choice had been made,
    // walking straight past `pick`.
    const r = twoWays()
    expect(r.points.get('p')!.solutions!).toEqual([{ x: 5, y: 0 }, { x: -5, y: 0 }])
    expect(r.scalars.get('k')!.solutions!).toEqual([5, -5])
  })

  it('keeps the scalar in step with the element, answer for answer', () => {
    const r = twoWays()
    expect(r.scalars.get('k')!.solutions!).toEqual(
      r.points.get('p')!.solutions!.map(s => s.x),
    )
  })

  it('can be picked between', () => {
    expect(twoWays([['k', 2]]).scalars.get('k')!.solutions!).toEqual([-5])
  })

  it('still reports one answer when there is only one', () => {
    const r = solve(cs => {
      cs.points.add('p')
      cs.scalars.add('k')
      cs.constraints.push({ kind: 'position', point: 'p', x: 7, y: 2 }, bind('k', 'p', 'x'))
    })
    expect(r.scalars.get('k')!.solutions!).toEqual([7])
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
  const val = (s: string, n: number): ResolvedConstraint =>
    ({ kind: 'scalar-equality', scalar: s, target: n })
  const same = (a: string, b: string): ResolvedConstraint => ({ kind: 'scalars-equal', a, b })

  it('leaves two unknowns unknown', () => {
    // Nothing known constrains nothing — `undefined` is the identity.
    const r = pair(cs => cs.constraints.push(same('a', 'b')))
    expect(r.scalars.get('a')!.solutions).toBeUndefined()
    expect(r.scalars.get('b')!.solutions).toBeUndefined()
  })

  it('settles the unknown one, whichever side is known', () => {
    for (const order of [[val('a', 7), same('a', 'b')], [same('a', 'b'), val('b', 7)]]) {
      const r = pair(cs => cs.constraints.push(...order))
      expect(r.scalars.get('a')!.solutions).toEqual([7])
      expect(r.scalars.get('b')!.solutions).toEqual([7])
    }
  })

  it('is content when both agree', () => {
    const r = pair(cs => cs.constraints.push(val('a', 7), val('b', 7), same('a', 'b')))
    expect(r.scalars.get('a')!.solutions).toEqual([7])
  })

  it('gives `none` when they disagree, rather than throwing', () => {
    // A contradiction is a value here. That is what makes `none ∩ X = none`
    // reachable at all, and it lets the rest of a drawing survive.
    const r = pair(cs => cs.constraints.push(val('a', 7), val('b', 3), same('a', 'b')))
    expect(r.scalars.get('a')!.solutions).toEqual([])
    expect(r.scalars.get('b')!.solutions).toEqual([])
  })

  it('carries along a chain', () => {
    const r = solve(cs => {
      cs.scalars.add('a'); cs.scalars.add('b'); cs.scalars.add('c')
      cs.constraints.push(val('a', 4), same('a', 'b'), same('b', 'c'))
    })
    expect(r.scalars.get('c')!.solutions).toEqual([4])
  })

  it('intersects rather than picking a side', () => {
    // `a` is x of a point that could be at ±5; `b` is 5. The answer is the
    // overlap, which is the whole point of intersecting rather than copying.
    const r = solve(cs => {
      cs.points.add('o'); cs.points.add('p')
      cs.lines.add('l'); cs.circles.add('c')
      cs.scalars.add('a'); cs.scalars.add('b')
      cs.constraints.push(
        { kind: 'position', point: 'o', x: 0, y: 0 },
        { kind: 'circle-spec', circle: 'c', center: 'o', r: 5 },
        { kind: 'line-equation', line: 'l', a: 0, b: 1, c: 0 },
        { kind: 'on-circle', point: 'p', circle: 'c' },
        { kind: 'on-line', point: 'p', line: 'l' },
        bind('a', 'p', 'x'),
        val('b', 5),
        same('a', 'b'),
      )
    })
    expect(r.scalars.get('a')!.solutions).toEqual([5])
  })
})

describe('unknown and impossible are different answers', () => {
  it('reports a fresh scalar as unknown, not as having no answer', () => {
    const r = solve(cs => { cs.scalars.add('k') })
    expect(r.scalars.get('k')!.solutions).toBeUndefined()
    expect(r.scalars.get('k')!.dof).toBe(1)
  })

  it('reports an unplaced line as unknown too', () => {
    // With the gauge fixer on, a free line gets placed canonically — so this
    // has to ask what the constraints alone determine.
    const cs: ConstraintSet = {
      points: new Set(), segments: new Set(), lines: new Set(['l']), circles: new Set(),
      scalars: new Set(), constraints: [], picks: new Map(),
    }
    const r = new Solver(new GeometricPropagate(), new NonePick()).solve(cs)
    expect(r.lines.get('l')!.solutions).toBeUndefined()
  })
})
