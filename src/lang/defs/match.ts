// ─── Statement matching ──────────────────────────────────────────────────────
// Given a statement and the definition table, find which definitions the
// statement could be. This is the "parse to a set of candidate matches" half of
// decision 9 — picking *one* candidate by type is resolution, a separate step.
//
// Why a set and not a single answer: two definitions can share a surface shape.
// `(p: Point) on (l: Line)` and `(p: Point) on (c: Circle)` both match `p on l`
// word-for-word; only the type of `l` tells them apart. So matching is purely
// syntactic and deliberately returns every shape-compatible definition.
//
// Matching one pattern is deterministic — no backtracking. A slot captures
// exactly one atom (decision 2: a name or a literal), so walking pattern parts
// against tokens left to right never has a choice to make: a keyword part must
// equal the next token, a slot part consumes it. That is why the old block
// machinery with its backtracking combinators is gone.

import { lexHeader, type Token } from './lexer.js'
import type { Definition, TypeRef } from './types.js'
import { isText, type Value } from './values.js'

/** A line being matched is a list of pieces. Most are words as written; some
 *  are values already worked out — what a bracket produced — standing in for
 *  the words they came from. A value is never turned back into text: it goes
 *  into a slot as it is, so there is nothing to re-read and nothing to look up. */
export type Piece =
  | { kind: 'word'; token: Token }
  /** `text` is what was written, for error messages: `(1 , 2)`. */
  | { kind: 'value'; value: Value; text: string; col: number }

/** A statement as written, one word piece per token. */
export const piecesOf = (statement: string): Piece[] =>
  lexHeader(statement, 0)
    .filter(t => t.kind !== 'EOF')
    .map(token => ({ kind: 'word', token }))

/** How a piece reads back, for error messages. */
export const pieceText = (p: Piece): string =>
  p.kind === 'word' ? p.token.value : p.text

export const showPieces = (pieces: readonly Piece[]): string =>
  pieces.map(pieceText).join(' ')

/** What kind of thing a value is, by its shape alone: a number is a Scalar and
 *  text is Text. An element's key needs the store to say, so it is undefined
 *  here. */
export const literalType = (v: Value): string | undefined =>
  typeof v === 'number' ? 'Scalar' : isText(v) ? 'Text' : undefined

/** One slot filled by matching: which slot, its declared type, and the piece
 *  that filled it. Resolution reads the piece back against the type. */
export type Binding = {
  slot: string
  type: TypeRef
  piece: Piece
}

export type Match = {
  def: Definition
  bindings: Binding[]
}

/** A piece can fill a slot if it is a single atom — a name, a number, text, or
 *  a value a bracket produced. Operators and punctuation are not atoms. */
const isAtom = (p: Piece) =>
  p.kind === 'value' ||
  p.token.kind === 'WORD' || p.token.kind === 'NUMBER' || p.token.kind === 'STRING'

/** Every definition whose pattern matches `statement` word-for-word, in table
 *  order. Empty when nothing fits. */
export function matchStatement(statement: string | readonly Piece[], defs: readonly Definition[]): Match[] {
  const pieces = typeof statement === 'string' ? piecesOf(statement) : statement
  const matches: Match[] = []
  for (const def of defs) {
    const bindings = matchPattern(def, pieces)
    if (bindings) matches.push({ def, bindings })
  }
  return matches
}

/** Bindings if `def`'s pattern consumes exactly `pieces`, else null. */
function matchPattern(def: Definition, pieces: readonly Piece[]): Binding[] | null {
  const bindings: Binding[] = []
  let i = 0

  for (const part of def.pattern) {
    const piece = pieces[i]
    if (piece === undefined) return null // pattern longer than the statement

    if (part.part === 'keyword') {
      // Matched by what it reads as, not by token kind — a pattern word may be
      // punctuation, so `=` matches an EQUALS the way `on` matches a WORD. A
      // value is never a keyword, whatever it would print as.
      if (piece.kind !== 'word' || piece.token.value !== part.word) return null
    } else {
      if (!isAtom(piece)) return null
      bindings.push({ slot: part.name, type: part.type, piece })
    }
    i++
  }

  if (i !== pieces.length) return null // statement had leftover pieces
  return bindings
}
