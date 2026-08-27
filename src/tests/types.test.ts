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

const at = (source: string, name: string) => solve(source).points.get(name)!.solutions[0]

describe('declaring a type', () => {
  it('reads fields written type-then-name, like a declaration', () => {
    const { types } = parseFile('define type Triangle =\n    Point a\n    Point b\n    Point c\n')
    expect(types).toEqual([
      {
        name: 'Triangle',
        line: 1,
        fields: [
          { name: 'a', type: { name: 'Point', list: false } },
          { name: 'b', type: { name: 'Point', list: false } },
          { name: 'c', type: { name: 'Point', list: false } },
        ],
      },
    ])
  })

  it('reads a list field', () => {
    const { types } = parseFile('define type Polygon =\n    [Point] vertices\n')
    expect(types[0]!.fields[0]).toEqual({ name: 'vertices', type: { name: 'Point', list: true } })
  })

  it('tells a type declaration apart from a definition', () => {
    const src = 'define type Pair =\n    Point a\n    Point b\n\ndefine twin (n: Name) => Point =\n    point n\n    return n\n'
    const parsed = parseFile(src)
    expect(parsed.types).toHaveLength(1)
    expect(parsed.definitions).toHaveLength(1)
  })

  it('rejects a malformed header', () => {
    expect(() => parseFile('define type =\n    Point a\n')).toThrow(/reads `define type Name =`/)
  })

  it('rejects a field written the other way round', () => {
    expect(() => parseFile('define type T =\n    a: Point\n')).toThrow(/a field reads `Type name`/)
  })

  it('rejects a type with no fields', () => {
    expect(() => parseFile('define type T =\n\npoint p\n')).toThrow(/declares no fields/)
  })

  it('rejects a repeated field', () => {
    expect(() => parseFile('define type T =\n    Point a\n    Point a\n')).toThrow(
      /declares field 'a' twice/,
    )
  })

  it('rejects declaring the same type twice', () => {
    const registry: Registry = {
      ...PRELUDE,
      main: 'import prelude\ndefine type Triangle =\n    Point a\n',
    }
    expect(() => loadModule('main', registry)).toThrow(/type Triangle is already declared/)
  })
})

describe('reaching a field', () => {
  const tri = 'import prelude\ntriangle t with a b c\n'

  it('names the same element the caller named', () => {
    // `t.a` and `a` are two spellings of one point, so constraining either works.
    expect(at(`${tri}t.point1 at 0 0\nt.point2 at 6 0\nt.point3 at 3 4\n`, 't.point1')).toEqual({ x: 0, y: 0 })
    expect(at(`${tri}a at 1 1\nt.point2 at 6 0\nt.point3 at 3 4\n`, 't.point1')).toEqual({ x: 1, y: 1 })
  })

  it('fits a slot like any other name', () => {
    const { constraints } = run(`${tri}line l through t.point1 t.point2\n`)
    expect(constraints.constraints).toContainEqual({ kind: 'on-line', point: 't.point1', line: 'l' })
    expect(constraints.constraints).toContainEqual({ kind: 'on-line', point: 't.point2', line: 'l' })
  })

  it('dispatches on the field’s type, not the owner’s', () => {
    // `t.point1 on l` picks the Point-on-Line form because `t.a` is a Point.
    const { constraints } = run(`${tri}line l\nt.point1 on l\n`)
    expect(constraints.constraints).toContainEqual({ kind: 'on-line', point: 't.point1', line: 'l' })
  })

  it('records what each field references', () => {
    const { parts } = run(tri)
    expect([...parts.get('t')!]).toEqual([
      ['point1', 't.point1'],
      ['point2', 't.point2'],
      ['point3', 't.point3'],
    ])
  })

  it('never shows the solver a composite', () => {
    const { constraints } = run(`${tri}t.point1 at 0 0\n`)
    expect(constraints.constraints).not.toContainEqual(
      expect.objectContaining({ point: 't' }),
    )
    expect([...constraints.points].sort()).toEqual(['t.point1', 't.point2', 't.point3'])
  })
})

