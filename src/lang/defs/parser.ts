// ─── Definition parser ───────────────────────────────────────────────────────
// Reads a .til file into a list of Definitions. Two stages:
//
//   1. Framing — split the source into (header line, body lines) pairs using
//      the layout rules: a definition starts at column 0, and its body ends at
//      a blank line or the next column-0 line, whichever comes first. A tsx
//      block is exempt, since its backticks delimit it.
//   2. Header parsing — tokenise the one header line and read the pattern and
//      return type off it.
//
// Bodies stay raw. Parsing a composed body means matching statements against
// the definition table, which is what this pass produces — so it can't happen
// until every file has been read.

import { lexHeader, type Token, type TokenKind } from './lexer.js'
import { DefinitionError } from './types.js'
import type { Body, Definition, Import, Pattern, PatternPart, TypeRef } from './types.js'

export type ParsedFile = {
  /** `import x` / `export import x` lines, unresolved. */
  imports: Import[]
  definitions: Definition[]
}

const isBlank = (s: string) => s.trim() === ''
const isComment = (s: string) => s.trimStart().startsWith('--')
const isIndented = (s: string) => /^[ \t]/.test(s)

// ─── Stage 1: framing ────────────────────────────────────────────────────────

export function parseFile(src: string): ParsedFile {
  const lines = src.split('\n')
  const imports: Import[] = []
  const definitions: Definition[] = []

  let i = 0
  while (i < lines.length) {
    const raw = lines[i]!
    const lineNo = i + 1

    if (isBlank(raw) || isComment(raw)) { i++; continue }

    if (isIndented(raw)) {
      throw new DefinitionError('indented line outside a definition body', lineNo)
    }

    const first = raw.trim().split(/\s+/)[0]

    if (first === 'import' || first === 'export') {
      imports.push(parseImport(raw.trim(), lineNo))
      i++
      continue
    }

    if (first !== 'define') {
      throw new DefinitionError(`expected 'define', 'import' or 'export import', got '${first}'`, lineNo)
    }

    const { pattern, returns } = parseHeader(lexHeader(raw, lineNo), lineNo)
    const { body, next } = takeBody(lines, i + 1, lineNo)
    definitions.push({ pattern, returns, body, line: lineNo })
    i = next
  }

  return { imports, definitions }
}

/** `import x` makes x usable in this file only. `export import x` also passes it
 *  on, which is how a barrel module like `prelude` works — imports do not
 *  transit on their own. */
function parseImport(line: string, lineNo: number): Import {
  const words = line.split(/\s+/)

  if (words[0] === 'export') {
    if (words[1] !== 'import') {
      throw new DefinitionError(`'export' must be followed by 'import', got '${words[1] ?? 'end of line'}'`, lineNo)
    }
    return { name: moduleName(words.slice(2), lineNo), reexport: true, line: lineNo }
  }
  return { name: moduleName(words.slice(1), lineNo), reexport: false, line: lineNo }
}

function moduleName(rest: string[], lineNo: number): string {
  if (rest.length === 0) throw new DefinitionError('import needs a module name', lineNo)
  if (rest.length > 1) {
    throw new DefinitionError(`an import takes one module name, got '${rest.join(' ')}'`, lineNo)
  }
  return rest[0]!
}

/** Collect a definition's body, starting at `start`. Returns the body and the
 *  index of the first line after it. */
function takeBody(lines: string[], start: number, defLine: number): { body: Body; next: number } {
  const opener = lines[start]
  if (opener === undefined || isBlank(opener) || !isIndented(opener)) {
    throw new DefinitionError('definition has no body', defLine)
  }

  if (opener.trim() === 'tsx`') return takeTsxBody(lines, start, defLine)

  const body: string[] = []
  let i = start
  while (i < lines.length) {
    const line = lines[i]!
    if (isBlank(line) || !isIndented(line)) break
    if (!isComment(line)) body.push(line.trim())
    i++
  }

  if (body.length === 0) throw new DefinitionError('definition has no body', defLine)
  return { body: { body: 'tilde', lines: body }, next: i }
}

/** A tsx block runs from its opening `tsx\`` line to the line holding only a
 *  closing backtick. Blank lines inside it are content, not a terminator. */
function takeTsxBody(lines: string[], start: number, defLine: number): { body: Body; next: number } {
  const code: string[] = []
  let i = start + 1

  while (i < lines.length) {
    const line = lines[i]!
    if (line.trim() === '`') {
      return { body: { body: 'tsx', code: code.join('\n') }, next: i + 1 }
    }
    code.push(line)
    i++
  }

  throw new DefinitionError('unterminated tsx block', defLine)
}

// ─── Stage 2: header parsing ─────────────────────────────────────────────────

function parseHeader(tokens: Token[], line: number): { pattern: Pattern; returns: TypeRef | null } {
  let i = 0

  const peek = (): Token => tokens[i]!
  const at = (kind: TokenKind) => peek().kind === kind
  const take = (kind: TokenKind, what: string): Token => {
    if (!at(kind)) throw new DefinitionError(`expected ${what}, got '${peek().value || 'end of line'}'`, line)
    return tokens[i++]!
  }

  const keyword = take('WORD', "'define'")
  if (keyword.value !== 'define') {
    throw new DefinitionError(`expected 'define', got '${keyword.value}'`, line)
  }

  const pattern: Pattern = []
  const slotNames = new Set<string>()

  while (!at('ARROW') && !at('EQUALS') && !at('EOF')) {
    pattern.push(parsePart())
  }

  if (pattern.length === 0) throw new DefinitionError('definition has an empty pattern', line)

  const returns = at('ARROW') ? (i++, parseType()) : null

  take('EQUALS', "'='")
  if (!at('EOF')) {
    throw new DefinitionError(`nothing may follow '=' on a define line, found '${peek().value}'`, line)
  }

  return { pattern, returns }

  function parsePart(): PatternPart {
    if (at('LPAREN')) {
      i++
      const name = take('WORD', 'a slot name').value
      take('COLON', "':'")
      const type = parseType()
      take('RPAREN', "')'")

      if (slotNames.has(name)) throw new DefinitionError(`duplicate slot name '${name}'`, line)
      slotNames.add(name)

      return { part: 'slot', name, type }
    }

    const word = take('WORD', 'a keyword or slot')
    return { part: 'keyword', word: word.value }
  }

  function parseType(): TypeRef {
    if (at('LBRACKET')) {
      i++
      const name = take('WORD', 'a type name').value
      take('RBRACKET', "']'")
      return { name, list: true }
    }
    return { name: take('WORD', 'a type name').value, list: false }
  }
}
