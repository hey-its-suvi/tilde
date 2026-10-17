import { describe, expect, it } from 'vitest'
import { parseFile } from '../lang/defs/parser.js'
import { DefinitionError, DEFAULT_LEVEL, typeText, type Pattern } from '../lang/defs/types.js'

// Loaded as text through Vite, not the filesystem — the playground runs in the
// browser and will need the prelude bundled the same way.
import { PRELUDE } from '../lang/prelude/index.js'

const prelude = (name: string) => PRELUDE[name]!

/** Render a pattern back to its surface form, so tests read like the source. */
const show = (p: Pattern) =>
  p.map(part => (part.part === 'keyword' ? part.word : `(${part.name}: ${typeText(part.type)})`)).join(' ')

describe('header parsing', () => {
  it('reads keywords and typed slots in order', () => {
    const { definitions } = parseFile('define (a: Line) parallel (b: Line) => Line:\n    a on b\n    return a\n')
    expect(definitions).toHaveLength(1)
    expect(show(definitions[0]!.pattern)).toBe('(a: Line) parallel (b: Line)')
    expect(definitions[0]!.returns).toEqual({ name: 'Line', list: false })
  })

  it('treats a missing arrow as returning nothing', () => {
    const { definitions } = parseFile('define nothing (a: Line):\n    a on b\n')
    expect(definitions[0]!.returns).toBeNull()
  })

  it('reads list slots', () => {
    const { definitions } = parseFile('define centroid of (ps: [Point]) => Point:\n    tsx`\n    x\n    `\n')
    expect(show(definitions[0]!.pattern)).toBe('centroid of (ps: [Point])')
  })

  it('rejects anything after the terminator', () => {
    // The body goes on the next line, so a header ends at its colon.
    expect(() => parseFile('define (a: Line) foo => Line: a on b\n')).toThrow(
      /a define line ends in ':'/,
    )
  })

  it('lets `=` be an ordinary pattern word', () => {
    // Freed by moving the terminator to `:` — `=` has no built-in meaning, it is
    // a character a pattern may use, and means whatever its definition does.
    const { definitions } = parseFile(
      'define point (n: new Point) = (x: Scalar) (y: Scalar) => Point:\n    point n\n    n at x y\n    return n\n',
    )
    expect(show(definitions[0]!.pattern)).toBe('point (n: new Point) = (x: Scalar) (y: Scalar)')
    expect(definitions[0]!.returns).toEqual({ name: 'Point', list: false })
  })

  it('rejects duplicate slot names', () => {
    expect(() => parseFile('define (a: Line) x (a: Line):\n    a on a\n')).toThrow(/duplicate slot name/)
  })
})

describe('how tightly a definition binds', () => {
  const one = (src: string) => parseFile(src).definitions[0]!

  it('is the default when nothing is said', () => {
    expect(one('define (a: Scalar) + (b: Scalar) => Scalar:\n    return a\n').level).toBe(DEFAULT_LEVEL)
  })

  it('is written after the return type', () => {
    const def = one('define (a: Scalar) + (b: Scalar) => Scalar at 6:\n    return a\n')
    expect(def.level).toBe(6)
    expect(def.returns).toEqual({ name: 'Scalar', list: false })
    expect(show(def.pattern)).toBe('(a: Scalar) + (b: Scalar)')
  })

  it('takes `=> Null` for a definition that gives back nothing', () => {
    const def = one('define (a: Point) = (b: Point) => Null at 1:\n    a on b\n')
    expect(def.level).toBe(1)
    expect(def.returns).toBeNull()
  })

  it('treats `=> Null` with no level the same as no arrow', () => {
    expect(one('define note (x: Scalar) => Null:\n    print x\n').returns).toBeNull()
  })

  it('keeps `at` in a pattern a pattern word', () => {
    // `at` before the arrow is part of the pattern, as it always was.
    const def = one('define (a: Line) parallel (b: Line) at (d: Scalar) => Line:\n    return a\n')
    expect(show(def.pattern)).toBe('(a: Line) parallel (b: Line) at (d: Scalar)')
    expect(def.level).toBe(DEFAULT_LEVEL)
  })

  it('needs a number after `at`', () => {
    expect(() => parseFile('define (a: Scalar) + (b: Scalar) => Scalar at six:\n    return a\n'))
      .toThrow(/expected a number after `at`/)
  })

  it('takes nothing else after the return type', () => {
    expect(() => parseFile('define (a: Scalar) + (b: Scalar) => Scalar at 6 tight:\n    return a\n'))
      .toThrow(/expected ':' after the return type/)
  })

  it('does not let a `Null` definition return something', () => {
    expect(() => parseFile('define (a: Scalar) half => Null:\n    return a\n'))
      .toThrow(/needs a `=> Type`/)
  })
})

