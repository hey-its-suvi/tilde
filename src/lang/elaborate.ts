// ─── Tilde Elaboration Layer ──────────────────────────────────────────────────
// Transforms an AST (Program) into a ConstraintSet + settings.
// Resolves all refs to concrete string keys, converts units, expands shapes
// into their constituent points/segments/constraints. The output is pure data
// with no AST nodes — ready to hand to any solver.

import { Program, Ref, TupleRef, Constraint, ShapeDecl, ShapeKind, LengthUnit } from './ast.js'
import { resolveLength } from './units.js'
import {
  ConstraintSet, ResolvedConstraint,
} from './solver/interface.js'
import { RenderConfig, DEFAULT_CONFIG } from '../renderer/interface.js'

export class ElaborationError extends Error {
  constructor(message: string) { super(`[Elaboration] ${message}`) }
}

export type ElaborationResult = {
  constraintSet: ConstraintSet
  config: RenderConfig
}

// ─── Main entry point ────────────────────────────────────────────────────────

export function elaborate(program: Program): ElaborationResult {
  const ctx = new ElaborationContext()

  // Pass 0: determine active unit
  ctx.resolveActiveUnit(program)

  // Pass 1: walk all statements
  for (const stmt of program.statements) {
    if (stmt.kind === 'ShapeDecl')           ctx.elaborateShape(stmt)
    else if (stmt.kind === 'LineDecl')       ctx.elaborateLine(stmt)
    else if (stmt.kind === 'PointDecl')      ctx.elaboratePoint(stmt)
    else if (stmt.kind === 'ConstraintStmt') ctx.elaborateConstraint(stmt.constraint)
    else if (stmt.kind === 'SetGrid')        ctx.config.grid = stmt.on
    else if (stmt.kind === 'PickStmt')       ctx.picks.set(ctx.resolveVertexName(stmt.vertex), stmt.index)
  }

  return {
    constraintSet: {
      points: ctx.points,
      segments: ctx.segments,
      lines: ctx.lines,
      constraints: ctx.constraints,
      picks: ctx.picks,
    },
    config: ctx.config,
  }
}

// ─── Elaboration Context ─────────────────────────────────────────────────────

class ElaborationContext {
  points = new Set<string>()
  segments = new Set<string>()
  lines = new Set<string>()
  constraints: ResolvedConstraint[] = []
  picks = new Map<string, number>()
  config: RenderConfig = { ...DEFAULT_CONFIG }

  activeUnit: LengthUnit | null = null

  // Track named shapes for subscript ref resolution
  private shapes = new Map<string, { kind: ShapeKind; vertexCount: number }>()

  // Counter for anonymous elements created from TupleRefs
  private anonCounter = 0

  // ── Unit resolution ──────────────────────────────────────────────────────

  resolveActiveUnit(program: Program) {
    let seenGeometry = false
    for (const stmt of program.statements) {
      const isGeometry = stmt.kind === 'ShapeDecl' || stmt.kind === 'LineDecl' ||
                         stmt.kind === 'PointDecl'  || stmt.kind === 'ConstraintStmt'
      if (isGeometry) { seenGeometry = true; continue }

      const isSetting = stmt.kind === 'SetUnitLength' || stmt.kind === 'SetUnitAngle' ||
                        stmt.kind === 'SetWinding'   || stmt.kind === 'SetGrid'
      if (isSetting && seenGeometry) {
        throw new ElaborationError('`set` statements must appear before any geometry declarations')
      }
      if (stmt.kind === 'SetUnitLength') {
        this.activeUnit = stmt.unit
        return
      }
    }

    // No explicit set unit — infer from first length that carries a unit suffix
    for (const stmt of program.statements) {
      if (stmt.kind !== 'ConstraintStmt') continue
      const c = stmt.constraint
      if ((c.kind === 'LengthConstraint' || c.kind === 'AngleConstraint') && c.value.unit !== null) {
        this.activeUnit = c.value.unit as LengthUnit
        return
      }
    }
  }

