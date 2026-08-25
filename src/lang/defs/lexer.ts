// ─── Definition-header lexer ─────────────────────────────────────────────────
// Tokenises the header of a definition — everything up to and including `=`.
// Bodies are handled as raw lines by the framer, so this never sees them.
//
// There is no keyword table. `define` is an ordinary word that the parser
// recognises by position; `point`, `parallel`, `with` and friends are just
// words too. That is what lets the prelude define them rather than the lexer.

import { DefinitionError } from './types.js'

export type TokenKind =
  | 'WORD'      // define, point, parallel, Line, a
  | 'NUMBER'
  | 'LPAREN' | 'RPAREN'
  | 'LBRACKET' | 'RBRACKET'
  | 'COLON'
  | 'ARROW'     // =>
  | 'EQUALS'
  | 'COMMA'
  | 'EOF'

export type Token = {
  kind: TokenKind
  value: string
  col: number
}

const PUNCT: Record<string, TokenKind> = {
  '(': 'LPAREN',
  ')': 'RPAREN',
  '[': 'LBRACKET',
  ']': 'RBRACKET',
  ':': 'COLON',
  '=': 'EQUALS',
  ',': 'COMMA',
}

/** `.` is a word character so `t.a` is a single atom and fits a slot the way
 *  any other name does. Numbers are lexed by an earlier branch, so `3.5` is
 *  still a number rather than a name. */
const isWordChar = (c: string) => /[A-Za-z0-9_.]/.test(c)

/** Tokenise one header line. `line` is only used for error messages. */
export function lexHeader(src: string, line: number): Token[] {
  const tokens: Token[] = []
  let i = 0

  while (i < src.length) {
    const c = src[i]!

    if (c === ' ' || c === '\t') { i++; continue }

    // `--` starts a comment, but only outside a word (so `a--b` is not one).
    if (c === '-' && src[i + 1] === '-') break

    // Must precede the `=` punctuation case below, or `=>` lexes as `=` `>`.
    if (c === '=' && src[i + 1] === '>') {
      tokens.push({ kind: 'ARROW', value: '=>', col: i })
      i += 2
      continue
    }

    const punct = PUNCT[c]
    if (punct) {
      tokens.push({ kind: punct, value: c, col: i })
      i++
      continue
    }

    if (/[0-9]/.test(c)) {
      const start = i
      while (i < src.length && /[0-9.]/.test(src[i]!)) i++
      tokens.push({ kind: 'NUMBER', value: src.slice(start, i), col: start })
      continue
    }

    if (isWordChar(c)) {
      const start = i
      while (i < src.length && isWordChar(src[i]!)) i++
      tokens.push({ kind: 'WORD', value: src.slice(start, i), col: start })
      continue
    }

    throw new DefinitionError(`unexpected character '${c}'`, line)
  }

  tokens.push({ kind: 'EOF', value: '', col: src.length })
  return tokens
}
