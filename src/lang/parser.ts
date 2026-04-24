// ─── Tilde Parser ────────────────────────────────────────────────────────────
// Recursive descent parser. Consumes a token stream from the lexer
// and produces a Program AST node.

import { Token, TokenKind } from './lexer.js'
import {
  Program, Statement, ShapeDecl, ShapeKind, LineDecl, PointDecl,
  ConstraintStmt, PrintStmt, SettingStmt, PickStmt,
  Constraint, MeasureConstraint, RelationConstraint, EqualityConstraint, PointCoincidence, OnConstraint,
  SegmentRef, AngleRef, VertexRef, Printable,
  MeasureValue, LengthUnit, AngleUnit,
} from './ast.js'

export class ParseError extends Error {
  constructor(message: string, public line: number, public col: number) {
    super(`[Parse] Line ${line}:${col} — ${message}`)
  }
}

export function parse(tokens: Token[]): Program {
  let pos = 0

  function peek(): Token {
    return tokens[pos] ?? { kind: 'EOF', value: '', line: 0, col: 0 }
  }

  function advance(): Token {
    return tokens[pos++] ?? { kind: 'EOF', value: '', line: 0, col: 0 }
  }

  function check(...kinds: TokenKind[]): boolean {
    return kinds.includes(peek().kind)
  }

  function eat(...kinds: TokenKind[]): Token {
    const tok = peek()
    if (!kinds.includes(tok.kind)) {
      throw new ParseError(
        `Expected ${kinds.join(' or ')} but got ${tok.kind} ("${tok.value}")`,
        tok.line, tok.col
      )
    }
    return advance()
  }

  function eatNewlines() {
    while (check('NEWLINE')) advance()
  }

  // ── Program ────────────────────────────────────────────────────────────────

  function parseProgram(): Program {
    const statements: Statement[] = []
    eatNewlines()
    while (!check('EOF')) {
      statements.push(parseStatement())
      eatNewlines()
    }
    return { kind: 'Program', statements }
  }

  // ── Statement ──────────────────────────────────────────────────────────────

  function parseStatement(): Statement {
    const tok = peek()

    // 'let' is optional sugar — consume it and continue
    if (check('LET')) advance()

    if (check('TRIANGLE', 'SQUARE', 'RECTANGLE', 'SEGMENT', 'POLYGON')) return parseShapeDecl()
    if (check('LINE')) return parseLineDecl()
    if (check('POINT')) {
      // POINT is at pos, name at pos+1, operator at pos+2
      // point x = (3,5)  →  PointDecl
      // point x on ...   →  ConstraintStmt
      return tokens[pos + 2]?.kind === 'EQUALS' ? parsePointDecl() : parseConstraintStmt()
    }
    if (check('PRINT')) return parsePrintStmt()
    if (check('SET')) return parseSettingStmt()
    if (check('PICK')) return parsePickStmt()
    if (check('ANGLE')) return parseConstraintStmt()

    // Ambiguous: LOWER_NAME could start a constraint (ab = 5, abc = ..., a = b)
    // UPPER_NAME followed by UNDERSCORE is a subscript reference
    if (check('LOWER_NAME', 'UPPER_NAME')) return parseConstraintStmt()

    throw new ParseError(`Unexpected token ${tok.kind} ("${tok.value}")`, tok.line, tok.col)
  }

  // ── Shape declaration ──────────────────────────────────────────────────────

  function parseShapeDecl(): ShapeDecl {
    const kw = advance()
    const shapeKind = kw.value as ShapeKind

    let polygonSides: number | undefined
    if (shapeKind === 'polygon') {
      const n = eat('NUMBER')
      polygonSides = parseFloat(n.value)
    }

    const nameTok = eat('UPPER_NAME', 'LOWER_NAME')
    const name = nameTok.value
    const named = /^[A-Z]/.test(name)

    // Validate name length vs shape (only for lowercase explicit mode)
    if (!named) {
      const expectedLengths: Partial<Record<ShapeKind, number>> = {
        triangle: 3, square: 4, rectangle: 4, segment: 2,
      }
      const expected = expectedLengths[shapeKind]
      if (expected !== undefined && name.length !== expected) {
        throw new ParseError(
          `A ${shapeKind} needs exactly ${expected} vertex characters, got "${name}" (${name.length})`,
          nameTok.line, nameTok.col
        )
      }
    }

    const constraints: Constraint[] = []

    // Inline value: `let segment ab = 5` — sugar for `with ab = 5`
    if (check('EQUALS') && !named) {
      advance()
      const value = parseMeasureValue()
      // build a segment or angle measure constraint from the name itself
      if (name.length === 2) {
        const seg: SegmentRef = { kind: 'ExplicitSegment', v1: name[0]!, v2: name[1]! }
        constraints.push({ kind: 'MeasureConstraint', target: seg, value })
      }
    } else if (check('WITH')) {
      advance()
      constraints.push(...parseConstraintList())
    }

    eat('NEWLINE', 'EOF')
    return { kind: 'ShapeDecl', shapeKind, name, named, polygonSides, constraints }
  }

  // ── Constraint list (after 'with') ─────────────────────────────────────────

  function parseConstraintList(): Constraint[] {
    const constraints = [parseConstraint()]
    while (check('AND')) {
      advance() // consume 'and'
      constraints.push(parseConstraint())
    }
    return constraints
  }

  // ── Constraint statement (standalone) ─────────────────────────────────────

  function parseConstraintStmt(): ConstraintStmt {
    const constraint = parseConstraint()
    eat('NEWLINE', 'EOF')
    return { kind: 'ConstraintStmt', constraint }
  }

  // ── Constraint ─────────────────────────────────────────────────────────────

  function parseConstraint(): Constraint {
    // point p on line l  |  point p on segment ab  |  point p on l  |  point p on ab
    if (check('POINT')) {
      advance()
      const pointTok = eat('LOWER_NAME')
      eat('ON')
      if (check('LINE', 'SEGMENT')) advance()  // optional keyword
      const targetTok = eat('LOWER_NAME', 'UPPER_NAME')
      return { kind: 'OnConstraint', point: pointTok.value, target: targetTok.value } satisfies OnConstraint
    }

    // angle abc = 60  |  angle ABC_2 = 60
    if (check('ANGLE')) {
      advance()
      const ref = parseAngleRef()
      eat('EQUALS')
      const value = parseMeasureValue()
      return { kind: 'MeasureConstraint', target: ref, value } satisfies MeasureConstraint
    }

    // ab = ...  |  ABC_12 = ...  |  a = b  |  ab parallel cd  |  a on line l
    const left = parseSegmentOrVertex()

    // a on line l  |  a on segment ab  |  a on l  |  a on ab
    if (check('ON') && left.kind === 'ExplicitVertex') {
      advance()
      if (check('LINE', 'SEGMENT')) advance()  // optional keyword
      const targetTok = eat('LOWER_NAME', 'UPPER_NAME')
      return { kind: 'OnConstraint', point: left.name, target: targetTok.value } satisfies OnConstraint
    }

    if (check('PARALLEL', 'PERPENDICULAR')) {
      const rel = advance().kind === 'PARALLEL' ? 'parallel' : 'perpendicular'
      const right = parseSegmentRef()
      return { kind: 'RelationConstraint', relation: rel, left: left as SegmentRef, right } satisfies RelationConstraint
    }

    if (check('EQUALS')) {
      advance()
      // Right side: number → measure constraint; name → equality or point coincidence
      if (check('NUMBER')) {
        const value = parseMeasureValue()
        return { kind: 'MeasureConstraint', target: left as SegmentRef, value } satisfies MeasureConstraint
      }

      const right = parseSegmentOrVertex()

      // Both single vertices → point coincidence
      if (left.kind === 'ExplicitVertex' && right.kind === 'ExplicitVertex') {
        return { kind: 'PointCoincidence', left, right } satisfies PointCoincidence
      }
      if (left.kind === 'SubscriptVertex' && right.kind === 'SubscriptVertex') {
        return { kind: 'PointCoincidence', left, right } satisfies PointCoincidence
      }

      // Otherwise → equality constraint (same length)
      return { kind: 'EqualityConstraint', left: left as SegmentRef, right: right as SegmentRef } satisfies EqualityConstraint
    }

    throw new ParseError(`Expected =, parallel, or perpendicular after reference`, peek().line, peek().col)
  }

  // ── References ─────────────────────────────────────────────────────────────

  /** Parse a segment or vertex ref — determined by what follows */
  function parseSegmentOrVertex(): SegmentRef | VertexRef {
    if (check('UPPER_NAME')) {
      const name = advance().value
      eat('UNDERSCORE')
      const i = parseInt(eat('NUMBER').value)
      // ABC_12 (two digits) vs ABC_1 (one digit) — check if another number follows immediately
      if (check('NUMBER')) {
        const j = parseInt(eat('NUMBER').value)
        return { kind: 'SubscriptSegment', shape: name, i, j }
      }
      return { kind: 'SubscriptVertex', shape: name, i }
    }

    // lowercase: single char = vertex, two chars = segment, three chars = angle (handled elsewhere)
    const name = eat('LOWER_NAME').value
    if (name.length === 1) return { kind: 'ExplicitVertex', name }
    if (name.length === 2) return { kind: 'ExplicitSegment', v1: name[0]!, v2: name[1]! }

    throw new ParseError(`Unexpected name "${name}" — expected a vertex (1 char) or segment (2 chars)`, peek().line, peek().col)
  }

  function parseSegmentRef(): SegmentRef {
    const ref = parseSegmentOrVertex()
    if (ref.kind === 'ExplicitVertex' || ref.kind === 'SubscriptVertex') {
      throw new ParseError('Expected a segment reference, got a vertex', peek().line, peek().col)
    }
    return ref
  }

  function parseAngleRef(): AngleRef {
    if (check('UPPER_NAME')) {
      const name = advance().value
      eat('UNDERSCORE')
      const i = parseInt(eat('NUMBER').value)
      return { kind: 'SubscriptAngle', shape: name, i }
    }

    const name = eat('LOWER_NAME').value
    if (name.length !== 3) {
      throw new ParseError(`Angle reference must be exactly 3 lowercase chars, got "${name}"`, peek().line, peek().col)
    }
    return { kind: 'ExplicitAngle', v1: name[0]!, v2: name[1]!, v3: name[2]! }
  }

  function parseVertexRef(): VertexRef {
    if (check('UPPER_NAME')) {
      const name = advance().value
      eat('UNDERSCORE')
      const i = parseInt(eat('NUMBER').value)
      return { kind: 'SubscriptVertex', shape: name, i }
    }
    const name = eat('LOWER_NAME').value
    if (name.length !== 1) {
      throw new ParseError(`Vertex reference must be a single char, got "${name}"`, peek().line, peek().col)
    }
    return { kind: 'ExplicitVertex', name }
  }

  // ── Values ─────────────────────────────────────────────────────────────────

  function parseMeasureValue(): MeasureValue {
    const num = eat('NUMBER')
    const value = parseFloat(num.value)

    const unitMap: Partial<Record<TokenKind, LengthUnit | AngleUnit>> = {
      UNIT_CM: 'cm', UNIT_MM: 'mm', UNIT_M: 'm',
      UNIT_IN: 'in', UNIT_INCHES: 'inches',
      UNIT_DEG: 'deg', UNIT_RAD: 'rad',
    }

    const unitKind = peek().kind
    if (unitKind in unitMap) {
      advance()
      return { value, unit: unitMap[unitKind]! }
    }

    return { value, unit: null }
  }

  // ── Line declaration ───────────────────────────────────────────────────────

  function parseLineDecl(): LineDecl {
    eat('LINE')
    const nameTok = eat('LOWER_NAME', 'UPPER_NAME')
    eat('EQUALS')
    eat('LPAREN')
    const first  = parseSignedNumber()
    eat('COMMA')
    const second = parseSignedNumber()

    if (check('COMMA')) {
      // 3-tuple: (a, b, c) → ax + by + c = 0
      advance()
      const third = parseSignedNumber()
      eat('RPAREN')
      eat('NEWLINE', 'EOF')
      return { kind: 'LineDecl', name: nameTok.value, a: first, b: second, c: third }
    }

    // 2-tuple: (m, k) → y = mx + k → mx - y + k = 0
    eat('RPAREN')
    eat('NEWLINE', 'EOF')
    return { kind: 'LineDecl', name: nameTok.value, a: first, b: -1, c: second }
  }

  function parsePointDecl(): PointDecl {
    eat('POINT')
    const nameTok = eat('LOWER_NAME', 'UPPER_NAME')
    eat('EQUALS')
    eat('LPAREN')
    const x = parseSignedNumber()
    eat('COMMA')
    const y = parseSignedNumber()
    eat('RPAREN')
    eat('NEWLINE', 'EOF')
    return { kind: 'PointDecl', name: nameTok.value, x, y }
  }

  function parseSignedNumber(): number {
    const neg = check('MINUS') ? (advance(), -1) : 1
    return neg * parseFloat(eat('NUMBER').value)
  }

  // ── Pick ───────────────────────────────────────────────────────────────────

  function parsePickStmt(): PickStmt {
    eat('PICK')
    const vertex = parseVertexRef()
    const index = parseInt(eat('NUMBER').value)
    eat('NEWLINE', 'EOF')
    return { kind: 'PickStmt', vertex, index }
  }

  // ── Print ──────────────────────────────────────────────────────────────────

  function parsePrintStmt(): PrintStmt {
    eat('PRINT')
    let target: Printable

    if (check('ANGLE')) {
      advance()
      target = parseAngleRef()
    } else {
      target = parseSegmentOrVertex()
    }

    eat('NEWLINE', 'EOF')
    return { kind: 'PrintStmt', target }
  }

  // ── Settings ───────────────────────────────────────────────────────────────

  function parseSettingStmt(): SettingStmt {
    eat('SET')
    const tok = peek()

    if (check('UNIT')) {
      advance()
      const lengthNames = new Set(['cm', 'mm', 'm', 'in', 'inches'])
      if (check('UNIT_CM', 'UNIT_MM', 'UNIT_M', 'UNIT_IN', 'UNIT_INCHES') || check('UNIT') ||
          (check('LOWER_NAME') && lengthNames.has(peek().value))) {
        const unit = parseLengthUnit()
        eat('NEWLINE', 'EOF')
        return { kind: 'SetUnitLength', unit }
      }
      if (check('DEGREES', 'RADIANS')) {
        const unit = parseAngleUnit()
        eat('NEWLINE', 'EOF')
        return { kind: 'SetUnitAngle', unit }
      }
      throw new ParseError(`Expected a unit (cm, mm, m, in, inches, degrees, radians)`, peek().line, peek().col)
    }

    if (check('WINDING')) {
      advance()
      const dir = check('CLOCKWISE') ? 'clockwise' : 'counterclockwise'
      eat('CLOCKWISE', 'COUNTERCLOCKWISE')
      eat('NEWLINE', 'EOF')
      return { kind: 'SetWinding', dir }
    }

    if (check('GRID')) {
      advance()
      const on = check('ON')
      eat('ON', 'OFF')
      eat('NEWLINE', 'EOF')
      return { kind: 'SetGrid', on }
    }

    throw new ParseError(`Unknown setting "${tok.value}"`, tok.line, tok.col)
  }

  function parseLengthUnit(): LengthUnit {
    const tok = peek()
    const map: Partial<Record<TokenKind, LengthUnit>> = {
      UNIT: 'unit', UNIT_CM: 'cm', UNIT_MM: 'mm', UNIT_M: 'm',
      UNIT_IN: 'in', UNIT_INCHES: 'inches',
    }
    // 'unit' keyword itself is a valid length unit name
    if (check('UNIT')) { advance(); return 'unit' }
    const unitKind = tok.kind
    if (unitKind in map) { advance(); return map[unitKind]! }
    // Try reading as a lower_name (cm/mm/m/in/inches appear as LOWER_NAME if not attached to a number)
    if (check('LOWER_NAME')) {
      const name = advance().value
      const nameMap: Record<string, LengthUnit> = { cm: 'cm', mm: 'mm', m: 'm', in: 'in', inches: 'inches' }
      if (name in nameMap) return nameMap[name]!
    }
    throw new ParseError(`Expected a length unit (cm, mm, m, in, inches, unit)`, tok.line, tok.col)
  }

  function parseAngleUnit(): AngleUnit {
    if (check('DEGREES')) { advance(); return 'degrees' }
    if (check('RADIANS')) { advance(); return 'radians' }
    const tok = peek()
    throw new ParseError(`Expected "degrees" or "radians"`, tok.line, tok.col)
  }

  return parseProgram()
}
