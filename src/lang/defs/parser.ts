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
import type { Body, Definition, Field, Import, Pattern, PatternPart, Statement, TypeDecl, TypeRef } from './types.js'

export type ParsedFile = {
  /** `import x` / `export import x` lines, unresolved. */
  imports: Import[]
  definitions: Definition[]
  /** `define type` declarations. */
  types: TypeDecl[]
  /** Program lines. A column-0 line that is not `define` or an import is a
   *  statement — the layout rule already separates them, since bodies are
   *  indented and definitions are not. */
  statements: Statement[]
}

/** A trailing `;` is optional punctuation — allowed everywhere a line ends, and
 *  required nowhere. Not on a `define` header, which ends in `:` with its body
 *  still to come, so a terminator there would be claiming the line is finished
 *  when it is not. */
const dropTerminator = (s: string) => (s.endsWith(';') ? s.slice(0, -1).trimEnd() : s)

/** `return` as a whole word, not the start of a longer one. */
const isReturn = (s: string) => /^return\b/.test(s)

const isBlank = (s: string) => s.trim() === ''
const isComment = (s: string) => s.trimStart().startsWith('--')
const isIndented = (s: string) => /^[ \t]/.test(s)

// ─── Stage 1: framing ────────────────────────────────────────────────────────

export function parseFile(src: string): ParsedFile {
  const lines = src.split('\n')
  const imports: Import[] = []
  const definitions: Definition[] = []
  const types: TypeDecl[] = []
  const statements: Statement[] = []

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
      imports.push(parseImport(dropTerminator(raw.trim()), lineNo))
      i++
      continue
    }

    if (first !== 'define') {
      statements.push({ text: dropTerminator(raw.trim()), line: lineNo })
      i++
      continue
    }

    if (raw.trimEnd().endsWith(';')) {
      throw new DefinitionError(
        "a `define` line ends in ':' with its body still to come, so it takes no ';'",
        lineNo,
      )
    }

    // By token rather than by splitting on spaces: `define type:` has no space
    // before the colon, and would otherwise slip past as an ordinary definition
    // whose pattern is the word `type`.
    if (lexHeader(raw, lineNo)[1]?.value === 'type') {
      const { decl, next } = takeTypeDecl(lines, i, lineNo)
      types.push(decl)
      i = next
      continue
    }

    const { pattern, returns } = parseHeader(lexHeader(raw, lineNo), lineNo)
    const { body, next } = takeBody(lines, i + 1, lineNo)
    if (body.body === 'tilde') {
      if (returns !== null && body.result === null) {
        throw new DefinitionError(
          `this returns ${returns.name}, so its body needs a \`return\` line`,
          lineNo,
        )
      }
      if (returns === null && body.result !== null) {
        throw new DefinitionError(
          "this body returns a value, so the definition needs a `=> Type`",
          lineNo,
        )
      }
    }

    definitions.push({ pattern, returns, body, line: lineNo })
    i = next
  }

  return { imports, definitions, types, statements }
}

/** `define type Triangle =` followed by one field per line. A field is written
 *  type-then-name — `Point a` — the same order a statement declares an element
 *  in (`point a`), so the two read alike.
 *
 *  A field holds a reference to a *whole* element. There is deliberately no way
 *  to declare a field as part of one (`Scalar x` inside `Point`): correlated
 *  solutions live in whole elements, and splitting them would turn a line's two
 *  tangent solutions into eight candidates. */
function takeTypeDecl(lines: string[], at: number, lineNo: number): { decl: TypeDecl; next: number } {
  const header = lines[at]!.trim()
  const tokens = lexHeader(header, lineNo).filter(t => t.kind !== 'EOF')

  // define · type · Name · :
  if (tokens.length !== 4 || tokens[2]!.kind !== 'WORD' || tokens[3]!.kind !== 'COLON') {
    throw new DefinitionError("a type declaration reads `define type Name:`", lineNo)
  }
  const name = tokens[2]!.value

  const fields: Field[] = []
  const seen = new Set<string>()
  let i = at + 1

  while (i < lines.length) {
    const line = lines[i]!
    if (isBlank(line) || !isIndented(line)) break
    if (!isComment(line)) {
      const field = parseField(dropTerminator(line.trim()), i + 1)
      if (seen.has(field.name)) {
        throw new DefinitionError(`${name} declares field '${field.name}' twice`, i + 1)
      }
      seen.add(field.name)
      fields.push(field)
    }
    i++
  }

  if (fields.length === 0) throw new DefinitionError(`type ${name} declares no fields`, lineNo)
  return { decl: { name, fields, line: lineNo }, next: i }
}

