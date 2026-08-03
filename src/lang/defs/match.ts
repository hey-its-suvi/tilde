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

/** One slot filled by matching: which slot, its declared type, and the token
 *  that filled it. Resolution reads the token back against the type. */
export type Binding = {
  slot: string
  type: TypeRef
  token: Token
}

export type Match = {
  def: Definition
  bindings: Binding[]
}

/** A token can fill a slot if it is a single atom — a name or a number. Parens,
 *  brackets, and operators are not atoms (yet — bracketed slot values come with
 *  expression support later). */
const isAtom = (t: Token) => t.kind === 'WORD' || t.kind === 'NUMBER'

/** Every definition whose pattern matches `statement` word-for-word, in table
 *  order. Empty when nothing fits. */
export function matchStatement(statement: string, defs: readonly Definition[]): Match[] {
  const tokens = lexHeader(statement, 0).filter(t => t.kind !== 'EOF')
  const matches: Match[] = []
  for (const def of defs) {
    const bindings = matchPattern(def, tokens)
    if (bindings) matches.push({ def, bindings })
  }
  return matches
}

/** Bindings if `def`'s pattern consumes exactly `tokens`, else null. */
function matchPattern(def: Definition, tokens: Token[]): Binding[] | null {
  const bindings: Binding[] = []
  let i = 0

  for (const part of def.pattern) {
    const token = tokens[i]
    if (token === undefined) return null // pattern longer than the statement

    if (part.part === 'keyword') {
      if (token.kind !== 'WORD' || token.value !== part.word) return null
    } else {
      if (!isAtom(token)) return null
      bindings.push({ slot: part.name, type: part.type, token })
    }
    i++
  }

  if (i !== tokens.length) return null // statement had leftover tokens
  return bindings
}
