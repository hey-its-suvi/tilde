// ─── Reading a line ──────────────────────────────────────────────────────────
// How a line becomes a tree of calls (decision 19). Nothing runs here: the line
// is read and type-checked using what each definition promises to return, and
// evaluation runs the tree afterwards.
//
// The fold. From the first word, take the longest pattern that matches. Its
// result becomes one piece — a call — in place of the words it took, and the
// line is matched again from the same place, so that call fills the first slot
// of whatever comes next:
//
//     line l parallel m through p   →   ((line l) parallel m) through p
//
// Backing off. The longest match fits the words; it may not fit the types, or
// what follows may not be able to continue from it. Then the next shorter match
// is tried.
//
// Restarting. If no fold from the first word uses up the line, start from the
// second word instead, then the third. Whatever folds into a value there stands
// in for those words, and the line is read again from the start:
//
//     line n = l rotated 60   →   (line n) = (l rotated 60)
//
// A line that reads left to right is never touched by a restart: restarts are
// tried only once every fold from the first word has failed.

import { matchAt, showPieces, callTypes, type Match, type Piece } from './match.js'
import { typesFit, compatible, ANY, type Store } from './resolve.js'
import type { Definition } from './types.js'

export type Call = Extract<Piece, { kind: 'call' }>

/** Names a call on this line will give, with the type it promises. */
type Given = ReadonlyMap<string, string>

/** A line half-read: its pieces so far, and the names given so far. */
type State = { pieces: readonly Piece[]; given: Given }

/** How many matching steps one line may take before giving up. Lines are short,
 *  so this is far beyond any real one; it only stops a pathological line (or a
 *  pathological table) from hanging the editor. */
const BUDGET = 20_000

export class ReadError extends Error {
  constructor(message: string) {
    super(`[Reading] ${message}`)
  }
}

/** The call a line reads as, or null if there is no reading. Throws only when
 *  the line has too many readings to try. */
export function readLine(pieces: readonly Piece[], store: Store, defs: readonly Definition[]): Call | null {
  const reader = new Reader(store, defs, showPieces(pieces))
  return reader.read({ pieces, given: new Map() })
}

/** How far a plain left-to-right reading gets before it is stuck: the line with
 *  its longest first fold done, or null if nothing matches at the start. Only
 *  for errors — when a line has no reading, what stopped this one is what its
 *  writer most likely needs to hear. */
export function foldFromStart(pieces: readonly Piece[], store: Store, defs: readonly Definition[]): Piece[] | null {
  const reader = new Reader(store, defs, showPieces(pieces))
  for (const state of reader.fold({ pieces, given: new Map() }, 0)) return [...state.pieces]
  return null
}

class Reader {
  private left = BUDGET
  /** Half-read lines already known to have no reading. Different routes reach
   *  the same state — `(1 + 2) + 3` and `1 + (2 + 3)` both leave one Scalar —
   *  and without this a line that fails is tried exponentially often. */
  private readonly failed = new Set<string>()

  constructor(
    private readonly store: Store,
    private readonly defs: readonly Definition[],
    private readonly shown: string,
  ) {}

  read(state: State): Call | null {
    const key = stateKey(state)
    if (this.failed.has(key)) return null
    const found = this.tryRead(state)
    if (found === null) this.failed.add(key)
    return found
  }

  private tryRead(state: State): Call | null {
    // From the first word: a fold that uses up the line.
    for (const next of this.fold(state, 0)) {
      const only = next.pieces[0]
      if (next.pieces.length === 1 && only?.kind === 'call') return only
    }

    // From a later word: whatever folds into a value there stands in for those
    // words, and the line is read again from the start.
    for (let k = 1; k < state.pieces.length; k++) {
      for (const next of this.fold(state, k)) {
        const made = next.pieces[k] as Call
        if (callTypes(made).length === 0) continue // nothing to stand in with
        const found = this.read(next)
        if (found !== null) return found
      }
    }
    return null
  }

  /** Every way to fold the pieces from `k` on, longest first. Each match at `k`
   *  becomes a call in place of what it took; the fold then carries on from the
   *  same place, so a longer chain comes before the shorter ones it grew from. */
  *fold(state: State, k: number): Generator<State> {
    for (const { matches, length } of this.matchesAt(state, k)) {
      const span = state.pieces.slice(k, k + length)
      const call: Call = { kind: 'call', matches, text: showPieces(span), col: colOf(span[0]!) }
      const next: State = {
        pieces: [...state.pieces.slice(0, k), call, ...state.pieces.slice(k + length)],
        given: give(state.given, matches),
      }
      yield* this.fold(next, k)
      yield next
    }
  }

  /** Definitions matching at `k` whose types fit, grouped by how many pieces
   *  they take, longest first. Several in one group are overloads that all fit
   *  — kept together, since only something outside them could tell them apart. */
  private matchesAt(state: State, k: number): { matches: Match[]; length: number }[] {
    if (--this.left < 0) {
      throw new ReadError(`"${this.shown}" has too many possible readings to try — add brackets`)
    }
    const byLength = new Map<number, Match[]>()
    for (const { match, length } of matchAt(state.pieces, k, this.defs)) {
      // A pattern of one slot taking a call already read would wrap it forever.
      if (length === 1 && state.pieces[k]!.kind === 'call') continue
      if (!typesFit(match, this.store, state.given)) continue
      byLength.set(length, [...(byLength.get(length) ?? []), narrowed(match)])
    }
    return [...byLength.entries()]
      .sort(([a], [b]) => b - a)
      .map(([length, matches]) => ({ matches, length }))
  }
}

/** The slot decides. A call that could be several overloads, differing in what
 *  they return, keeps only those whose return fits the slot it landed in — so
 *  `(2, 1)` in a Point slot is the Point one. An `Any` slot says nothing, so
 *  there the choice stays open, and is reported as ambiguous before anything
 *  runs. */
function narrowed(match: Match): Match {
  let changed = false
  const bindings = match.bindings.map(b => {
    if (b.piece.kind !== 'call' || b.piece.matches.length < 2 || b.type.name === ANY) return b
    const fitting = b.piece.matches.filter(m => m.def.returns !== null && compatible(m.def.returns.name, b.type.name))
    if (fitting.length === b.piece.matches.length) return b
    changed = true
    return { ...b, piece: { ...b.piece, matches: fitting } }
  })
  return changed ? { ...match, bindings } : match
}

/** The names a call will give, added to those given already. Only when the call
 *  is settled — one match — and its output promises a type that says something. */
function give(given: Given, matches: readonly Match[]): Given {
  if (matches.length !== 1) return given
  const outputs = matches[0]!.bindings.filter(
    b => b.type.output && b.type.name !== ANY && b.piece.kind === 'word',
  )
  if (outputs.length === 0) return given
  const next = new Map(given)
  for (const b of outputs) {
    if (b.piece.kind === 'word') next.set(b.piece.token.value, b.type.name)
  }
  return next
}

const colOf = (p: Piece): number => (p.kind === 'word' ? p.token.col : p.col)

/** What decides whether a half-read line can still be read: its words, its
 *  values, the types its calls could produce, and the names given so far. How a
 *  call came to be is irrelevant — only what it could stand for. */
function stateKey(state: State): string {
  const pieces = state.pieces.map(p =>
    p.kind === 'word' ? `w:${p.token.value}`
    : p.kind === 'value' ? `v:${p.text}`
    : `c:${callTypes(p).join('|')}:${p.matches.length}`,
  )
  const given = [...state.given].map(([n, t]) => `${n}:${t}`).sort()
  return `${pieces.join(' ')} / ${given.join(' ')}`
}