  // ── Shape elaboration ────────────────────────────────────────────────────

  elaborateShape(decl: ShapeDecl) {
    const { shapeKind, name, named } = decl

    if (!named) {
      // Decompose mode — vertex chars are the name characters
      if (shapeKind === 'segment' && name.length === 2) {
        const [v1, v2] = [name[0]!, name[1]!]
        this.touchPoint(v1)
        this.touchPoint(v2)
        this.segments.add(segKey(v1, v2))
      }
      if (shapeKind === 'triangle' && name.length === 3) {
        const [v1, v2, v3] = [name[0]!, name[1]!, name[2]!]
        this.touchPoint(v1)
        this.touchPoint(v2)
        this.touchPoint(v3)
        this.segments.add(segKey(v1, v2))
        this.segments.add(segKey(v2, v3))
        this.segments.add(segKey(v3, v1))
      }
    } else {
      // Subscript mode — vertices are name_1, name_2, ...
      const n = vertexCountFor(decl)
      if (n !== null) {
        this.shapes.set(name, { kind: shapeKind, vertexCount: n })
        const verts = Array.from({ length: n }, (_, i) => vn(name, i + 1))
        for (const v of verts) this.touchPoint(v)
        if (shapeKind === 'segment') {
          this.segments.add(segKey(verts[0]!, verts[1]!))
        } else if (shapeKind === 'triangle' || shapeKind === 'square' || shapeKind === 'rectangle' || shapeKind === 'polygon') {
          for (let i = 0; i < n; i++) {
            this.segments.add(segKey(verts[i]!, verts[(i + 1) % n]!))
          }
        }
      }
    }

  }

  // ── Line elaboration ─────────────────────────────────────────────────────

  elaborateLine(decl: import('./ast.js').LineDecl) {
    if (this.lines.has(decl.name)) {
      throw new ElaborationError(`"${decl.name}" is already declared as a line`)
    }
    if (this.points.has(decl.name)) {
      throw new ElaborationError(`"${decl.name}" is already declared as a point`)
    }
    this.lines.add(decl.name)

    // Emit line-equation constraint if any coefficients are provided
    const { a, b, c } = decl.params
    if (a !== null || b !== null || c !== null) {
      this.constraints.push({ kind: 'line-equation', line: decl.name, a, b, c })
    }
  }

  // ── Point elaboration ────────────────────────────────────────────────────

  elaboratePoint(decl: import('./ast.js').PointDecl) {
    if (this.lines.has(decl.name)) {
      throw new ElaborationError(`"${decl.name}" is already declared as a line`)
    }
    this.points.add(decl.name)

    const { x, y } = decl.params
    if (x !== null && y !== null) {
      this.constraints.push({ kind: 'position', point: decl.name, x, y })
    }
  }

  // ── Constraint elaboration ───────────────────────────────────────────────

