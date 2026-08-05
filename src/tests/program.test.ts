import { describe, expect, it } from 'vitest'
import { parseFile } from '../lang/defs/parser.js'
import { runSource } from '../lang/defs/eval.js'
import { loadModule, type Registry } from '../lang/defs/modules.js'
import { PRELUDE } from '../lang/prelude/index.js'
import { Solver } from '../lang/solver/solver.js'
import { GeometricPropagate } from '../lang/solver/propagate/geometric/index.js'
import { RuleBasedPick } from '../lang/solver/pick/rule-based/index.js'

const run = (source: string) => runSource(source, PRELUDE)

const solve = (source: string) =>
  new Solver(new GeometricPropagate(), new RuleBasedPick()).solve(run(source).constraints)

describe('a file holds definitions and statements together', () => {
  it('tells them apart by the layout rule alone', () => {
    // Column 0 and not `define`/`import` ⇒ a statement. Bodies are indented, so
    // nothing is ambiguous and no new syntax was needed.
    const parsed = parseFile(`
import prelude

define chord (n: Name) of (c: Circle) from (p: Point) to (q: Point) => Line =
    line n through p q
    p on c
    q on c

point a at 0 0
line l
`)
    expect(parsed.imports.map(i => i.name)).toEqual(['prelude'])
    expect(parsed.definitions).toHaveLength(1)
    expect(parsed.statements.map(s => s.text)).toEqual(['point a at 0 0', 'line l'])
  })

  it('records the line each statement came from', () => {
    const parsed = parseFile('point a\n\npoint b\n')
    expect(parsed.statements).toEqual([
      { text: 'point a', line: 1 },
      { text: 'point b', line: 3 },
    ])
  })
})

describe('a whole program runs from source', () => {
  it('imports, states, and reaches the solver', () => {
    const result = solve(`
import prelude

point a at 0 0
point b at 6 0
point c at 3 4
line l through a b
`)
    expect(result.points.get('c')!.solutions[0]).toEqual({ x: 3, y: 4 })
    expect(result.lines.get('l')!.dof).toBe(0)
  })

  it('lets a program define its own syntax and then use it', () => {
    // The point of the whole exercise: `right triangle` is not built in, and
    // its definition uses nothing a user could not write.
    const result = solve(`
import prelude

define right triangle (t: Name) at (p: Name) with legs (u: Scalar) (v: Scalar) => Triangle =
    point p at 0 0
    point q at u 0
    point r at 0 v
    t holds p q r

right triangle t at o with legs 3 4
`)
    expect(result.points.get('q')!.solutions[0]).toEqual({ x: 3, y: 0 })
    expect(result.points.get('r')!.solutions[0]).toEqual({ x: 0, y: 4 })
  })

  it('reports where a bad statement is', () => {
    expect(() => run('import prelude\n\nfrobnicate x\n')).toThrow(/\[main:3\]/)
  })

  it('needs the import — nothing is auto-loaded', () => {
    expect(() => run('point a at 0 0\n')).toThrow(/no definition matches "point a at 0 0"/)
  })
})

describe('statements in an imported module', () => {
  const registry: Registry = {
    ...PRELUDE,
    lib: 'import prelude\n\npoint origin at 0 0\n',
  }

  it('run when the module is loaded', () => {
    const { types, constraints } = runSource('import lib\n', registry)
    expect(types.get('origin')).toBe('Point')
    expect(constraints.constraints).toEqual([
      { kind: 'position', point: 'origin', x: 0, y: 0 },
    ])
  })

  it('runs dependencies before the file that imports them', () => {
    const order = loadModule('lib', registry).order.map(m => m.name)
    expect(order.at(-1)).toBe('lib')
    expect(order.indexOf('core')).toBeLessThan(order.indexOf('prelude'))
  })

  it('leaves the importer unable to name what it did not import', () => {
    // `origin` exists as a value, but `point` is not in scope here — lib
    // imported prelude, and imports do not transit.
    expect(() => runSource('import lib\n\npoint p\n', registry)).toThrow(
      /no definition matches "point p"/,
    )
  })
})
