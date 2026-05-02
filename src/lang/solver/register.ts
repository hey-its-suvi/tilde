// ─── Tilde Solver — Pass 1: Registration ─────────────────────────────────────
// Walks AST statements, builds the GeomModel: registers shapes/lines/points,
// applies all explicit constraints, and resolves AST refs to model keys.

import { ShapeDecl, LineDecl, PointDecl, Constraint, Ref } from '../ast.js'
import { resolveLength } from '../units.js'
import {
  GeomModel, RegisteredShape,
  touchPoint, setPoint, getPoint,
  setLength, setAngle, segKey,
} from './model.js'
import {
  workingVal, isWorkingComplete, makeWorkingLine,
} from './types.js'
import { isEqual } from './geom.js'
import { ConstraintError } from './types.js'

// ── Vertex name helper ────────────────────────────────────────────────────────

// Subscript-mode vertex name: shape "t", index 2 → "t_2"
function vn(shape: string, i: number): string { return `${shape}_${i}` }

// ── Line registration ─────────────────────────────────────────────────────────

export function registerLine(model: GeomModel, decl: LineDecl) {
  if (model.lines.has(decl.name)) {
    throw new ConstraintError(`"${decl.name}" is already declared as a line`)
  }
  if (model.points.has(decl.name)) {
    throw new ConstraintError(`"${decl.name}" is already declared as a point`)
  }
  model.lines.set(decl.name, makeWorkingLine(decl.a, decl.b, decl.c))
}

// ── Point registration ────────────────────────────────────────────────────────

export function registerPoint(model: GeomModel, decl: PointDecl) {
  if (model.lines.has(decl.name)) {
    throw new ConstraintError(`"${decl.name}" is already declared as a line`)
  }
  const existing = model.points.get(decl.name)
  if (existing) {
    if (isWorkingComplete(existing)) {
      // Explicitly placed — only allowed if same position
      if (decl.x !== null && decl.y !== null) {
        const ev = workingVal(existing)
        if (!isEqual(ev.x!, decl.x) || !isEqual(ev.y!, decl.y)) {
          throw new ConstraintError(`"${decl.name}" is already placed at (${ev.x}, ${ev.y}), cannot redefine as (${decl.x}, ${decl.y})`)
        }
      }
      return  // same position or bare re-declaration — no-op
    }
    // Implicitly created (free) — apply coordinates if provided
    if (decl.x !== null && decl.y !== null) {
      setPoint(model, decl.name, decl.x, decl.y, 0)
    }
    return
  }
  // Fresh declaration
  if (decl.x !== null && decl.y !== null) {
    setPoint(model, decl.name, decl.x, decl.y, 0)
  } else {
    touchPoint(model, decl.name)
  }
}

// ── Shape registration ────────────────────────────────────────────────────────

function vertexCountFor(decl: ShapeDecl): number | null {
  if (decl.shapeKind === 'segment')   return 2
  if (decl.shapeKind === 'triangle')  return 3
  if (decl.shapeKind === 'square')    return 4
  if (decl.shapeKind === 'rectangle') return 4
  if (decl.shapeKind === 'polygon')   return decl.polygonSides ?? null
  return null
}

export function registerShape(model: GeomModel, decl: ShapeDecl) {
  const { shapeKind, name, named } = decl

  if (!named) {
    // Decompose mode — vertex chars are the name characters
    if (shapeKind === 'segment' && name.length === 2) {
      const [v1, v2] = [name[0]!, name[1]!]
      touchPointChecked(model, v1)
      touchPointChecked(model, v2)
      model.segments.add(segKey(v1, v2))
    }
    if (shapeKind === 'triangle' && name.length === 3) {
      const [v1, v2, v3] = [name[0]!, name[1]!, name[2]!]
      touchPointChecked(model, v1)
      touchPointChecked(model, v2)
      touchPointChecked(model, v3)
      model.segments.add(segKey(v1, v2))
      model.segments.add(segKey(v2, v3))
      model.segments.add(segKey(v3, v1))
    }
  } else {
    // Subscript mode — vertices are name_1, name_2, ...
    const n = vertexCountFor(decl)
    if (n !== null) {
      const shape: RegisteredShape = { kind: shapeKind, vertexCount: n }
      model.shapes.set(name, shape)
      const verts = Array.from({ length: n }, (_, i) => vn(name, i + 1))
      for (const v of verts) touchPointChecked(model, v)
      // Edges: each consecutive pair, plus closing edge for closed shapes
      if (shapeKind === 'segment') {
        model.segments.add(segKey(verts[0]!, verts[1]!))
      } else if (shapeKind === 'triangle' || shapeKind === 'square' || shapeKind === 'rectangle' || shapeKind === 'polygon') {
        for (let i = 0; i < n; i++) {
          model.segments.add(segKey(verts[i]!, verts[(i + 1) % n]!))
        }
      }
    }
    // Unimplemented shape kind — skip silently
  }

  // Apply inline constraints (from `let segment ab = 5` or `with ...`)
  for (const c of decl.constraints) applyConstraint(model, c)
}

function touchPointChecked(model: GeomModel, name: string) {
  if (model.lines.has(name)) {
    throw new ConstraintError(`"${name}" is already declared as a line`)
  }
  touchPoint(model, name)
}

// ── Ref resolution ────────────────────────────────────────────────────────────
// The parser produces NameRef | SubscriptRef. These helpers resolve refs to
// the string keys the model uses internally, with semantic validation.

