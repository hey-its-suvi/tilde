import { describe, expect, it } from 'vitest'
import { parseFile } from '../lang/defs/parser.js'
import { DefinitionError, type Pattern } from '../lang/defs/types.js'

// Loaded as text through Vite, not the filesystem — the playground runs in the
// browser and will need the prelude bundled the same way.
import shapesSrc from '../lang/prelude/shapes.til?raw'
import constraintsSrc from '../lang/prelude/constraints.til?raw'
import preludeSrc from '../lang/prelude/prelude.til?raw'

const prelude = (name: string) =>
  ({ 'shapes.til': shapesSrc, 'constraints.til': constraintsSrc, 'prelude.til': preludeSrc })[name]!

/** Render a pattern back to its surface form, so tests read like the source. */
const show = (p: Pattern) =>
  p.map(part => (part.part === 'keyword' ? part.word : `(${part.name}: ${part.type.list ? `[${part.type.name}]` : part.type.name})`)).join(' ')

describe('header parsing', () => {
  it('reads keywords and typed slots in order', () => {
    const { definitions } = parseFile('define (a: Line) parallel (b: Line) => Line =\n    a on b\n')
    expect(definitions).toHaveLength(1)
    expect(show(definitions[0]!.pattern)).toBe('(a: Line) parallel (b: Line)')
    expect(definitions[0]!.returns).toEqual({ name: 'Line', list: false })
  })

  it('treats a missing arrow as returning nothing', () => {
    const { definitions } = parseFile('define nothing (a: Line) =\n    a on b\n')
    expect(definitions[0]!.returns).toBeNull()
  })

  it('reads list slots', () => {
    const { definitions } = parseFile('define centroid of (ps: [Point]) => Point =\n    tsx`\n    x\n    `\n')
    expect(show(definitions[0]!.pattern)).toBe('centroid of (ps: [Point])')
  })

  it('rejects anything after =', () => {
    expect(() => parseFile('define (a: Line) foo => Line = a on b\n')).toThrow(/nothing may follow/)
  })

  it('rejects duplicate slot names', () => {
    expect(() => parseFile('define (a: Line) x (a: Line) =\n    a on a\n')).toThrow(/duplicate slot name/)
  })
})

describe('body framing', () => {
  it('ends a body at a blank line', () => {
    const { definitions } = parseFile(
      'define a (x: Line) =\n    one\n    two\n\ndefine b (y: Line) =\n    three\n',
    )
    expect(definitions).toHaveLength(2)
    expect(definitions[0]!.body).toEqual({ body: 'tilde', lines: ['one', 'two'] })
  })

  it('reports a stray blank line where it happened, not further on', () => {
    // A blank line mid-body truncates it, leaving orphaned statements. The
    // error names those rather than cascading into the next definition.
    expect(() => parseFile('define a (x: Line) =\n    one\n\n    two\n')).toThrow(
      /indented line outside a definition body/,
    )
  })

  it('ends a body at the next column-0 line', () => {
    const { definitions } = parseFile(
      'define a (x: Line) =\n    one\ndefine b (y: Line) =\n    two\n',
    )
    expect(definitions).toHaveLength(2)
    expect(definitions[0]!.body).toEqual({ body: 'tilde', lines: ['one'] })
  })

  it('keeps blank lines inside a tsx block', () => {
    const { definitions } = parseFile(
      'define a (x: Line) =\n    tsx`\n    first\n\n    second\n    `\n',
    )
    expect(definitions[0]!.body).toEqual({ body: 'tsx', code: '    first\n\n    second' })
  })

  it('rejects a definition with no body', () => {
    expect(() => parseFile('define a (x: Line) =\n\ndefine b (y: Line) =\n    z\n')).toThrow(/no body/)
  })

  it('rejects an unterminated tsx block', () => {
    expect(() => parseFile('define a (x: Line) =\n    tsx`\n    code\n')).toThrow(/unterminated/)
  })

  it('reports a stray indented line rather than cascading', () => {
    expect(() => parseFile('  orphan\n')).toThrow(DefinitionError)
  })
})

describe('the prelude parses', () => {
  it('reads imports without resolving them', () => {
    expect(parseFile(prelude('prelude.til')).imports).toEqual(['shapes', 'constraints'])
  })

  it('reads every definition in shapes.til', () => {
    const { definitions } = parseFile(prelude('shapes.til'))
    const forms = definitions.map(d => show(d.pattern))

    expect(forms).toContain('point (n: Name)')
    expect(forms).toContain('(p: Point) at (x: Scalar) (y: Scalar)')
    expect(forms).toContain('circle (n: Name) with center (p: Point) and radius (r: Scalar)')
    expect(forms).toContain('triangle (t: Name) with (a: Name) (b: Name) (c: Name)')
  })

  it('reads every definition in constraints.til', () => {
    const { definitions } = parseFile(prelude('constraints.til'))
    const forms = definitions.map(d => show(d.pattern))

    expect(forms).toContain('(a: Line) parallel (b: Line)')
    expect(forms).toContain('(a: Line) parallel (b: Line) at (d: Scalar)')
    expect(forms).toContain('distance between (p: Point) and (q: Point) is (d: Scalar)')
    expect(forms).toContain('line (n: Name) parallel (m: Line)')
  })

  it('splits roughly evenly between tsx hatches and composed Tilde', () => {
    const all = [...parseFile(prelude('shapes.til')).definitions, ...parseFile(prelude('constraints.til')).definitions]
    const tsx = all.filter(d => d.body.body === 'tsx').length
    const composed = all.filter(d => d.body.body === 'tilde').length

    // Measured, not aspirational: 13 tsx to 12 composed. The earlier claim that
    // "most of the prelude composes" was wrong — it is about half. The composed
    // half is the ergonomic surface; the tsx half is the primitive surface.
    expect(tsx).toBe(13)
    expect(composed).toBe(12)
  })

  it('gives every definition a return type except the one that cannot have one', () => {
    const all = [...parseFile(prelude('shapes.til')).definitions, ...parseFile(prelude('constraints.til')).definitions]
    const void_ = all.filter(d => d.returns === null).map(d => show(d.pattern))

    // `distance` is the sole exception, and deliberately so: the solver stores
    // a length for a pair of points but cannot hand a measurement back, so the
    // form takes the length instead of returning it. Everything else returns
    // its subject and chains (decision 4b).
    expect(void_).toEqual(['distance between (p: Point) and (q: Point) is (d: Scalar)'])
  })
})
