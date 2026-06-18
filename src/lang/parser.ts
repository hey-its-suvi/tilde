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
  Program, Statement, ShapeDecl, ShapeKind, LineDecl, PointDecl, CircleDecl, ScalarDecl,
  ConstraintStmt, PrintStmt, SettingStmt, PickStmt,
  Constraint, LengthConstraint, AngleConstraint, RelationConstraint,
  EqualityConstraint, OnConstraint, PositionConstraint,
  Ref, NameRef, SubscriptRef, TupleRef, ScalarExpr,
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
      statements.push(...parseStatement())
      eatNewlines()
    }
    return { kind: 'Program', statements }
  }

  // ── Statement ──────────────────────────────────────────────────────────────
  // Returns an array because sugar declarations (e.g. `line l through p`)
  // expand into a declaration + separate constraint statements.

  function parseStatement(): Statement[] {
    const tok = peek()

    if (check('LET')) advance()  // optional sugar

    if (check('TRIANGLE', 'SQUARE', 'RECTANGLE', 'SEGMENT', 'POLYGON')) return parseShapeDecl()
    if (check('LINE')) return parseLineDecl()
    if (check('CIRCLE')) return parseCircleDecl()
    if (check('POINT')) {
      const op = tokens[pos + 2]?.kind
      if (op === 'EQUALS') return [parsePointDecl()]
      if (op === 'NEWLINE' || op === 'EOF' || op === undefined) return [parsePointDecl()]
      return parseConstraintStmt()  // point a on ...
    }
    if (check('SCALAR')) return [parseScalarDecl()]
    if (check('PRINT')) return [parsePrintStmt()]
    if (check('SET')) return [parseSettingStmt()]
    if (check('PICK')) return [parsePickStmt()]
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

  function parseTuple(): ScalarExpr[] {
    eat('LPAREN')
    const vals: ScalarExpr[] = [parseScalarExpr()]
    while (check('COMMA')) { advance(); vals.push(parseScalarExpr()) }
    eat('RPAREN')
    return vals
  }

  /** Parse a tuple value that may itself be a nested tuple — e.g. ((0,0), 5).
   *  Used for circle declaration parameters. */
  function parseTupleValue(): ScalarExpr | TupleRef {
    if (check('LPAREN')) {
      const values = parseTuple()
      return { kind: 'TupleRef', values } satisfies TupleRef
    }
    return parseScalarExpr()
  }

  function parseRef(): Ref {
    // Optional type hint before a tuple: `point (1,2)` or `line (2,3)`
    if (check('POINT', 'LINE') && tokens[pos + 1]?.kind === 'LPAREN') {
      const hint = advance().value as 'point' | 'line'
      const values = parseTuple()
      return { kind: 'TupleRef', values, hint } satisfies TupleRef
    }
    // Bare tuple: `(1,2)`
    if (check('LPAREN')) {
      const values = parseTuple()
      return { kind: 'TupleRef', values } satisfies TupleRef
    }
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

  function parseShapeDecl(): Statement[] {
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

    const stmts: Statement[] = [
      { kind: 'ShapeDecl', shapeKind, name, named, polygonSides } satisfies ShapeDecl,
    ]

    // `segment ab = 5` — inline length sugar → separate constraint
    if (check('EQUALS') && !named) {
      advance()
      const value = parseMeasureValue()
      stmts.push({ kind: 'ConstraintStmt', constraint: { kind: 'LengthConstraint', target: { kind: 'NameRef', name }, value } })
    } else if (check('WITH')) {
      advance()
      for (const c of parseConstraintList()) {
        stmts.push({ kind: 'ConstraintStmt', constraint: c })
      }
    }

    eat('NEWLINE', 'EOF')
    return stmts
  }

  // ── Constraint list (after 'with') ─────────────────────────────────────────

  function parseConstraintList(): Constraint[] {
    const constraints = [...parseConstraint()]
    while (check('AND') || check('COMMA')) {
      advance()
      constraints.push(...parseConstraint())
    }
    return constraints
  }

  // ── Constraint statement ───────────────────────────────────────────────────

  function parseConstraintStmt(): Statement[] {
    const constraints = parseConstraint()
    eat('NEWLINE', 'EOF')
    return constraints.map(c => ({ kind: 'ConstraintStmt', constraint: c } satisfies ConstraintStmt))
  }

  // ── Constraint ─────────────────────────────────────────────────────────────

  // Collect refs separated by `and` or `,`, skipping optional contextual hint keywords
  // (line, segment, point) before each ref.  Uses lookahead backtracking: if after
  // consuming a separator + ref we see an operator (=, on, through, etc.), restore
  // position — that ref was the start of a new constraint, not another target.
  function parseRefList(first: Ref): Ref[] {
    const refs: Ref[] = [first]
    while (check('AND') || check('COMMA')) {
      const savedPos = pos
      advance()
      if (check('LINE', 'SEGMENT', 'POINT')) advance()
      const next = parseRef()
      if (check('EQUALS', 'ON', 'THROUGH', 'PARALLEL', 'PERPENDICULAR', 'AT')) {
        pos = savedPos
        break
      }
      refs.push(next)
    }
    return refs
  }

  function parseConstraint(): Constraint[] {
    // point ref on target(s)
    if (check('POINT')) {
      advance()
      const point = parseRef()
      eat('ON')
      if (check('LINE', 'SEGMENT')) advance()  // optional keyword hint — consumed, not stored
      const targets = parseRefList(parseRef())
      return [{ kind: 'OnConstraint', point, targets } satisfies OnConstraint]
    }

    // angle ref = value
    if (check('ANGLE')) {
      advance()
      const target = parseRef()
      eat('EQUALS')
      const value = parseMeasureValue()
      return [{ kind: 'AngleConstraint', target, value } satisfies AngleConstraint]
    }

    // Optional 'line' hint — consumed for `line l parallel m` / `line l perpendicular m` forms
    if (check('LINE')) advance()

    // ref = ...  |  ref on ...  |  ref through ...  |  ref parallel/perpendicular ref
    // One constraint body per statement — no chaining across operators.
    // Multi-target within a single body is fine (e.g. `l through p, q`).
    const left = parseRef()
    const body = parseConstraintBody(left)
    if (body === null) {
      throw new ParseError(`Expected =, on, through, parallel, or perpendicular after reference`, peek().line, peek().col)
    }
    return body
  }

  // ── Constraint body ───────────────────────────────────────────────────────
  //
  // Everything that can follow a constraint's LHS ref. Called both from
  // parseConstraint (the standalone constraint form, where `left` was just
  // parsed) and from the decl-trail sugar in parseLineDecl / parseCircleDecl
  // (where `left` is the just-declared element).
  //
  // Returns null if the next token doesn't start a constraint body — used by
  // the decl-trail callers to know when to stop chaining.

  function parseConstraintBody(left: Ref): Constraint[] | null {
    if (check('ON')) {
      advance()
      if (check('LINE', 'SEGMENT')) advance()  // optional keyword hint
      const targets = parseRefList(parseRef())
      return [{ kind: 'OnConstraint', point: left, targets } satisfies OnConstraint]
    }

    if (check('THROUGH')) {
      advance()
      if (check('POINT')) advance()  // optional keyword hint
      // `through p` desugars to "p on left". Multi-targets allowed via
      // comma / `and` separators — one OnConstraint per point.
      const points = parseRefList(parseRef())
      return points.map(point => ({
        kind: 'OnConstraint', point, targets: [left],
      } satisfies OnConstraint))
    }

    if (check('PARALLEL', 'PERPENDICULAR')) {
      const relKind = advance().kind
      const rel = relKind === 'PARALLEL' ? 'parallel' : 'perpendicular'
      if (check('LINE')) advance()  // optional hint: `l parallel line m`
      const right = parseRef()
      let at: Ref | undefined
      let distance: ScalarExpr | undefined
      if (check('AT')) {
        advance()
        if (check('NUMBER') || check('MINUS')) {
          distance = parseScalarExpr()  // `l parallel m at 3` — distance
        } else {
          at = parseRef()                 // `l perpendicular m at p` — intersection point
        }
      }
      return [{ kind: 'RelationConstraint', relation: rel, left, right, at, distance } satisfies RelationConstraint]
    }

    if (check('EQUALS')) {
      advance()
      // ref = (x, y) → position constraint
      if (check('LPAREN')) {
        eat('LPAREN')
        const x = parseScalarExpr()
        eat('COMMA')
        const y = parseScalarExpr()
        eat('RPAREN')
        return [{ kind: 'PositionConstraint', vertex: left, x, y } satisfies PositionConstraint]
      }
      // ref = number or scalar ref → length constraint
      if (check('NUMBER') || check('NAME')) {
        const value = parseMeasureValue()
        return [{ kind: 'LengthConstraint', target: left, value } satisfies LengthConstraint]
      }
      // ref = ref → equality (length) or coincidence (vertex) — solver decides
      const right = parseRef()
      return [{ kind: 'EqualityConstraint', left, right } satisfies EqualityConstraint]
    }

    return null
  }

  // ── Values ─────────────────────────────────────────────────────────────────

  function parseMeasureValue(): MeasureValue {
    const value = parseScalarExpr()

    const unitMap: Partial<Record<TokenKind, LengthUnit | AngleUnit>> = {
      UNIT_CM: 'cm', UNIT_MM: 'mm', UNIT_M: 'm',
      UNIT_IN: 'in', UNIT_INCHES: 'inches',
      UNIT_DEG: 'deg', UNIT_RAD: 'rad',
    }

    // Unit suffixes only follow literal numbers, not scalar refs
    if (typeof value === 'number') {
      const unitKind = peek().kind
      if (unitKind in unitMap) {
        advance()
        return { value, unit: unitMap[unitKind]! }
      }
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

  function parseLineDecl(): Statement[] {
    eat('LINE')
    const name = eat('NAME').value

    let a: ScalarExpr | null = null
    let b: ScalarExpr | null = null
    let c: ScalarExpr | null = null

    if (check('EQUALS')) {
      eat('EQUALS')
      eat('LPAREN')

      // Check for leading comma: (, b) form — first field is null
      if (check('COMMA')) {
        advance()
        const second = parseScalarExpr()
        eat('RPAREN')
        b = -1; c = second
      } else {
        const first = parseScalarExpr()
        eat('COMMA')

        // Trailing comma after first: (m,) form — second field is null
        if (check('RPAREN')) {
          advance()
          a = first; b = -1
        } else {
          const second = parseScalarExpr()

          if (check('COMMA')) {
            advance()
            // Trailing comma after second: (a, b,) form — third field is null
            if (check('RPAREN')) {
              advance()
              a = first; b = second
            } else {
              // Full 3-tuple: (a, b, c)
              const third = parseScalarExpr()
              eat('RPAREN')
              a = first; b = second; c = third
            }
          } else {
            // Full 2-tuple: (m, b_val) → slope-intercept
            eat('RPAREN')
            a = first; b = -1; c = second
          }
        }
      }
    }

    // `with slope=m` / `with intercept=k` / `with slope=m and intercept=k`
    // Sugar for partial slope-intercept form. Sets a=m, b=-1, c=k as available.
    //
    // The `=` between the property name and the value is optional — `with slope 2`
    // reads the same as `with slope=2`.
    //
    // Bundled form: `with slope s = 3` declares scalar `s` with value 3 AND uses
    // it as the slope. Equivalent to `scalar s = 3; line l with slope=s`. The
    // bundled `=` is only allowed when there was no leading `=` before the name
    // (i.e. one `=` per binding — `with slope = s = 3` is a parse error).
    const bundledScalarDecls: ScalarDecl[] = []
    if (check('WITH')) {
      advance()
      const parseSlopeOrInterceptValue = (): ScalarExpr => {
        const hadEquals = check('EQUALS') ? (advance(), true) : false
        const value = parseScalarExpr()
        if (!hadEquals && typeof value !== 'number' && value.kind === 'NameRef' && check('EQUALS')) {
          advance()
          const bound = parseScalarExpr()
          bundledScalarDecls.push({ kind: 'ScalarDecl', name: value.name, params: bound })
        }
        return value
      }
      do {
        if (check('SLOPE')) {
          advance()
          a = parseSlopeOrInterceptValue(); b = -1
        } else if (check('INTERCEPT')) {
          advance()
          c = parseSlopeOrInterceptValue(); b = -1
        } else {
          throw new ParseError(`Expected 'slope' or 'intercept' after 'with'`, peek().line, peek().col)
        }
      } while ((check('AND') || check('COMMA')) && !!advance())
    }

    const stmts: Statement[] = [
      ...bundledScalarDecls,
      { kind: 'LineDecl', name, params: { a, b, c } } satisfies LineDecl,
    ]

    // Trailing constraint-body sugar: `through p, q`, `parallel m at p`,
    // `perpendicular m`. At most one body per decl — multiple operators in
    // sequence (e.g. `through p parallel m`) read ambiguously and aren't
    // allowed. Multi-target within a single body is fine (`through p, q`).
    const lineRef: NameRef = { kind: 'NameRef', name }
    if (!check('EQUALS')) {
      const body = parseConstraintBody(lineRef)
      if (body !== null) {
        for (const c of body) stmts.push({ kind: 'ConstraintStmt', constraint: c })
      }
    }

    eat('NEWLINE', 'EOF')
    return stmts
  }

  // ── Circle declaration ─────────────────────────────────────────────────────
  //
  // Tuple form:
  //   circle c               — bare; centre and radius free
  //   circle c = (p, r)      — centre is a named point, radius r
  //   circle c = ((x, y), r) — anonymous centre at (x, y), radius r
  //
  // `with` clause (alternative to the tuple form):
  //   circle c with center p
  //   circle c with center=(5, 3)
  //   circle c with radius 3
  //   circle c with center p and radius 3
  //
  // The `=` after a property name is optional (`with center p` = `with center=p`).
  //
  // Bundled forms — declare a sub-element and bind it in one statement:
  //   circle c with center p = (5, 3)   ↔  point p = (5, 3); circle c with center=p
  //   circle c with radius r = 3        ↔  scalar r = 3; circle c with radius=r
  //
  // One `=` per binding: `with center = p = (5, 3)` is rejected.

  function parseCircleDecl(): Statement[] {
    eat('CIRCLE')
    const name = eat('NAME').value

    let center: Ref | null = null
    let r: ScalarExpr | null = null
    const bundled: Statement[] = []

    if (check('EQUALS')) {
      // Tuple form: circle c = (...)
      eat('EQUALS')
      eat('LPAREN')
      const first = parseTupleValue()
      if (typeof first === 'number') {
        throw new ParseError(`Expected a point name or inline (x, y) tuple as circle center, got number`, peek().line, peek().col)
      } else if (first.kind === 'NameRef' || first.kind === 'TupleRef') {
        center = first
      } else {
        throw new ParseError(`Expected a point name or inline (x, y) tuple as circle center`, peek().line, peek().col)
      }
      eat('COMMA')
      r = parseScalarExpr()
      eat('RPAREN')
    } else if (check('WITH')) {
      advance()
      do {
        if (check('CENTER')) {
          advance()
          const hadEquals = check('EQUALS') ? (advance(), true) : false
          // Centre value is either a point name (NameRef) or an inline tuple (TupleRef).
          // Reject leading numeric literals — a single number isn't a valid centre.
          if (check('LPAREN')) {
            const values = parseTuple()
            center = { kind: 'TupleRef', values } satisfies TupleRef
          } else if (check('NAME')) {
            const pointName = advance().value
            center = { kind: 'NameRef', name: pointName } satisfies NameRef
            // Bundled: `with center p = (x, y)` also places point p
            if (!hadEquals && check('EQUALS')) {
              advance()
              eat('LPAREN')
              const x = parseScalarExpr()
              eat('COMMA')
              const y = parseScalarExpr()
              eat('RPAREN')
              bundled.push({
                kind: 'ConstraintStmt',
                constraint: { kind: 'PositionConstraint', vertex: { kind: 'NameRef', name: pointName }, x, y },
              })
            }
          } else {
            throw new ParseError(`Expected a point name or inline (x, y) after 'with center'`, peek().line, peek().col)
          }
        } else if (check('RADIUS')) {
          advance()
          const hadEquals = check('EQUALS') ? (advance(), true) : false
          const value = parseScalarExpr()
          // Bundled: `with radius r = 3` declares scalar r and binds radius to it
          if (!hadEquals && typeof value !== 'number' && value.kind === 'NameRef' && check('EQUALS')) {
            advance()
            const bound = parseScalarExpr()
            bundled.push({ kind: 'ScalarDecl', name: value.name, params: bound })
          }
          r = value
        } else {
          throw new ParseError(`Expected 'center' or 'radius' after 'with'`, peek().line, peek().col)
        }
      } while ((check('AND') || check('COMMA')) && !!advance())
    }

    const stmts: Statement[] = [
      ...bundled,
      { kind: 'CircleDecl', name, params: { center, r } } satisfies CircleDecl,
    ]

    // Trailing constraint-body sugar: `through p, q, r`, `parallel m at p`.
    // At most one body — chaining operators (e.g. `through p parallel m`)
    // would read ambiguously and isn't allowed.
    const circleRef: NameRef = { kind: 'NameRef', name }
    if (!check('EQUALS')) {
      const body = parseConstraintBody(circleRef)
      if (body !== null) {
        for (const c of body) stmts.push({ kind: 'ConstraintStmt', constraint: c })
      }
    }

    eat('NEWLINE', 'EOF')
    return stmts
  }

  // ── Point declaration ──────────────────────────────────────────────────────

  // Full form: `point p = (x, y)` — both axes set.
  // Partial forms (mirroring line `(m,)` / `(, b)` syntax):
  //   point p = (5,)   x known, y unknown   →  x=5,   y=null
  //   point p = (, 3)  y known, x unknown   →  x=null, y=3
  function parsePointDecl(): PointDecl {
    eat('POINT')
    const name = eat('NAME').value
    if (!check('EQUALS')) {
      eat('NEWLINE', 'EOF')
      return { kind: 'PointDecl', name, params: { x: null, y: null } }
    }
    eat('EQUALS')
    eat('LPAREN')

    let x: ScalarExpr | null = null
    let y: ScalarExpr | null = null

    // Leading comma: (, y) form — first field is null.
    if (check('COMMA')) {
      advance()
      y = parseScalarExpr()
      eat('RPAREN')
    } else {
      x = parseScalarExpr()
      eat('COMMA')
      // Trailing comma after first: (x,) form — second field is null.
      if (check('RPAREN')) {
        advance()
      } else {
        y = parseScalarExpr()
        eat('RPAREN')
      }
    }

    eat('NEWLINE', 'EOF')
    return { kind: 'PointDecl', name, params: { x, y } }
  }

  function parseSignedNumber(): number {
    const neg = check('MINUS') ? (advance(), -1) : 1
    return neg * parseFloat(eat('NUMBER').value)
  }

  /** Parse a scalar expression: a literal number or a name ref to a scalar. */
  function parseScalarExpr(): ScalarExpr {
    if (check('NAME')) return { kind: 'NameRef', name: advance().value } satisfies NameRef
    return parseSignedNumber()
  }

  // ── Scalar declaration ────────────────────────────────────────────────────

  function parseScalarDecl(): ScalarDecl {
    eat('SCALAR')
    const name = eat('NAME').value
    if (check('EQUALS')) {
      advance()
      const value = parseScalarExpr()
      eat('NEWLINE', 'EOF')
      return { kind: 'ScalarDecl', name, params: value }
    }
    eat('NEWLINE', 'EOF')
    return { kind: 'ScalarDecl', name, params: null }
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
