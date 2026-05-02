// ─── Tilde Parser ────────────────────────────────────────────────────────────
// Recursive descent parser. Consumes a token stream from the lexer
// and produces a Program AST node.
//
// The parser's job is structural — it recognises syntax, not semantics.
// It does not know whether a name refers to a line, point, or shape.
// The only structurally distinct reference form is the subscript (t_1, t_1_2),
// because the underscore separator makes it unambiguous from the token stream.
// Everything else is a plain NameRef; the solver resolves what it is.

import { Token, TokenKind } from './lexer.js'
import {
  Program, Statement, ShapeDecl, ShapeKind, LineDecl, PointDecl,
  ConstraintStmt, PrintStmt, SettingStmt, PickStmt,
  Constraint, LengthConstraint, AngleConstraint, RelationConstraint,
  EqualityConstraint, OnConstraint, PositionConstraint,
  Ref, NameRef, SubscriptRef,
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

    if (check('LET')) advance()  // optional sugar

    if (check('TRIANGLE', 'SQUARE', 'RECTANGLE', 'SEGMENT', 'POLYGON')) return parseShapeDecl()
    if (check('LINE')) return parseLineDecl()
    if (check('POINT')) {
      const op = tokens[pos + 2]?.kind
      if (op === 'EQUALS') return parsePointDecl()
      if (op === 'NEWLINE' || op === 'EOF' || op === undefined) return parsePointDecl()
      return parseConstraintStmt()  // point a on ...
    }
    if (check('PRINT')) return parsePrintStmt()
    if (check('SET')) return parseSettingStmt()
    if (check('PICK')) return parsePickStmt()
    if (check('ANGLE')) return parseConstraintStmt()
    if (check('NAME')) return parseConstraintStmt()

    throw new ParseError(`Unexpected token ${tok.kind} ("${tok.value}")`, tok.line, tok.col)
  }

  // ── Ref ────────────────────────────────────────────────────────────────────
  // One function for all references. The parser produces:
  //   NameRef      — any plain name; solver resolves the entity
  //   SubscriptRef — t_1 or t_1_2; structurally distinct via underscore

  function isSubscriptRef(): boolean {
    return check('NAME') && tokens[pos + 1]?.kind === 'UNDERSCORE'
  }

  function parseRef(): Ref {
    if (isSubscriptRef()) {
      const shape = advance().value
      eat('UNDERSCORE')
      const i = parseInt(eat('NUMBER').value)
      if (check('UNDERSCORE')) {
        eat('UNDERSCORE')
        const j = parseInt(eat('NUMBER').value)
        return { kind: 'SubscriptRef', shape, indices: [i, j] } satisfies SubscriptRef
      }
      return { kind: 'SubscriptRef', shape, indices: [i] } satisfies SubscriptRef
    }
    return { kind: 'NameRef', name: eat('NAME').value } satisfies NameRef
  }

  // ── Shape declaration ──────────────────────────────────────────────────────

  function parseShapeDecl(): ShapeDecl {
    const kw = advance()
    const shapeKind = kw.value as ShapeKind

    let polygonSides: number | undefined
    if (shapeKind === 'polygon') {
      polygonSides = parseFloat(eat('NUMBER').value)
    }

    const name = eat('NAME').value

    const expectedLengths: Partial<Record<ShapeKind, number>> = {
      triangle: 3, square: 4, rectangle: 4, segment: 2,
    }
    const expectedForShape = shapeKind === 'polygon' ? polygonSides : expectedLengths[shapeKind]
    const isAllDistinct = new Set(name).size === name.length
    const decompose = name === name.toLowerCase()
      && expectedForShape !== undefined
      && name.length === expectedForShape
      && isAllDistinct
    const named = !decompose

    const constraints: Constraint[] = []

    // `segment ab = 5` — inline length sugar
    if (check('EQUALS') && !named) {
      advance()
      const value = parseMeasureValue()
      constraints.push({ kind: 'LengthConstraint', target: { kind: 'NameRef', name }, value })
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
      advance()
      constraints.push(parseConstraint())
    }
    return constraints
  }

  // ── Constraint statement ───────────────────────────────────────────────────

  function parseConstraintStmt(): ConstraintStmt {
    const constraint = parseConstraint()
    eat('NEWLINE', 'EOF')
    return { kind: 'ConstraintStmt', constraint }
  }

  // ── Constraint ─────────────────────────────────────────────────────────────

  function parseConstraint(): Constraint {
    // point ref on target
    if (check('POINT')) {
      advance()
      const point = parseRef()
      eat('ON')
      if (check('LINE', 'SEGMENT')) advance()  // optional keyword hint — consumed, not stored
      const target = parseRef()
      return { kind: 'OnConstraint', point, target } satisfies OnConstraint
    }

    // angle ref = value
    if (check('ANGLE')) {
      advance()
      const target = parseRef()
      eat('EQUALS')
      const value = parseMeasureValue()
      return { kind: 'AngleConstraint', target, value } satisfies AngleConstraint
    }

    // ref = ...  |  ref on ...  |  ref parallel/perpendicular ref
    const left = parseRef()

    if (check('ON')) {
      advance()
      if (check('LINE', 'SEGMENT')) advance()  // optional keyword hint
      const target = parseRef()
      return { kind: 'OnConstraint', point: left, target } satisfies OnConstraint
    }

    if (check('PARALLEL', 'PERPENDICULAR')) {
      const rel = advance().kind === 'PARALLEL' ? 'parallel' : 'perpendicular'
      const right = parseRef()
      return { kind: 'RelationConstraint', relation: rel, left, right } satisfies RelationConstraint
    }

    if (check('EQUALS')) {
      advance()
      // ref = (x, y) → position constraint
      if (check('LPAREN')) {
        eat('LPAREN')
        const x = parseSignedNumber()
        eat('COMMA')
        const y = parseSignedNumber()
        eat('RPAREN')
        return { kind: 'PositionConstraint', vertex: left, x, y } satisfies PositionConstraint
      }
      // ref = number → length constraint
      if (check('NUMBER')) {
        const value = parseMeasureValue()
        return { kind: 'LengthConstraint', target: left, value } satisfies LengthConstraint
      }
      // ref = ref → equality (length) or coincidence (vertex) — solver decides
      const right = parseRef()
      return { kind: 'EqualityConstraint', left, right } satisfies EqualityConstraint
    }

    throw new ParseError(`Expected =, on, parallel, or perpendicular after reference`, peek().line, peek().col)
  }

  // ── Values ─────────────────────────────────────────────────────────────────

  function parseMeasureValue(): MeasureValue {
    const value = parseFloat(eat('NUMBER').value)

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
  //
  // Full forms:
  //   line l = (m, b)      2-tuple slope-intercept: y = mx + b  →  a=m, b=-1, c=b
  //   line l = (a, b, c)   3-tuple direct ax+by+c=0             →  a, b, c
  //
  // Partial forms (one field unknown / null):
  //   line l = (m,)        slope known, intercept unknown        →  a=m,    b=-1,   c=null
  //   line l = (, b)       y-intercept known, slope unknown      →  a=null, b=-1,   c=b
  //   line l = (a, b,)     direction known, position unknown     →  a,      b,      c=null

  function parseLineDecl(): LineDecl {
    eat('LINE')
    const name = eat('NAME').value

    if (!check('EQUALS')) {
      eat('NEWLINE', 'EOF')
      return { kind: 'LineDecl', name, a: null, b: null, c: null }
    }

    eat('EQUALS')
    eat('LPAREN')

    // Check for leading comma: (, b) form — first field is null
    if (check('COMMA')) {
      advance()
      const second = parseSignedNumber()
      eat('RPAREN')
      eat('NEWLINE', 'EOF')
      return { kind: 'LineDecl', name, a: null, b: -1, c: second }
    }

    const first = parseSignedNumber()
    eat('COMMA')

    // Trailing comma after first: (m,) form — second field is null
    if (check('RPAREN')) {
      advance()
      eat('NEWLINE', 'EOF')
      return { kind: 'LineDecl', name, a: first, b: -1, c: null }
    }

    const second = parseSignedNumber()

    if (check('COMMA')) {
      advance()
      // Trailing comma after second: (a, b,) form — third field is null
      if (check('RPAREN')) {
        advance()
        eat('NEWLINE', 'EOF')
        return { kind: 'LineDecl', name, a: first, b: second, c: null }
      }
      // Full 3-tuple: (a, b, c)
      const third = parseSignedNumber()
      eat('RPAREN')
      eat('NEWLINE', 'EOF')
      return { kind: 'LineDecl', name, a: first, b: second, c: third }
    }

    // Full 2-tuple: (m, b_val) → slope-intercept
    eat('RPAREN')
    eat('NEWLINE', 'EOF')
    return { kind: 'LineDecl', name, a: first, b: -1, c: second }
  }

  // ── Point declaration ──────────────────────────────────────────────────────

  function parsePointDecl(): PointDecl {
    eat('POINT')
    const name = eat('NAME').value
    if (!check('EQUALS')) {
      eat('NEWLINE', 'EOF')
      return { kind: 'PointDecl', name, x: null, y: null }
    }
    eat('EQUALS')
    eat('LPAREN')
    const x = parseSignedNumber()
    eat('COMMA')
    const y = parseSignedNumber()
    eat('RPAREN')
    eat('NEWLINE', 'EOF')
    return { kind: 'PointDecl', name, x, y }
  }

  function parseSignedNumber(): number {
    const neg = check('MINUS') ? (advance(), -1) : 1
    return neg * parseFloat(eat('NUMBER').value)
  }

  // ── Pick ───────────────────────────────────────────────────────────────────

  function parsePickStmt(): PickStmt {
    eat('PICK')
    const vertex = parseRef()
    const index = parseInt(eat('NUMBER').value)
    eat('NEWLINE', 'EOF')
    return { kind: 'PickStmt', vertex, index }
  }

  // ── Print ──────────────────────────────────────────────────────────────────

  function parsePrintStmt(): PrintStmt {
    eat('PRINT')
    const angle = check('ANGLE') ? (advance(), true) : false
    const target = parseRef()
    eat('NEWLINE', 'EOF')
    return { kind: 'PrintStmt', target, angle }
  }

  // ── Settings ───────────────────────────────────────────────────────────────

  function parseSettingStmt(): SettingStmt {
    eat('SET')
    const tok = peek()

    if (check('UNIT')) {
      advance()
      const lengthNames = new Set(['cm', 'mm', 'm', 'in', 'inches'])
      if (check('UNIT_CM', 'UNIT_MM', 'UNIT_M', 'UNIT_IN', 'UNIT_INCHES') || check('UNIT') ||
          (check('NAME') && lengthNames.has(peek().value))) {
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
    if (check('UNIT')) { advance(); return 'unit' }
    const unitKind = tok.kind
    if (unitKind in map) { advance(); return map[unitKind]! }
    if (check('NAME')) {
      const name = advance().value
      const nameMap: Record<string, LengthUnit> = { cm: 'cm', mm: 'mm', m: 'm', in: 'in', inches: 'inches' }
      if (name in nameMap) return nameMap[name]!
    }
    throw new ParseError(`Expected a length unit (cm, mm, m, in, inches, unit)`, tok.line, tok.col)
  }

  function parseAngleUnit(): AngleUnit {
    if (check('DEGREES')) { advance(); return 'degrees' }
    if (check('RADIANS')) { advance(); return 'radians' }
    throw new ParseError(`Expected "degrees" or "radians"`, peek().line, peek().col)
  }

  return parseProgram()
}
