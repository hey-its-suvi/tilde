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
  const cols = new Set<number>()
  markLine(tokens, defs, cols)
  return cols
}

/** Mark a line the way it is read (decision 19): the longest pattern from the
 *  start, then the next pattern with that one's result in its first slot, and
 *  so on. Only words are looked at, never types, so `p on l` marks the same
 *  whichever `on` it turns out to be. Stops at the first piece that aligns with
 *  nothing, keeping whatever it marked so far. */
function markLine(tokens: readonly Token[], defs: readonly Definition[], cols: Set<number>): void {
  let pos = 0
  let carried = false // the previous pattern's result fills the next one's first slot

  while (pos < tokens.length) {
    let best: Alignment | null = null
    for (const def of defs) {
      const found = align(def, tokens, pos, carried)
      if (found !== null && better(found, best)) best = found
    }
    if (best === null || (best.consumed === 0 && !best.complete)) return

    for (const c of best.cols) cols.add(c)
    for (const inner of best.groups) markLine(inner, defs, cols)
    if (!best.complete) return // a half-typed tail: colour what aligned, then stop
    pos += best.consumed
    carried = true
  }
}

type Alignment = {
  cols: Set<number>
  /** The insides of bracketed groups that filled slots, marked the same way. */
  groups: Token[][]
  /** Tokens taken. */
  consumed: number
  /** Whether every part of the pattern was met. */
  complete: boolean
}

/** A pattern met in full beats one the line only got partway through; between
 *  two of the same kind, the one that took more of the line wins. */
const better = (a: Alignment, b: Alignment | null) =>
  b === null ||
  (a.complete && !b.complete) ||
  (a.complete === b.complete && a.consumed > b.consumed)

const isAtom = (t: Token) => t.kind === 'WORD' || t.kind === 'NUMBER'

/** Walk a pattern against the tokens from `start`, recording slot columns and
 *  how far it got. With `carried`, the pattern's first part must be a slot, and
 *  the result of what came before fills it without taking a token. */
function align(def: Definition, tokens: readonly Token[], start: number, carried: boolean): Alignment | null {
  const parts = def.pattern
  if (carried && parts[0]?.part !== 'slot') return null

  const cols = new Set<number>()
  const groups: Token[][] = []
  let i = start

  for (const part of carried ? parts.slice(1) : parts) {
    const token = tokens[i]
    const partial = { cols, groups, consumed: i - start, complete: false }
    if (token === undefined) return partial

    if (part.part === 'keyword') {
      // By what it reads as, so `=` and `+` are keywords like `on`.
      if (token.value !== part.word) return partial
      i++
      continue
    }

    if (token.kind === 'LPAREN') {
      // A bracketed group fills one slot; what is inside is a line of its own.
      const close = closing(tokens, i)
      if (close === null) return partial
      groups.push(tokens.slice(i + 1, close))
      i = close + 1
      continue
    }
    if (!isAtom(token)) return partial
    cols.add(token.col)
    i++
  }

  return { cols, groups, consumed: i - start, complete: true }
}

/** The index of the bracket closing the one at `open`, or null if none does. */
function closing(tokens: readonly Token[], open: number): number | null {
  let depth = 0
  for (let i = open; i < tokens.length; i++) {
    if (tokens[i]!.kind === 'LPAREN') depth++
    else if (tokens[i]!.kind === 'RPAREN' && --depth === 0) return i
  }
  return null
}
