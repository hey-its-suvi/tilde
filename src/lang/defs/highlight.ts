// ─── Highlighting support ────────────────────────────────────────────────────
// Which tokens of a statement land in slots.
//
// This cannot be answered lexically. In `circle c on l`, `circle` and `on` are
// pattern words while `c` and `l` are values, and nothing about the characters
// says which is which — only the definition they match does. So highlighting a
// statement means aligning it against the definition table, exactly as matching
// does, and reporting where the slots fell.
//
// Unlike `match.ts` this is deliberately forgiving. An editor sees half-typed
// lines constantly, so a line that matches nothing completely still reports the
// slots of whichever definition it got furthest through. Values keep their
// colour while the rest of the line is still being typed, rather than flickering.

import { lexHeader, type Token } from './lexer.js'
import type { Definition } from './types.js'

/** Column offsets of the tokens that filled a slot. Empty when nothing aligns. */
export function slotColumns(line: string, defs: readonly Definition[]): Set<number> {
  let tokens: Token[]
  try {
    tokens = lexHeader(line, 0).filter(t => t.kind !== 'EOF')
  } catch {
    return new Set() // mid-edit garbage; colour nothing rather than guessing
  }
  if (tokens.length === 0) return new Set()

  let best = new Set<number>()
  let bestConsumed = -1

  for (const def of defs) {
    const { cols, consumed, complete } = align(def, tokens)
    if (complete) return cols // an exact match beats every partial
    if (consumed > bestConsumed) {
      bestConsumed = consumed
      best = cols
    }
  }
  return best
}

const isAtom = (t: Token) => t.kind === 'WORD' || t.kind === 'NUMBER'

/** Walk a pattern against tokens, recording slot columns and how far it got. */
function align(def: Definition, tokens: Token[]) {
  const cols = new Set<number>()
  let i = 0

  for (const part of def.pattern) {
    const token = tokens[i]
    if (token === undefined) return { cols, consumed: i, complete: false }

    if (part.part === 'keyword') {
      if (token.kind !== 'WORD' || token.value !== part.word) {
        return { cols, consumed: i, complete: false }
      }
    } else {
      if (!isAtom(token)) return { cols, consumed: i, complete: false }
      cols.add(token.col)
    }
    i++
  }

  return { cols, consumed: i, complete: i === tokens.length }
}
