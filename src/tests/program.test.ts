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
    return n

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
    expect(result.points.get('c')!.solutions![0]).toEqual({ x: 3, y: 4 })
    expect(result.lines.get('l')!.dof).toBe(0)
  })

  it('lets a program define its own syntax and then use it', () => {
    // The point of the whole exercise: `right triangle` is not built in, and
    // its definition uses nothing a user could not write.
    const result = solve(`
import prelude

define right triangle (t: Name) with legs (u: Scalar) (v: Scalar) => Triangle =
    triangle t with p q r
    p at 0 0
    q at u 0
    r at 0 v
    return t

right triangle t with legs 3 4
`)
    // The vertices belong to the triangle, so they are keyed by it — `p`, `q`
    // and `r` are the definition's own names for them and never leave.
    expect(result.points.get('t.point1')!.solutions![0]).toEqual({ x: 0, y: 0 })
    expect(result.points.get('t.point2')!.solutions![0]).toEqual({ x: 3, y: 0 })
    expect(result.points.get('t.point3')!.solutions![0]).toEqual({ x: 0, y: 4 })
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

describe('semicolons are optional line terminators', () => {
  it('accepts one on statements, imports and body lines', () => {
    const result = solve(`
import prelude;

define dot (n: Name) at (x: Scalar) (y: Scalar) => Circle =
    point n at x y;
    circle c with center n and radius 1;
    return c;

dot d at 3 4;
`)
    expect(result.points.get('d')!.solutions![0]).toEqual({ x: 3, y: 4 })
    expect(result.circles.get('d_c')!.solutions![0]).toEqual({ center: 'd', r: 1 })
  })

  it('treats a terminated and an unterminated program as identical', () => {
    const bare = 'import prelude\npoint a at 1 2\nline l\n'
    const semi = 'import prelude;\npoint a at 1 2;\nline l;\n'
    expect(run(semi).constraints).toEqual(run(bare).constraints)
  })

  it('rejects one on a define header, where the body is still to come', () => {
    expect(() =>
      run('import prelude\n\ndefine twice (n: Name) => Point =;\n    point n\n    return n\n'),
    ).toThrow(/takes no ';'/)
  })
})

describe('return says what comes back', () => {
  const dot = (bodyLines: string) => `
import prelude

define dot (n: Name) at (x: Scalar) (y: Scalar) => Circle =
${bodyLines}

dot d at 3 4
`

  it('frees the body from having to end with the result', () => {
    // The last *statement* is about the point, but the circle comes back. Under
    // a last-line rule this would have returned the point.
    //
    // Note statements still run in order and declaration-before-use still holds
    // inside a body — `return` decides the result, not the sequencing.
    const result = solve(dot(`    point n
    circle c with center n and radius 1
    n at x y
    return c`))
    expect(result.points.get('d')!.solutions![0]).toEqual({ x: 3, y: 4 })
    expect(result.circles.get('d_c')!.solutions![0]).toEqual({ center: 'd', r: 1 })
  })

  it('catches a return that does not match the signature', () => {
    expect(() => run(dot(`    point n at x y
    circle c with center n and radius 1
    return n`))).toThrow(/promises Circle but returned Point/)
  })

  it('accepts a whole statement, not just a name', () => {
    const result = solve(dot(`    point n at x y
    return circle c with center n and radius 2`))
    expect(result.circles.get('d_c')!.solutions![0]).toEqual({ center: 'd', r: 2 })
  })

  it('requires a return when the signature promises one', () => {
    expect(() => run(dot('    point n at x y'))).toThrow(
      /returns Circle, so its body needs a `return` line/,
    )
  })

  it('requires a signature when the body returns', () => {
    expect(() =>
      run('import prelude\n\ndefine mark (n: Name) =\n    point n\n    return n\n'),
    ).toThrow(/needs a `=> Type`/)
  })

  it('insists return is the last line, since it is not control flow', () => {
    expect(() => run(dot(`    return n
    point n at x y`))).toThrow(/must be a body's last line/)
  })
})

describe('a body\'s own names belong to the call, not the program', () => {
  const dot = `
import prelude

define dot (n: Name) at (x: Scalar) (y: Scalar) =
    point n at x y
    circle c with center n and radius 1

dot d at 3 4
dot e at 1 1
`

  it('lets the same definition be used more than once', () => {
    // `c` is written literally in the body, so each call gets its own.
    const result = solve(dot)
    expect(result.circles.get('d_c')!.solutions![0]).toEqual({ center: 'd', r: 1 })
    expect(result.circles.get('e_c')!.solutions![0]).toEqual({ center: 'e', r: 1 })
  })

  it('gives each call its own copy, under a key naming the call', () => {
    const { types } = run(dot)
    expect([...types.keys()].sort()).toEqual(['d', 'd_c', 'e', 'e_c'])
    expect(types.has('c')).toBe(false)
  })

  it('does not yet hide the local — the key is still reachable', () => {
    // Uniquification, not encapsulation: two calls cannot collide, but nothing
    // stops an outer statement naming `d_c` deliberately. Closing this is a
    // separate decision, not an oversight.
    expect(() => run(`${dot}d_c with radius 9\n`)).not.toThrow()
  })

  it('leaves names that came from a slot alone', () => {
    // `n` is a Name slot, so `d` and `e` are the caller's own names, untouched.
    const { types } = run(dot)
    expect(types.get('d')).toBe('Point')
    expect(types.get('e')).toBe('Point')
  })

  it('changes nothing for a definition with no names of its own', () => {
    // The whole prelude is like this, which is why none of it moved.
    const { types } = run('import prelude\npoint a\npoint b\nline l through a b\n')
    expect([...types.keys()].sort()).toEqual(['a', 'b', 'l'])
  })

  it('defers a definition with locals but no Name slot to key them by', () => {
    expect(() =>
      run('import prelude\n\ndefine grid =\n    point origin at 0 0\n\ngrid\n'),
    ).toThrow(/takes no Name slot to key it by/)
  })
})
