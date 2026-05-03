// ─── Tilde Lexer ─────────────────────────────────────────────────────────────

export type TokenKind =
  // Declaration
  | 'LET'
  // Shape keywords
  | 'TRIANGLE' | 'SQUARE' | 'RECTANGLE' | 'SEGMENT' | 'POLYGON' | 'LINE'
  // Constraint keywords
  | 'PARALLEL' | 'PERPENDICULAR' | 'ANGLE' | 'POINT'
  // Output
  | 'PRINT'
  // Settings
  | 'SET' | 'UNIT' | 'WINDING'
  | 'CLOCKWISE' | 'COUNTERCLOCKWISE'
  | 'DEGREES' | 'RADIANS'
  | 'GRID' | 'ON' | 'OFF'
  // Pick (solution selection)
  | 'PICK'
  // Connectors
  | 'WITH' | 'AND' | 'THROUGH'
  // Line property keywords
  | 'SLOPE' | 'INTERCEPT'
  // Names
  | 'NAME'         // any alphanumeric identifier: abc, ABC, MyShape, t1
  // Literals
  | 'NUMBER'
  // Unit suffixes (only appear attached to NUMBER, e.g. 5cm)
  | 'UNIT_CM' | 'UNIT_MM' | 'UNIT_M' | 'UNIT_IN' | 'UNIT_INCHES'
  | 'UNIT_DEG' | 'UNIT_RAD'
  // Punctuation
  | 'EQUALS'       // =
  | 'MINUS'        // -
  | 'UNDERSCORE'   // _
  | 'LPAREN'       // (
  | 'RPAREN'       // )
  | 'COMMA'        // ,
  | 'NEWLINE'
  | 'EOF'

export type Token = {
  kind: TokenKind
  value: string      // raw text of the token
  line: number
  col: number
}

// Keywords map: lowercase source text → token kind
const KEYWORDS: Record<string, TokenKind> = {
  let:              'LET',
  triangle:         'TRIANGLE',
  square:           'SQUARE',
  rectangle:        'RECTANGLE',
  segment:          'SEGMENT',
  polygon:          'POLYGON',
  point:            'POINT',
  parallel:         'PARALLEL',
  perpendicular:    'PERPENDICULAR',
  angle:            'ANGLE',
  print:            'PRINT',
  set:              'SET',
  unit:             'UNIT',
  winding:          'WINDING',
  clockwise:        'CLOCKWISE',
  counterclockwise: 'COUNTERCLOCKWISE',
  degrees:          'DEGREES',
  radians:          'RADIANS',
  grid:             'GRID',
  on:               'ON',
  off:              'OFF',
  with:             'WITH',
  and:              'AND',
  through:          'THROUGH',
  slope:            'SLOPE',
  intercept:        'INTERCEPT',
  line:             'LINE',
  pick:             'PICK',
}

// Unit suffixes that can follow a number with no space
const UNIT_SUFFIXES: Record<string, TokenKind> = {
  cm:     'UNIT_CM',
  mm:     'UNIT_MM',
  m:      'UNIT_M',
  in:     'UNIT_IN',
  inches: 'UNIT_INCHES',
  deg:    'UNIT_DEG',
  rad:    'UNIT_RAD',
}

export class LexError extends Error {
  constructor(message: string, public line: number, public col: number) {
    super(`[Lex] Line ${line}:${col} — ${message}`)
  }
}

