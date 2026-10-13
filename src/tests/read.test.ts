import { describe, expect, it } from 'vitest'
import { runSource } from '../lang/defs/eval.js'
import { PRELUDE } from '../lang/prelude/index.js'
import { byName } from './named.js'

// Reading a line left to right (decision 19): the longest match first, its
// result filling the first slot of what comes next; backing off when that does
// not work; and restarting from a later word when nothing from the first does.

const run = (src: string, module = 'prelude') => {
  const program = runSource(`import ${module}\n${src}`, PRELUDE)
  return { ...byName(program), prints: program.prints }
}
const kinds = (src: string, module?: string) =>
  run(src, module).constraints.constraints.map(c => c.kind)

describe('a line folds left to right', () => {
  it('chains a declaring form into a constraint', () => {
    const { constraints } = run('line m\npoint p at 1 1\nline l parallel m through p\n')
    expect(constraints.constraints).toContainEqual({ kind: 'parallel', l1: 'l', l2: 'm' })
    expect(constraints.constraints).toContainEqual({ kind: 'on-line', point: 'p', line: 'l' })
  })

  it('chains constraints on something that already exists', () => {
    const { constraints } = run('line m\nline l\npoint p\nl parallel m through p\n')
    expect(constraints.constraints).toContainEqual({ kind: 'parallel', l1: 'l', l2: 'm' })
    expect(constraints.constraints).toContainEqual({ kind: 'on-line', point: 'p', line: 'l' })
  })

  it('reads `line l parallel m` as `(line l) parallel m` when nothing longer exists', () => {
    // `core` has `line n` and `(a) parallel (b)`, but no declaring form.
    const { constraints, typeOf } = run('line m\nline l parallel m\n', 'core')
    expect(typeOf('l')).toBe('Line')
    expect(constraints.constraints).toEqual([{ kind: 'parallel', l1: 'l', l2: 'm' }])
  })

  it('lets a longer definition win, which is how one overrides', () => {
    const src = `define line (n: new Line) parallel (m: Line) => Line:
    line n
    n parallel m
    print "mine"
    return n
line m
line l parallel m
`
    expect(run(src, 'core').prints).toEqual([{ text: 'mine' }])
  })

  it('backs off when the longest match does not fit the types', () => {
    // The override takes a Circle; `m` is a Line, so it is `(line l) parallel m`.
    const src = `define line (n: new Line) parallel (c: Circle) => Line:
    line n
    print "circle"
    return n
line m
line l parallel m
`
    const program = run(src, 'core')
    expect(program.prints).toEqual([])
    expect(program.constraints.constraints).toEqual([{ kind: 'parallel', l1: 'l', l2: 'm' }])
  })

  it('folds arithmetic left to right', () => {
    expect(run('print 2 + 3 * 4\n').prints).toEqual([20])
  })

  it('knows the type of a name given earlier on the same line', () => {
    const src = `define (p: Point) beside (q: Point) => Point:
    print "beside"
    return p
point a beside a
`
    const program = run(src, 'core')
    expect(program.typeOf('a')).toBe('Point')
    expect(program.prints).toEqual([{ text: 'beside' }])
  })
})

describe('a line restarts from a later word', () => {
  it('reads a call in a slot other than the first', () => {
    // `print 1` reads, but `+ 2` cannot follow it; from the second word, `1 + 2` does.
    expect(run('print 1 + 2\n').prints).toEqual([3])
  })

  it('uses a definition that takes nothing', () => {
    const src = `define greeting => Text:
    return "hello"
print greeting
`
    expect(run(src).prints).toEqual([{ text: 'hello' }])
  })

  it('leaves a line that reads left to right alone', () => {
    expect(kinds('line m\nline l\nl parallel m\n')).toEqual(['parallel'])
  })
})

describe('`=` gives nothing back, so it binds loosest', () => {
  // A stand-in for a rotation: what matters is that it makes a *new* line.
  const rotated = `define (l: Line) rotated (s: Scalar) => Line:
    line r
    r parallel l
    return r
define line (n: new Line) = (m: Line):
    call m n
`

  it('names what the right-hand side makes, not what it started from', () => {
    // Left to right this would be `(line n = l) rotated 60`. `=` gives nothing
    // back, so that fails, and `l rotated 60` is read first.
    const program = runSource(`import core\n${rotated}line l\nline n = l rotated 60\n`, PRELUDE)
    const l = program.globals.get('l')!
    const n = program.globals.get('n')!
    expect(program.data.typeOf(n)).toBe('Line')
    expect(n).not.toBe(l)
    expect(program.constraints.constraints).toContainEqual({ kind: 'parallel', l1: n, l2: l })
  })

  it('reads a relation after `=` as said about the right-hand side', () => {
    const { constraints, typeOf } = run('line l\npoint p = (3, 4) on l\n')
    expect(typeOf('p')).toBe('Point')
    expect(constraints.constraints).toContainEqual({ kind: 'on-line', point: 'p', line: 'l' })
  })

  it('cannot chain two `=`, since neither half has a value', () => {
    expect(() => run('scalar a\nscalar b\nscalar c\na = b = c\n')).toThrow(/no definition matches "a = b = c"/)
  })
})

describe('what a line cannot mean', () => {
  it('reports a line with no reading as it did before', () => {
    expect(() => run('line m\nline l\nl frobnicates m\n')).toThrow(/no definition matches "l frobnicates m"/)
  })

  it('gives the plain error for a long line with no reading, rather than giving up', () => {
    // Many routes through the arithmetic reach the same half-read line; each is
    // tried once, so this fails quickly and says why.
    expect(() => run('print 1 + 2 * 3 - 4 / 5 + 6 * 7 - 8 frob 9 + 10\n'))
      .toThrow(/no definition matches/)
  })

  it('reports overloads it cannot choose between, before running anything', () => {
    const src = `define greet (n: new Point) => Point:
    point n
    return n
define greet (n: new Line) => Line:
    line n
    return n
print greet x
`
    expect(() => run(src, 'core')).toThrow(/"greet x" is ambiguous/)
  })
})