describe('errors name what went wrong', () => {
  it('reports an unknown field, and lists the real ones', () => {
    expect(() => run('import prelude\ntriangle t with a b c\nt.z at 0 0\n')).toThrow(
      /Triangle has no field "z" \(it has point1, point2, point3\)/,
    )
  })

  it('reports reaching into something with no fields', () => {
    expect(() => run('import prelude\npoint p\np.a at 0 0\n')).toThrow(
      /Point has no fields, so "p.a" means nothing/,
    )
  })

  it('reports an undeclared owner', () => {
    expect(() => run('import prelude\nt.point1 at 0 0\n')).toThrow(/"t" is not declared/)
  })

  it('rejects a field set to the wrong kind of thing', () => {
    const src = `import prelude

define type Pair =
    Point a
    Point b

define pair (n: Name) of (x: Point) (y: Line) => Pair =
    tsx\`
    return declare(n, 'Pair', { a: x, b: y })
    \`

point p
line l
pair q of p l
`
    expect(() => run(src)).toThrow(/"q.b" holds a Point, but "l" is a Line/)
  })

  it('rejects a field left unset', () => {
    const src = `import prelude

define type Pair =
    Point a
    Point b

define half (n: Name) of (x: Point) => Pair =
    tsx\`
    return declare(n, 'Pair', { a: x })
    \`

point p
half q of p
`
    expect(() => run(src)).toThrow(/its field "b" was not set/)
  })
})

describe('a user declares their own type', () => {
  it('works end to end without touching the prelude', () => {
    const result = solve(`
import prelude

define type Segment =
    Point from
    Point to

define segment (n: Name) from (p: Point) to (q: Point) => Segment =
    tsx\`
    segment(p, q)
    return declare(n, 'Segment', { from: p, to: q })
    \`

point p at 0 0
point q at 3 4
segment s from p to q
distance between s.from and s.to is 5
`)
    expect(result.points.get('p')!.solutions[0]).toEqual({ x: 0, y: 0 })
    expect(result.points.get('q')!.solutions[0]).toEqual({ x: 3, y: 4 })
  })
})

describe('a body can reach a field of something in a slot', () => {
  it('substitutes the root of a dotted path', () => {
    // The bug this exists for: `n.p` is one token, so matching whole tokens
    // against the slot `n` never rewrote it, and the body looked for a name
    // spelled "n.p" that nothing had declared.
    const result = solve(`
import prelude

define type Dot =
    Point p
    Scalar r

define dot (n: Name) (x: Scalar) (y: Scalar) =
    new Dot n
    n.p at x y

dot a 1 2
dot b 4 5
`)
    expect(result.points.get('a.p')!.solutions[0]).toEqual({ x: 1, y: 2 })
    expect(result.points.get('b.p')!.solutions[0]).toEqual({ x: 4, y: 5 })
  })

  it('does not depend on the caller using the slot’s own name', () => {
    // Every earlier triangle test named it `t`, which is also the slot name —
    // so the substitution was never actually exercised.
    const named = (n: string) => run(`import prelude\ntriangle ${n} with a b c\n`).types
    expect([...named('q').keys()].sort()).toEqual(['q', 'q.point1', 'q.point2', 'q.point3'])
    expect([...named('t').keys()].sort()).toEqual(['t', 't.point1', 't.point2', 't.point3'])
  })

  it('reaches a field of a field', () => {
    const result = solve(`
import prelude

define type Pair =
    Point one
    Point two

define type Twin =
    Pair left
    Pair right

define twin (n: Name) =
    new Twin n
    n.left.one at 0 0
    n.right.two at 9 9

twin w
`)
    // `new` reached all the way down, and a two-step path resolves.
    expect(result.points.get('w.left.one')!.solutions[0]).toEqual({ x: 0, y: 0 })
    expect(result.points.get('w.right.two')!.solutions[0]).toEqual({ x: 9, y: 9 })
  })
})