  elaborateConstraint(c: Constraint) {
    if (c.kind === 'LengthConstraint') {
      const { v1, v2 } = this.resolveSegmentPair(c.target)
      this.touchPoint(v1)
      this.touchPoint(v2)
      this.segments.add(segKey(v1, v2))
      this.constraints.push({
        kind: 'distance', p1: v1, p2: v2,
        value: resolveLength(c.value, this.activeUnit),
      })
      return
    }

    if (c.kind === 'AngleConstraint') {
      const { v1, at, v3 } = this.resolveAngleVertices(c.target)
      this.touchPoint(v1)
      this.touchPoint(at)
      this.touchPoint(v3)
      this.constraints.push({
        kind: 'angle', from: v1, vertex: at, to: v3,
        degrees: c.value.value,
      })
      return
    }

    if (c.kind === 'PositionConstraint') {
      const name = this.resolveVertexName(c.vertex)
      this.touchPoint(name)
      this.constraints.push({ kind: 'position', point: name, x: c.x, y: c.y })
      return
    }

    if (c.kind === 'OnConstraint') {
      const pointName = this.resolveVertexName(c.point)
      this.touchPoint(pointName)
      for (const target of c.targets) this.elaborateOnTarget(target, pointName)
      return
    }

    if (c.kind === 'RelationConstraint') {
      const l1 = this.resolveLineName(c.left)
      const l2 = this.resolveLineName(c.right)

      if (c.relation === 'parallel') {
        this.constraints.push({ kind: 'parallel', l1, l2, distance: c.distance })
      } else {
        this.constraints.push({ kind: 'perpendicular', l1, l2 })
      }

      // `at p` — sugar: p lies on both lines
      if (c.at !== undefined) {
        const ptName = this.resolveVertexName(c.at)
        this.touchPoint(ptName)
        this.constraints.push({ kind: 'on-line', point: ptName, line: l1 })
        this.constraints.push({ kind: 'on-line', point: ptName, line: l2 })
      }
      return
    }

    // EqualityConstraint — not yet supported
    if (c.kind === 'EqualityConstraint') {
      throw new ElaborationError('equality constraints are not yet supported')
    }
  }

  // ── On-target elaboration ────────────────────────────────────────────────

  private elaborateOnTarget(target: Ref, pointName: string) {
    if (target.kind === 'SubscriptRef' && target.indices.length === 2) {
      const v1 = vn(target.shape, target.indices[0]!)
      const v2 = vn(target.shape, target.indices[1]!)
      this.touchPoint(v1)
      this.touchPoint(v2)
      this.segments.add(segKey(v1, v2))
      this.constraints.push({ kind: 'on-segment', point: pointName, s1: v1, s2: v2 })
      return
    }
    if (target.kind === 'NameRef') {
      const { name } = target
      if (this.lines.has(name)) {
        this.constraints.push({ kind: 'on-line', point: pointName, line: name })
        return
      }
      if (name.length === 2) {
        const v1 = name[0]!, v2 = name[1]!
        this.touchPoint(v1)
        this.touchPoint(v2)
        this.segments.add(segKey(v1, v2))
        this.constraints.push({ kind: 'on-segment', point: pointName, s1: v1, s2: v2 })
        return
      }
      // Shape name in subscript mode (e.g. "on t" where t is a segment)
      const shape = this.shapes.get(name)
      if (shape && shape.kind === 'segment') {
        const v1 = vn(name, 1), v2 = vn(name, 2)
        this.constraints.push({ kind: 'on-segment', point: pointName, s1: v1, s2: v2 })
        return
      }
      throw new ElaborationError(`"${name}" is not a declared line or segment`)
    }
    if (target.kind === 'TupleRef') {
      // Tuple in on-context is a line: `p on (1, -1, 0)`
      const lineName = this.materializeLine(target)
      this.constraints.push({ kind: 'on-line', point: pointName, line: lineName })
      return
    }
    throw new ElaborationError('invalid on-constraint target')
  }

  // ── Ref resolution helpers ───────────────────────────────────────────────

  resolveVertexName(ref: Ref): string {
    if (ref.kind === 'NameRef') return ref.name
    if (ref.kind === 'TupleRef') return this.materializePoint(ref)
    if (ref.indices.length === 1) return vn(ref.shape, ref.indices[0]!)
    throw new ElaborationError(`expected a vertex, got segment ref ${ref.shape}_${ref.indices.join('_')}`)
  }

  private resolveSegmentPair(ref: Ref): { v1: string; v2: string } {
    if (ref.kind === 'SubscriptRef' && ref.indices.length === 2) {
      return { v1: vn(ref.shape, ref.indices[0]!), v2: vn(ref.shape, ref.indices[1]!) }
    }
    if (ref.kind === 'NameRef') {
      const { name } = ref
      if (name.length === 2) return { v1: name[0]!, v2: name[1]! }
      throw new ElaborationError(`"${name}" is not a valid segment reference — use a 2-char name or subscript form t_1_2`)
    }
    if (ref.kind === 'TupleRef') throw new ElaborationError('cannot use an inline tuple as a segment reference')
    throw new ElaborationError(`expected a segment ref, got vertex ${ref.shape}_${ref.indices[0]}`)
  }

