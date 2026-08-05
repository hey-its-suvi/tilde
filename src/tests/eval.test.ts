import { describe, expect, it } from 'vitest'
import { runProgram } from '../lang/defs/eval.js'
import type { Definition } from '../lang/defs/types.js'
import type { ResolvedConstraint } from '../lang/solver/interface.js'
import { Solver } from '../lang/solver/solver.js'
import { GeometricPropagate } from '../lang/solver/propagate/geometric/index.js'
import { RuleBasedPick } from '../lang/solver/pick/rule-based/index.js'

import { loadModule } from '../lang/defs/modules.js'
import { PRELUDE } from '../lang/prelude/index.js'

// Everything below runs against the real prelude, loaded the way a program
// loads it: `import prelude`, which re-exports shapes and constraints.
const prelude = loadModule('prelude', PRELUDE)
const table: Definition[] = prelude.scope

const run = (...statements: string[]) => runProgram(statements, prelude)

/** Constraints of one kind, so assertions don't depend on emission order
 *  across kinds. */
const of = <K extends ResolvedConstraint['kind']>(cs: ResolvedConstraint[], kind: K) =>
  cs.filter((c): c is Extract<ResolvedConstraint, { kind: K }> => c.kind === kind)

describe('primitives emit solver constraints', () => {
  it('declares elements into the right sets', () => {
    const { constraints } = run('point p', 'line l', 'circle c')
    expect([...constraints.points]).toEqual(['p'])
    expect([...constraints.lines]).toEqual(['l'])
    expect([...constraints.circles]).toEqual(['c'])
  })

  it('emits a position constraint with numeric literals', () => {
    const { constraints } = run('point p', 'p at 3 5')
    expect(of(constraints.constraints, 'position')).toEqual([
      { kind: 'position', point: 'p', x: 3, y: 5 },
    ])
  })

  it('emits incidence against the dispatched locus', () => {
    const { constraints } = run('point p', 'line l', 'circle c', 'p on l', 'p on c')
    expect(of(constraints.constraints, 'on-line')).toEqual([
      { kind: 'on-line', point: 'p', line: 'l' },
    ])
    expect(of(constraints.constraints, 'on-circle')).toEqual([
      { kind: 'on-circle', point: 'p', circle: 'c' },
    ])
  })

  it('emits parallel with and without a distance', () => {
    const { constraints } = run('line l', 'line m', 'line n', 'l parallel m', 'l parallel n at 4')
    expect(of(constraints.constraints, 'parallel')).toEqual([
      { kind: 'parallel', l1: 'l', l2: 'm' },
      { kind: 'parallel', l1: 'l', l2: 'n', distance: 4 },
    ])
  })
})

describe('composed bodies expand', () => {
  it('substitutes slots into each body line', () => {
    // `point p at 3 5` is `point p` then `p at 3 5`.
    const { constraints, types } = run('point p at 3 5')
    expect(types.get('p')).toBe('Point')
    expect(of(constraints.constraints, 'position')).toEqual([
      { kind: 'position', point: 'p', x: 3, y: 5 },
    ])
  })

  it('expands a declaring constraint form', () => {
    const { constraints, types } = run('line m', 'line l parallel m')
    expect(types.get('l')).toBe('Line')
    expect(of(constraints.constraints, 'parallel')).toEqual([
      { kind: 'parallel', l1: 'l', l2: 'm' },
    ])
  })

  it('expands two levels deep', () => {
    // `circle c with center o and radius 5`
    //   → `circle c with center o` → `circle c`, `c with center o`
    //   → `c with radius 5`
    const { constraints, types } = run('point o', 'circle c with center o and radius 5')
    expect(types.get('c')).toBe('Circle')
    expect(of(constraints.constraints, 'circle-spec')).toEqual([
      { kind: 'circle-spec', circle: 'c', center: 'o', r: null },
      { kind: 'circle-spec', circle: 'c', center: null, r: 5 },
    ])
  })

  it('routes `through` to the incidence it is defined as', () => {
    const { constraints } = run('point p', 'line l', 'l through p')
    expect(of(constraints.constraints, 'on-line')).toEqual([
      { kind: 'on-line', point: 'p', line: 'l' },
    ])
  })

  it('builds a line through two points', () => {
    const { constraints } = run('point p', 'point q', 'line l through p q')
    expect(of(constraints.constraints, 'on-line')).toEqual([
      { kind: 'on-line', point: 'p', line: 'l' },
      { kind: 'on-line', point: 'q', line: 'l' },
    ])
  })
})