/** One field line: `Point a`, or `[Point] ps` for a list. */
function parseField(line: string, lineNo: number): Field {
  const tokens = lexHeader(line, lineNo).filter(t => t.kind !== 'EOF')

  const list = tokens[0]?.kind === 'LBRACKET'
  const typeAt = list ? 1 : 0
  const nameAt = list ? 3 : 1
  const expected = list ? 4 : 2

  const bad = () =>
    new DefinitionError(`a field reads \`Type name\`, got '${line}'`, lineNo)

  if (tokens.length !== expected) throw bad()
  if (tokens[typeAt]?.kind !== 'WORD') throw bad()
  if (list && tokens[2]?.kind !== 'RBRACKET') throw bad()
  if (tokens[nameAt]?.kind !== 'WORD') throw bad()

  return { name: tokens[nameAt]!.value, type: { name: tokens[typeAt]!.value, list } }
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
    if (!isComment(line)) body.push(dropTerminator(line.trim()))
    i++
  }

  if (body.length === 0) throw new DefinitionError('definition has no body', defLine)

  // `return` designates which of the things built above comes back. It is not
  // control flow — nothing is skipped, and there is nothing to skip — so it may
  // only be the final line, where "what comes back" is the one thing left to say.
  const returnAt = body.findIndex(isReturn)
  if (returnAt !== -1 && returnAt !== body.length - 1) {
    throw new DefinitionError(
      "`return` says which value comes back, so it must be a body's last line",
      defLine + 1 + returnAt,
    )
  }

  if (returnAt === -1) return { body: { body: 'tilde', lines: body, result: null }, next: i }

  const result = body[returnAt]!.slice('return'.length).trim()
  if (result === '') throw new DefinitionError('`return` needs a value', defLine)
  return { body: { body: 'tilde', lines: body.slice(0, -1), result }, next: i }
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

  // A header ends with `:`, and nothing follows it — so the terminator is simply
  // the last token, with no scanning rule to remember. That leaves `=` free to
  // be an ordinary pattern word:
  //
  //     define point (n: Name) = (x: Scalar) (y: Scalar) => Point:
  //
  // The colons inside slots are never confused with it, since they sit before
  // the end of the line.
  const end = tokens.length - 2 // the token before EOF
  if (end < 0 || tokens[end]!.kind !== 'COLON') {
    throw new DefinitionError("a define line ends in ':'", line)
  }

  const arrow = lastIndexOf('ARROW', end)
  const patternEnd = arrow === -1 ? end : arrow

  const pattern: Pattern = []
  const slotNames = new Set<string>()

  while (i < patternEnd) pattern.push(parsePart())

  if (pattern.length === 0) throw new DefinitionError('definition has an empty pattern', line)

  let returns: TypeRef | null = null
  if (arrow !== -1) {
    i++ // past the arrow
    returns = parseType()
    if (i !== end) {
      throw new DefinitionError(`expected ':' after the return type, got '${peek().value}'`, line)
    }
  }

  return { pattern, returns }

  /** The last token of `kind` before `before`, or -1. */
  function lastIndexOf(kind: TokenKind, before = tokens.length): number {
    for (let j = before - 1; j >= 0; j--) if (tokens[j]!.kind === kind) return j
    return -1
  }

  function parsePart(): PatternPart {
    // A slot is `(name: Type)`. Any *other* bracket is an ordinary pattern word,
    // which is what lets a pattern contain literal brackets and commas:
    //     define point (n: Name) = ( (x: Scalar) , (y: Scalar) ):
    const isSlot = at('LPAREN')
      && tokens[i + 1]?.kind === 'WORD'
      && tokens[i + 2]?.kind === 'COLON'

    if (isSlot) {
      i++
      const name = take('WORD', 'a slot name').value
      take('COLON', "':'")
      const type = parseType()
      take('RPAREN', "')'")

      if (slotNames.has(name)) throw new DefinitionError(`duplicate slot name '${name}'`, line)
      slotNames.add(name)

      return { part: 'slot', name, type }
    }

    // A pattern word is usually a word, but punctuation counts too — that is
    // what lets `=` be an ordinary part of a pattern rather than a reserved
    // operator. Its meaning is whatever the definitions using it do.
    const word = tokens[i++]!
    if (word.kind === 'EOF') {
      throw new DefinitionError('expected a keyword or slot, got end of line', line)
    }
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