  private resolveAngleVertices(ref: Ref): { v1: string; at: string; v3: string } {
    if (ref.kind === 'SubscriptRef' && ref.indices.length === 1) {
      const shape = this.shapes.get(ref.shape)
      if (!shape) throw new ElaborationError(`shape "${ref.shape}" is not declared`)
      const n = shape.vertexCount
      const i = ref.indices[0]!
      return { v1: vn(ref.shape, ((i - 2 + n) % n) + 1), at: vn(ref.shape, i), v3: vn(ref.shape, (i % n) + 1) }
    }
    if (ref.kind === 'NameRef') {
      const { name } = ref
      if (name.length === 3) return { v1: name[0]!, at: name[1]!, v3: name[2]! }
      throw new ElaborationError(`"${name}" is not a valid angle reference — use a 3-char name or subscript form t_2`)
    }
    throw new ElaborationError('invalid angle reference')
  }

  private resolveLineName(ref: Ref): string {
    if (ref.kind === 'TupleRef') return this.materializeLine(ref)
    if (ref.kind !== 'NameRef') throw new ElaborationError('expected a line name, got subscript ref')
    if (!this.lines.has(ref.name)) throw new ElaborationError(`"${ref.name}" is not a declared line`)
    return ref.name
  }

  // ── TupleRef materialization ──────────────────────────────────────────────

  /** Interpret a TupleRef as a point: mint an anonymous point with a position constraint. */
  private materializePoint(ref: TupleRef): string {
    if (ref.values.length !== 2)
      throw new ElaborationError(`expected 2 values for a point, got ${ref.values.length}`)
    const name = `_pt${++this.anonCounter}`
    this.points.add(name)
    this.constraints.push({ kind: 'position', point: name, x: ref.values[0]!, y: ref.values[1]! })
    return name
  }

  /** Interpret a TupleRef as a line: mint an anonymous line with a line-equation constraint. */
  private materializeLine(ref: TupleRef): string {
    const name = `_ln${++this.anonCounter}`
    this.lines.add(name)
    if (ref.values.length === 2) {
      // slope-intercept (m, b) → a=m, b=-1, c=b
      this.constraints.push({ kind: 'line-equation', line: name, a: ref.values[0]!, b: -1, c: ref.values[1]! })
    } else if (ref.values.length === 3) {
      // general form (a, b, c)
      this.constraints.push({ kind: 'line-equation', line: name, a: ref.values[0]!, b: ref.values[1]!, c: ref.values[2]! })
    } else {
      throw new ElaborationError(`expected 2 or 3 values for a line, got ${ref.values.length}`)
    }
    return name
  }

  // ── Point helpers ────────────────────────────────────────────────────────

  private touchPoint(name: string) {
    if (this.lines.has(name)) {
      throw new ElaborationError(`"${name}" is already declared as a line`)
    }
    this.points.add(name)
  }
}

// ─── Utility ─────────────────────────────────────────────────────────────────

function vn(shape: string, i: number): string { return `${shape}_${i}` }

function segKey(v1: string, v2: string): string {
  return v1 < v2 ? `${v1}:${v2}` : `${v2}:${v1}`
}

function vertexCountFor(decl: ShapeDecl): number | null {
  if (decl.shapeKind === 'segment')   return 2
  if (decl.shapeKind === 'triangle')  return 3
  if (decl.shapeKind === 'square')    return 4
  if (decl.shapeKind === 'rectangle') return 4
  if (decl.shapeKind === 'polygon')   return decl.polygonSides ?? null
  return null
}
