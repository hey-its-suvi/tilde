import { describe, expect, it } from 'vitest'
import { runSource } from '../lang/defs/eval.js'
import { traceStatement } from '../lang/defs/trace.js'
import { PRELUDE } from '../lang/prelude/index.js'

// `traceStatement` only ever listens to the real reader (read.ts's `sink`),
// so these are really tests of what the reader did, read back as a trace.

const programFor = (src: string) => runSource(`import prelude\n${src}`, PRELUDE)

describe('tracing a statement that reads', () => {
  it('shows each fold, longest match chosen, in order', () => {
    const program = programFor(`define line (n: new Line) parallel (m: Line) => Line:
    line n
    n parallel m
    return n
line m
point p at 1 1
`)
    const trace = traceStatement('line l parallel m through p', program.store, program.scope)

    expect(trace.outcome.kind).toBe('read')
    // At least two folds: "line l parallel m" first, then "(…) through p" —
    // there may be a further look afterwards that finds nothing to extend.
    const looks = trace.steps.filter(s => s.kind === 'look')
    expect(looks.length).toBeGreaterThanOrEqual(2)

    const first = trace.steps[0]!
    if (first.kind !== 'look') throw new Error('expected a look step')
    // At "line", both the user's 4-word pattern and the prelude's plain
    // 2-word one match by shape; the longer is chosen.
    expect(first.groups.map(g => g.length)).toEqual([4, 2])
    expect(first.groups[0]!.kept).toEqual(['line (n: new Line) parallel (m: Line)'])

    if (trace.outcome.kind !== 'read') throw new Error('expected a reading')
    expect(trace.outcome.lines[0]).toContain('line (n: new Line) parallel (m: Line)')
    expect(trace.outcome.lines[1]).toContain('(l: Line) through (p: Point)')
  })

  it('names the conflict when a looser call cannot sit in a tighter slot', () => {
    // `+` (level 6) folds "1 + 2" first; trying to extend with `*` (level 7)
    // fits the types but loses on precedence — named here, not just refused.
    const program = programFor('')
    const trace = traceStatement('1 + 2 * 3', program.store, program.scope)

    const second = trace.steps[1]!
    if (second.kind !== 'look') throw new Error('expected a look step')
    const group = second.groups[0]!
    expect(group.kept).toEqual([])
    expect(group.typed).toEqual(['(a: Scalar) * (b: Scalar)'])
    expect(group.conflicts).toEqual([
      { slot: 'a', edge: 'first', outer: 7, inner: { form: '(a: Scalar) + (b: Scalar)', level: 6 } },
    ])

    expect(trace.outcome.kind).toBe('read')
    if (trace.outcome.kind !== 'read') throw new Error('expected a reading')
    expect(trace.outcome.lines.at(-1)).toContain('(a: Scalar) + (b: Scalar)')
  })

  it('restarts from a later word when nothing from the first reads the whole line', () => {
    // "print 1" is complete on its own — print returns nothing a "+" could
    // continue — so nothing from the first word spans the line; the reader
    // restarts from "1", reads "1 + 2", and prints that instead.
    const program = programFor('')
    const trace = traceStatement('print 1 + 2', program.store, program.scope)

    expect(trace.outcome.kind).toBe('read')
    expect(trace.steps.some(s => s.kind === 'restart')).toBe(true)
  })
})

describe('tracing a statement that does not read', () => {
  it('reports no reading for a line nothing matches', () => {
    const program = programFor('')
    const trace = traceStatement('frobnicate p q', program.store, program.scope)
    expect(trace.outcome.kind).toBe('no-reading')
  })

  it('reports ambiguity when more than one candidate survives every gate', () => {
    const program = programFor(`define (a: Scalar) blend (b: Scalar) => Scalar:
    scalar n is a
    return n
define (a: Scalar) blend (b: Scalar) => Text:
    return "x"
`)
    const trace = traceStatement('print 1 blend 2', program.store, program.scope)
    expect(trace.outcome.kind).toBe('ambiguous')
  })

  it('refuses to trace through brackets rather than guess', () => {
    const program = programFor('')
    const trace = traceStatement('print (1, 2)', program.store, program.scope)
    expect(trace.outcome.kind).toBe('has-brackets')
  })
})