describe('multi-name declaration forms', () => {
  it('types every name a triangle introduces', () => {
    // This is what resolution alone could not do: a/b/c are Points because the
    // body says `point a` etc., not because of the return type.
    const { types, constraints } = run('triangle t with a b c')
    expect(types.get('t')).toBe('Triangle')
    expect(types.get('a')).toBe('Point')
    expect(types.get('b')).toBe('Point')
    expect(types.get('c')).toBe('Point')
    expect([...constraints.points].sort()).toEqual(['a', 'b', 'c'])
  })

  it('keeps the composite out of the solver but keeps its segments', () => {
    const { constraints } = run('triangle t with a b c')
    expect([...constraints.segments].sort()).toEqual(['a:b', 'a:c', 'b:c'])
    // Triangle is a language-level tag; the solver has no set for it.
    expect([...constraints.lines]).toEqual([])
  })

  it('lets the vertices be constrained afterwards', () => {
    const { constraints } = run('triangle t with a b c', 'a at 0 0', 'distance between a and b is 5')
    expect(of(constraints.constraints, 'position')).toEqual([
      { kind: 'position', point: 'a', x: 0, y: 0 },
    ])
    expect(of(constraints.constraints, 'distance')).toEqual([
      { kind: 'distance', p1: 'a', p2: 'b', value: 5 },
    ])
  })
})

describe('errors', () => {
  it('rejects redeclaring a name', () => {
    expect(() => run('point p', 'point p')).toThrow(/"p" is already declared as a Point/)
  })

  it('reports a redeclaration that happens inside a body', () => {
    // `line l parallel m` expands to `line l`, which collides.
    expect(() => run('line m', 'point l', 'line l parallel m')).toThrow(/already declared/)
  })

  it('rejects using a name before it is declared', () => {
    expect(() => run('p on l', 'point p', 'line l')).toThrow(/no definition of "p on l" fits/)
  })

  it('rejects an unknown statement', () => {
    expect(() => run('frobnicate x')).toThrow(/no definition matches/)
  })
})

describe('a program reaches the solver seam', () => {
  it('produces a ConstraintSet for a two-points-on-a-line problem', () => {
    const { constraints } = run(
      'point a at 0 0',
      'point b',
      'line l through a b',
      'distance between a and b is 10',
    )
    expect([...constraints.points].sort()).toEqual(['a', 'b'])
    expect([...constraints.lines]).toEqual(['l'])
    expect([...constraints.segments]).toEqual(['a:b'])
    expect(constraints.constraints).toEqual([
      { kind: 'position', point: 'a', x: 0, y: 0 },
      { kind: 'on-line', point: 'a', line: 'l' },
      { kind: 'on-line', point: 'b', line: 'l' },
      { kind: 'distance', p1: 'a', p2: 'b', value: 10 },
    ])
  })
})

describe('the solver accepts what evaluation produces', () => {
  it('solves a triangle built entirely from prelude definitions', () => {
    const { constraints } = run(
      'point a at 0 0',
      'point b at 6 0',
      'point c at 3 4',
      'line l through a b',
    )
    const result = new Solver(new GeometricPropagate(), new RuleBasedPick()).solve(constraints)

    expect(result.points.get('c')!.solutions[0]).toEqual({ x: 3, y: 4 })
    expect(result.points.get('c')!.dof).toBe(0)
    // l is pinned by two known points, giving the x-axis: ax + by + c = 0 with
    // a = c = 0 and b free to scale.
    const l = result.lines.get('l')!
    expect(l.dof).toBe(0)
    expect(l.solutions[0]!.a).toBeCloseTo(0)
    expect(l.solutions[0]!.c).toBeCloseTo(0)
    expect(Math.abs(l.solutions[0]!.b)).toBeGreaterThan(0)
  })

  it('leaves a line underdetermined when nothing pins it', () => {
    // The wavy line: declaring a form without fixing it is legal in Tilde.
    const { constraints } = run('line m', 'line l parallel m')
    const result = new Solver(new GeometricPropagate(), new RuleBasedPick()).solve(constraints)
    expect(result.lines.get('l')!.dof).toBeGreaterThan(0)
  })
})