/** Resolve a Ref to a single vertex key. Errors if ref looks like a segment. */
export function resolveVertexName(ref: Ref): string {
  if (ref.kind === 'NameRef') return ref.name
  if (ref.indices.length === 1) return vn(ref.shape, ref.indices[0]!)
  throw new ConstraintError(`expected a vertex, got segment ref ${ref.shape}_${ref.indices.join('_')}`)
}

/** Resolve a Ref to a segment vertex pair. */
function resolveSegmentPair(ref: Ref): { v1: string; v2: string } {
  if (ref.kind === 'SubscriptRef' && ref.indices.length === 2) {
    return { v1: vn(ref.shape, ref.indices[0]!), v2: vn(ref.shape, ref.indices[1]!) }
  }
  if (ref.kind === 'NameRef') {
    const { name } = ref
    if (name.length === 2) return { v1: name[0]!, v2: name[1]! }
    throw new ConstraintError(`"${name}" is not a valid segment reference — use a 2-char name or subscript form t_1_2`)
  }
  throw new ConstraintError(`expected a segment ref, got vertex ${ref.shape}_${ref.indices[0]}`)
}

/** Resolve an angle ref to its three vertex keys (prev, apex, next). */
function resolveAngleVertices(model: GeomModel, ref: Ref): { v1: string; at: string; v3: string } {
  if (ref.kind === 'SubscriptRef' && ref.indices.length === 1) {
    const shape = model.shapes.get(ref.shape)
    if (!shape) throw new ConstraintError(`shape "${ref.shape}" is not declared`)
    const n = shape.vertexCount
    const i = ref.indices[0]!
    return { v1: vn(ref.shape, ((i - 2 + n) % n) + 1), at: vn(ref.shape, i), v3: vn(ref.shape, (i % n) + 1) }
  }
  if (ref.kind === 'NameRef') {
    const { name } = ref
    if (name.length === 3) return { v1: name[0]!, at: name[1]!, v3: name[2]! }
    throw new ConstraintError(`"${name}" is not a valid angle reference — use a 3-char name or subscript form t_2`)
  }
  throw new ConstraintError(`invalid angle reference`)
}

/** Apply an on-constraint target: resolve to line or segment and register. */
function applyOnTarget(model: GeomModel, target: Ref, pointName: string) {
  if (target.kind === 'SubscriptRef' && target.indices.length === 2) {
    const v1 = vn(target.shape, target.indices[0]!)
    const v2 = vn(target.shape, target.indices[1]!)
    touchPointChecked(model, v1)
    touchPointChecked(model, v2)
    model.segments.add(segKey(v1, v2))
    model.onSegment.set(pointName, { v1, v2 })
    return
  }
  if (target.kind === 'NameRef') {
    const { name } = target
    // Check lines first
    if (model.lines.has(name)) {
      const existing = model.onLine.get(pointName) ?? []
      model.onLine.set(pointName, [...existing, name])
      return
    }
    // 2-char name → explicit segment
    if (name.length === 2) {
      const v1 = name[0]!, v2 = name[1]!
      touchPointChecked(model, v1)
      touchPointChecked(model, v2)
      model.segments.add(segKey(v1, v2))
      model.onSegment.set(pointName, { v1, v2 })
      return
    }
    // Shape name in subscript mode (e.g. segment t → t_1:t_2)
    const shape = model.shapes.get(name)
    if (shape && shape.kind === 'segment') {
      const v1 = vn(name, 1), v2 = vn(name, 2)
      model.onSegment.set(pointName, { v1, v2 })
      return
    }
    throw new ConstraintError(`"${name}" is not a declared line or segment`)
  }
  throw new ConstraintError(`invalid on-constraint target`)
}

// ── Constraint application ────────────────────────────────────────────────────

export function applyConstraint(model: GeomModel, c: Constraint) {
  if (c.kind === 'LengthConstraint') {
    const { v1, v2 } = resolveSegmentPair(c.target)
    touchPoint(model, v1)
    touchPoint(model, v2)
    model.segments.add(segKey(v1, v2))
    setLength(model, v1, v2, resolveLength(c.value, model.activeUnit))
    return
  }

  if (c.kind === 'AngleConstraint') {
    const { v1, at, v3 } = resolveAngleVertices(model, c.target)
    touchPoint(model, v1)
    touchPoint(model, at)
    touchPoint(model, v3)
    setAngle(model, v1, at, v3, c.value.value)
    return
  }

  if (c.kind === 'PositionConstraint') {
    const name = resolveVertexName(c.vertex)
    const existing = model.points.get(name)
    if (existing && isWorkingComplete(existing)) {
      const ev = workingVal(existing)
      if (!isEqual(ev.x!, c.x) || !isEqual(ev.y!, c.y)) {
        throw new ConstraintError(`vertex "${name}" is already placed at (${ev.x}, ${ev.y}), cannot redefine as (${c.x}, ${c.y})`)
      }
    } else {
      setPoint(model, name, c.x, c.y, 0)
    }
    return
  }

  if (c.kind === 'OnConstraint') {
    const pointName = resolveVertexName(c.point)
    touchPointChecked(model, pointName)
    applyOnTarget(model, c.target, pointName)
    return
  }

  // EqualityConstraint and RelationConstraint parse but are not yet implemented
}
