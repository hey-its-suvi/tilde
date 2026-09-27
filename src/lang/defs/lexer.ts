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
  | 'OPERATOR'  // + - * /
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
  // Operators are ordinary pattern words once lexed: `(a: Scalar) + (b: Scalar)`
  // is a definition like any other, and gives `+` its meaning.
  '+': 'OPERATOR',
  '-': 'OPERATOR',
  '*': 'OPERATOR',
  '/': 'OPERATOR',
}

/** `.` is a word character so `t.a` is a single atom and fits a slot the way
 *  any other name does. Numbers are lexed by an earlier branch, so `3.5` is
 *  still a number rather than a name. */
const isWordChar = (c: string) => /[A-Za-z0-9_.]/.test(c)

/** A prime may follow the start of a name — `l'`, `A''` — the way geometry names
 *  a new object made from an old one. Tilde has no reassignment, so a rotated
 *  line is a *new* line, and priming is how it gets a name. Never first: a name
 *  cannot be only primes. */
const continuesWord = (c: string) => c === "'" || isWordChar(c)

/** Whether a `-` at `i` begins a negative number rather than subtracting: it
 *  must not be glued to a value on its left. Whitespace, the start of the line,
 *  an opening bracket, a comma or another operator all leave it free to be a
 *  sign. */
const startsValue = (src: string, i: number): boolean => {
  const prev = src[i - 1]
  return prev === undefined || /[\s(,=+\-*/]/.test(prev)
}

/** Tokenise one header line. `line` is only used for error messages. */
export function lexHeader(src: string, line: number): Token[] {
  const tokens: Token[] = []
  let i = 0

  while (i < src.length) {
    const c = src[i]!

    if (c === ' ' || c === '\t') { i++; continue }

    // `--` starts a comment, but only outside a word (so `a--b` is not one).
    if (c === '-' && src[i + 1] === '-') break

    // A negative number: `-` touching a digit, with nothing value-like touching
    // it on the left — `at -3`, `(1, -2)`, `-3` at the start. `a - 3` and `a-3`
    // are subtraction. `a -3` is two separate values.
    if (c === '-' && /[0-9]/.test(src[i + 1] ?? '') && startsValue(src, i)) {
      const start = i
      i++
      while (i < src.length && /[0-9.]/.test(src[i]!)) i++
      tokens.push({ kind: 'NUMBER', value: src.slice(start, i), col: start })
      continue
    }

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
      while (i < src.length && continuesWord(src[i]!)) i++
      tokens.push({ kind: 'WORD', value: src.slice(start, i), col: start })
      continue
    }

    throw new DefinitionError(`unexpected character '${c}'`, line)
  }

  tokens.push({ kind: 'EOF', value: '', col: src.length })
  return tokens
}
