// ─── Tracing how a statement reads ───────────────────────────────────────────
// A step-by-step account of what `readLine` does with one statement, for a
// person rather than for evaluation: at each spot, what matched by shape, what
// survived typing, what survived precedence, and — when the first word's fold
// never panned out — that the reader restarted from a later word instead.
//
// This never reimplements the reader. It listens to the real one (read.ts's
// `sink`) and renders what it hears, so the trace can never say something the
// reader itself would not do.

import { lexHeader } from './lexer.js'
import { piecesOf, pieceText, showPieces } from './match.js'
import { readLine, type Breakdown, type Call, type TraceEvent } from './read.js'
import { form, type Store } from './resolve.js'
import { noReading, settled } from './eval.js'
import type { Definition } from './types.js'

/** One group of candidates at one spot, by how many pieces they take. */
export type TraceGroup = {
  length: number
  /** Every definition matching here by shape alone, longest first within a
   *  spot's groups (groups themselves are already sorted by length). */
  shape: string[]
  /** Of those, the ones whose types fit what's actually here. */
  typed: string[]
  /** Of those, the ones precedence still allows unbracketed here — what the
   *  reader actually had left to choose from. */
  kept: string[]
}

/** One step of the trace: either the reader looking at a spot, or it giving
 *  up on the first word and restarting from a later one. */
export type TraceStep =
  | { kind: 'look'; at: string; groups: TraceGroup[] }
  | { kind: 'restart'; at: string }

export type TraceOutcome =
  | { kind: 'read'; lines: string[] }
  | { kind: 'no-reading' | 'ambiguous' | 'has-brackets'; message: string }

export type Trace = {
  statement: string
  steps: TraceStep[]
  outcome: TraceOutcome
}

const group = (g: Breakdown): TraceGroup => ({
  length: g.length,
  shape: g.shape.map(form),
  typed: g.typed.map(form),
  kept: g.kept.map(form),
})

const step = (e: TraceEvent): TraceStep =>
  e.kind === 'restart'
    ? { kind: 'restart', at: pieceText(e.piece) }
    : { kind: 'look', at: pieceText(e.piece), groups: e.groups.map(group) }

/** Trace one statement against `store`/`defs` — the same two things
 *  `readLine` itself takes, so this is exactly what the statement would mean
 *  if it ran now. Never throws: a statement with no reading, or an ambiguous
 *  one, is a normal outcome to show, not a failure of the tracer.
 *
 *  A statement with brackets is refused rather than guessed at: what is
 *  inside a bracket is *run*, not just matched (decision 19) — tracing it
 *  honestly would mean actually evaluating part of the program, which this
 *  does not do. Name the bracketed part first and trace the rest. */
export function traceStatement(statement: string, store: Store, defs: readonly Definition[]): Trace {
  if (lexHeader(statement, 0).some(t => t.kind === 'LPAREN' || t.kind === 'RPAREN')) {
    return {
      statement,
      steps: [],
      outcome: {
        kind: 'has-brackets',
        message: 'brackets are worked out by running what is inside them, not by matching — ' +
          'give the bracketed part a name first (e.g. `point p = (1, 2)`), then trace the rest',
      },
    }
  }

  const pieces = piecesOf(statement)
  const steps: TraceStep[] = []
  const call = readLine(pieces, store, defs, e => steps.push(step(e)))

  if (call === null) {
    const message = messageOf(noReading(pieces, store, defs))
    return { statement: showPieces(pieces), steps, outcome: { kind: 'no-reading', message } }
  }
  try {
    settled(call)
  } catch (e) {
    return { statement: showPieces(pieces), steps, outcome: { kind: 'ambiguous', message: messageOf(e) } }
  }
  return { statement: showPieces(pieces), steps, outcome: { kind: 'read', lines: renderTree(call) } }
}

const messageOf = (e: unknown): string => (e instanceof Error ? e.message : String(e))

/** The settled call tree, as a list of "this span meant this definition"
 *  lines, inner calls before the calls that hold them — the order the reader
 *  built them in. */
function renderTree(call: Call, lines: string[] = [], seen = new Set<Call>()): string[] {
  if (seen.has(call)) return lines
  seen.add(call)
  const match = call.matches[0]!
  for (const binding of match.bindings) {
    if (binding.piece.kind === 'call') renderTree(binding.piece, lines, seen)
  }
  lines.push(`${call.text}  →  ${form(match)}`)
  return lines
}