export function lex(source: string): Token[] {
  const tokens: Token[] = []
  let pos = 0
  let line = 1
  let col = 1

  function peek(offset = 0): string {
    return source[pos + offset] ?? ''
  }

  function advance(): string {
    const ch = source[pos++] ?? ''
    if (ch === '\n') { line++; col = 1 } else { col++ }
    return ch
  }

  function makeToken(kind: TokenKind, value: string, tokenLine: number, tokenCol: number): Token {
    return { kind, value, line: tokenLine, col: tokenCol }
  }

  function skipLineComment() {
    while (pos < source.length && peek() !== '\n') advance()
  }

  function readNumber(startLine: number, startCol: number): Token[] {
    let num = ''
    while (pos < source.length && /[0-9]/.test(peek())) num += advance()
    if (peek() === '.' && /[0-9]/.test(peek(1))) {
      num += advance() // consume '.'
      while (pos < source.length && /[0-9]/.test(peek())) num += advance()
    }

    const result: Token[] = [makeToken('NUMBER', num, startLine, startCol)]

    // Check for attached unit suffix (no space)
    if (/[a-z]/.test(peek())) {
      const unitColStart = col
      let suffix = ''
      while (pos < source.length && /[a-z]/.test(peek())) suffix += advance()
      const unitKind = UNIT_SUFFIXES[suffix]
      if (unitKind) {
        result.push(makeToken(unitKind, suffix, startLine, unitColStart))
      } else {
        // Not a unit suffix — put the chars back by rewinding
        // (simple approach: just throw since this is likely a parse error anyway)
        throw new LexError(`Unknown unit suffix "${suffix}"`, startLine, unitColStart)
      }
    }

    return result
  }

  function readName(startLine: number, startCol: number): Token {
    let name = ''
    while (pos < source.length && /[a-zA-Z0-9]/.test(peek())) name += advance()

    // Check if it's a keyword (always lowercase)
    const kwKind = KEYWORDS[name.toLowerCase()]
    if (kwKind && name === name.toLowerCase()) {
      return makeToken(kwKind, name, startLine, startCol)
    }

    return makeToken('NAME', name, startLine, startCol)
  }

  while (pos < source.length) {
    const startLine = line
    const startCol = col
    const ch = peek()

    // Skip spaces and tabs
    if (ch === ' ' || ch === '\t') { advance(); continue }

    // Newline
    if (ch === '\n') {
      // Only emit NEWLINE if the last meaningful token wasn't already a NEWLINE
      const last = tokens[tokens.length - 1]
      if (last && last.kind !== 'NEWLINE') {
        tokens.push(makeToken('NEWLINE', '\n', startLine, startCol))
      }
      advance()
      continue
    }

    // Comment
    if (ch === '#') { advance(); skipLineComment(); continue }

    // Semicolon: acts as a statement terminator (same as newline)
    if (ch === ';') {
      advance()
      const last = tokens[tokens.length - 1]
      if (last && last.kind !== 'NEWLINE') {
        tokens.push(makeToken('NEWLINE', ';', startLine, startCol))
      }
      continue
    }

    // Equals
    if (ch === '=') { advance(); tokens.push(makeToken('EQUALS', '=', startLine, startCol)); continue }

    // Minus
    if (ch === '-') { advance(); tokens.push(makeToken('MINUS', '-', startLine, startCol)); continue }

    // Underscore (for subscripts)
    if (ch === '_') { advance(); tokens.push(makeToken('UNDERSCORE', '_', startLine, startCol)); continue }

    // Grouping / coordinates
    if (ch === '(') { advance(); tokens.push(makeToken('LPAREN', '(', startLine, startCol)); continue }
    if (ch === ')') { advance(); tokens.push(makeToken('RPAREN', ')', startLine, startCol)); continue }
    if (ch === ',') { advance(); tokens.push(makeToken('COMMA', ',', startLine, startCol)); continue }

    // Number
    if (/[0-9]/.test(ch)) {
      tokens.push(...readNumber(startLine, startCol))
      continue
    }

    // Name or keyword
    if (/[a-zA-Z]/.test(ch)) {
      tokens.push(readName(startLine, startCol))
      continue
    }

    throw new LexError(`Unexpected character "${ch}"`, startLine, startCol)
  }

  // Ensure file ends with NEWLINE then EOF
  const last = tokens[tokens.length - 1]
  if (last && last.kind !== 'NEWLINE') {
    tokens.push(makeToken('NEWLINE', '', line, col))
  }
  tokens.push(makeToken('EOF', '', line, col))

  return tokens
}
