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
// second word instead, then the third. The longest match there that gives a
// value stands in for its words — one match, not a chain — and the line is read
// again from the start, so the rest of it still reads left to right:
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

    // From a later word: one match there that gives a value stands in for its
    // words, and the line is read again from the start. One match, not a fold:
    // a fold would carry on past it and take words that belong to the sentence
    // around it — in `1 - 2 * 3 - 4`, `(2 * 3) - 4` — grouping them the wrong
    // way round. Reading again from the start keeps the rest left to right.
    for (let k = 1; k < state.pieces.length; k++) {
      for (const next of this.once(state, k)) {
        const made = next.pieces[k] as Call
        if (callTypes(made).length === 0) continue // nothing to stand in with
        const found = this.read(next)
        if (found !== null) return found
      }
    }
    return null
  }

  /** Every single match at `k`, longest first, with nothing folded after it. */
  *once(state: State, k: number): Generator<State> {
    for (const { matches, length } of this.matchesAt(state, k)) {
      const span = state.pieces.slice(k, k + length)
      const call: Call = { kind: 'call', matches, text: showPieces(span), col: colOf(span[0]!) }
      yield {
        pieces: [...state.pieces.slice(0, k), call, ...state.pieces.slice(k + length)],
        given: give(state.given, matches),
      }
    }
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
      const fitted = levelsFit(narrowed(match))
      if (fitted === null) continue
      byLength.set(length, [...(byLength.get(length) ?? []), fitted])
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

/** How tightly things hold together (decision 20). A call sitting unbracketed
 *  at an edge of another — in its first or last slot — must bind at least as
 *  tightly as that call, if it is open on the side facing it: `1 + 2` in the
 *  first slot of `* 3` is open on its right, so `+` (6) inside `*` (7) is
 *  refused, and the reader tries another grouping. A slot fenced in by words on
 *  both sides is never fought over, and a bracket is never checked.
 *
 *  An inner call that could be several definitions keeps those that fit; if
 *  none do, the whole match is refused. */
function levelsFit(match: Match): Match | null {
  const parts = match.def.pattern
  const outer = match.def.level
  let changed = false
  const bindings = []
  for (const b of match.bindings) {
    const piece = b.piece
    if (piece.kind !== 'call' || piece.bracketed) { bindings.push(b); continue }
    const at = parts.findIndex(p => p.part === 'slot' && p.name === b.slot)
    const first = at === 0
    const last = at === parts.length - 1
    if (first === last) { bindings.push(b); continue } // fenced in, or the only part
    const facing = (m: Match) => {
      const inner = m.def.pattern
      return first ? inner.at(-1)?.part === 'slot' : inner[0]?.part === 'slot'
    }
    const fitting = piece.matches.filter(m => !facing(m) || fits(m.def.level, outer))
    if (fitting.length === 0) return null
    if (fitting.length !== piece.matches.length) changed = true
    bindings.push(fitting.length === piece.matches.length ? b : { ...b, piece: { ...piece, matches: fitting } })
  }
  return changed ? { ...match, bindings } : match
}

/** Whether a call at `inner` may sit unbracketed at an edge of one at `outer`:
 *  as tight or tighter. Equal ones need no rule of their own — the fold reads
 *  them left to right, and a restart takes one match and reads again from the
 *  start, so `1 - 2 * 3 - 4` is `(1 - (2 * 3)) - 4`. */
const fits = (inner: number, outer: number): boolean => inner >= outer

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
 *  values, the names given so far, and for each call what it could produce, how
 *  tightly it binds and which of its edges are open (decision 20). How a call
 *  came to be is irrelevant — only what it could stand for. */
/** A match's level and open edges, as far as levels can see them. */
const edges = (m: Match) =>
  `${m.def.level}${m.def.pattern[0]?.part === 'slot' ? '<' : ''}${m.def.pattern.at(-1)?.part === 'slot' ? '>' : ''}`

function stateKey(state: State): string {
  const pieces = state.pieces.map(p =>
    p.kind === 'word' ? `w:${p.token.value}`
    : p.kind === 'value' ? `v:${p.text}`
    : `c:${callTypes(p).join('|')}:${p.matches.map(edges).join('|')}${p.bracketed ? ':b' : ''}`,
  )
  const given = [...state.given].map(([n, t]) => `${n}:${t}`).sort()
  return `${pieces.join(' ')} / ${given.join(' ')}`
}