describe('body framing', () => {
  it('ends a body at a blank line', () => {
    const { definitions } = parseFile(
      'define a (x: Line):\n    one\n    two\n\ndefine b (y: Line):\n    three\n',
    )
    expect(definitions).toHaveLength(2)
    expect(definitions[0]!.body).toEqual({ body: 'tilde', lines: ['one', 'two'], result: null })
  })

  it('reports a stray blank line where it happened, not further on', () => {
    // A blank line mid-body truncates it, leaving orphaned statements. The
    // error names those rather than cascading into the next definition.
    expect(() => parseFile('define a (x: Line):\n    one\n\n    two\n')).toThrow(
      /indented line outside a definition body/,
    )
  })

  it('ends a body at the next column-0 line', () => {
    const { definitions } = parseFile(
      'define a (x: Line):\n    one\ndefine b (y: Line):\n    two\n',
    )
    expect(definitions).toHaveLength(2)
    expect(definitions[0]!.body).toEqual({ body: 'tilde', lines: ['one'], result: null })
  })

  it('keeps blank lines inside a tsx block', () => {
    const { definitions } = parseFile(
      'define a (x: Line):\n    tsx`\n    first\n\n    second\n    `\n',
    )
    expect(definitions[0]!.body).toEqual({ body: 'tsx', code: '    first\n\n    second' })
  })

  it('rejects a definition with no body', () => {
    expect(() => parseFile('define a (x: Line):\n\ndefine b (y: Line):\n    z\n')).toThrow(/no body/)
  })

  it('rejects an unterminated tsx block', () => {
    expect(() => parseFile('define a (x: Line):\n    tsx`\n    code\n')).toThrow(/unterminated/)
  })

  it('reports a stray indented line rather than cascading', () => {
    expect(() => parseFile('  orphan\n')).toThrow(DefinitionError)
  })
})

describe('the prelude parses', () => {
  // Line numbers are checked by the `line` field but not pinned here — these
  // files are comment-heavy and the numbers would churn on every edit.
  const importsOf = (src: string) =>
    parseFile(src).imports.map(({ name, reexport }) => ({ name, reexport }))

  it('reads imports without resolving them', () => {
    expect(importsOf(prelude('prelude'))).toEqual([
      { name: 'core', reexport: true },
      { name: 'shapes', reexport: true },
      { name: 'constraints', reexport: true },
    ])
  })

  it('tells a private import from a re-exported one', () => {
    expect(importsOf(prelude('shapes'))).toEqual([{ name: 'core', reexport: false }])
  })

  it('reads every definition in core.til', () => {
    const forms = parseFile(prelude('core')).definitions.map(d => show(d.pattern))

    expect(forms).toContain('point (n: new Point)')
    expect(forms).toContain('(p: Point) at (x: Scalar) (y: Scalar)')
    expect(forms).toContain('(a: Line) parallel (b: Line) at (d: Scalar)')
    expect(forms).toContain('distance between (p: Point) and (q: Point) is (d: Scalar)')
  })

  it('reads every definition in shapes.til', () => {
    const forms = parseFile(prelude('shapes')).definitions.map(d => show(d.pattern))

    expect(forms).toContain('circle (n: new Circle) with center (p: Point) and radius (r: Scalar)')
    expect(forms).toContain('triangle (t: new Triangle) with (a: new Point) (b: new Point) (c: new Point)')
  })

  it('reads every definition in constraints.til', () => {
    const forms = parseFile(prelude('constraints')).definitions.map(d => show(d.pattern))

    expect(forms).toContain('(a: Line) perpendicular (b: Line) at (p: Point)')
    expect(forms).toContain('(l: Line) through (p: Point)')
  })

  it('confines the tsx hatch to core', () => {
    const hatched = (name: string) =>
      parseFile(prelude(name)).definitions.filter(d => d.body.body === 'tsx').length

    // The design check: every convenient form composes from primitives, using
    // nothing a user could not use. If a hatch appears outside core, either the
    // primitives are wrong or something took a shortcut.
    expect(hatched('core')).toBe(25)
    expect(hatched('shapes')).toBe(0)
    expect(hatched('constraints')).toBe(0)
  })

  it('is mostly primitives, now that declaring forms are read rather than defined', () => {
    const all = ['core', 'shapes', 'constraints'].flatMap(n => parseFile(prelude(n)).definitions)

    // Measured, not aspirational: 25 primitive to 13 composed. It was 25 to 20
    // until the declaring forms went — `line l parallel m` reads as
    // `(line l) parallel m` and needs no definition of its own (decision 19).
    expect(all.filter(d => d.body.body === 'tsx')).toHaveLength(25)
    expect(all.filter(d => d.body.body === 'tilde')).toHaveLength(13)
  })

  it('gives every definition a return type except those with a reason not to', () => {
    const all = ['core', 'shapes', 'constraints'].flatMap(n => parseFile(prelude(n)).definitions)
    const void_ = all.filter(d => d.returns === null).map(d => show(d.pattern))

    // A few exceptions, each for a reason. `distance` takes a length rather than
    // returning one, because the solver stores a length for a pair of points but
    // cannot hand a measurement back. The rest are acts rather than relations —
    // they make, name, draw, show or set something, and there is no subject to
    // give back. Every `=` gives nothing back so that it binds loosest
    // (decision 19). Everything else returns its subject and chains (4b).
    expect(void_.sort()).toEqual([
      '(p: Point) = (q: Point)',
      '(p: Point) = (x: Scalar) (y: Scalar)',
      '(s: Scalar) = (v: Scalar)',
      'call (x: Any) (n: new Any)',
      'distance between (p: Point) and (q: Point) is (d: Scalar)',
      'new (ty: Type) (n: new Any)',
      'point (n: new Point) = (q: Point)',
      'point (n: new Point) = (x: Scalar) (y: Scalar)',
      'print (x: Any)',
      'scalar (n: new Scalar) = (v: Scalar)',
      'segment (p: Point) (q: Point)',
      'set (s: Name) off',
      'set (s: Name) on',
    ])
  })
})
