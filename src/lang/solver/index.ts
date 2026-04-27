// ─── Tilde Solver ─────────────────────────────────────────────────────────────
// Walks the AST, builds a GeomModel, places all points, outputs a SceneGraph.

export class ConstraintError extends Error {
  constructor(message: string) {
    super(`[Constraint] ${message}`)
  }
}

import { Program, ShapeDecl, LineDecl, PointDecl, Constraint, LengthUnit, Ref } from '../ast.js'
import { resolveLength } from '../units.js'
import {
  GeomModel, GeomLine, RegisteredShape, makeModel,
  touchPoint, setPoint, getPoint,
  setLength, getLength, segKey,
  setAngle,
  segmentSolutions,
} from './model.js'
import { SceneGraph, SceneLine, SceneSegment, ScenePoint, RenderConfig, DEFAULT_CONFIG } from '../../renderer/interface.js'

// Default display length (units) when a segment's length is unknown
const DEFAULT_LEN = 3

// ─── Main entry ───────────────────────────────────────────────────────────────

export function solve(program: Program): { scene: SceneGraph; config: RenderConfig } {
  const model = makeModel()
  const config: RenderConfig = { ...DEFAULT_CONFIG }

  // Pass 0: determine active unit.
  // `set unit` must appear before any geometry — validate and extract it.
  // If absent, infer the active unit from the first length that carries a unit suffix.
  {
    let seenGeometry = false
    for (const stmt of program.statements) {
      const isGeometry = stmt.kind === 'ShapeDecl' || stmt.kind === 'LineDecl' ||
                         stmt.kind === 'PointDecl'  || stmt.kind === 'ConstraintStmt'
      if (isGeometry) { seenGeometry = true; continue }

      const isSetting = stmt.kind === 'SetUnitLength' || stmt.kind === 'SetUnitAngle' ||
                        stmt.kind === 'SetWinding'   || stmt.kind === 'SetGrid'
      if (isSetting && seenGeometry) {
        throw new ConstraintError('`set` statements must appear before any geometry declarations')
      }
      if (stmt.kind === 'SetUnitLength') {
        model.activeUnit = stmt.unit
        break
      }
    }

    // No explicit set unit — infer from first length that carries a unit suffix
    if (model.activeUnit === null) {
      outer: for (const stmt of program.statements) {
        const constraints =
          stmt.kind === 'ShapeDecl'      ? stmt.constraints :
          stmt.kind === 'ConstraintStmt' ? [stmt.constraint] : []
        for (const c of constraints) {
          if ((c.kind === 'LengthConstraint' || c.kind === 'AngleConstraint') && c.value.unit !== null) {
            model.activeUnit = c.value.unit as LengthUnit
            break outer
          }
        }
      }
    }
  }

  // Pass 1: register all shapes + apply explicit constraints + read settings
  for (const stmt of program.statements) {
    if (stmt.kind === 'ShapeDecl') registerShape(model, stmt)
    else if (stmt.kind === 'LineDecl') registerLine(model, stmt)
    else if (stmt.kind === 'PointDecl') registerPoint(model, stmt)
    else if (stmt.kind === 'ConstraintStmt') applyConstraint(model, stmt.constraint)
    else if (stmt.kind === 'SetGrid') config.grid = stmt.on
    else if (stmt.kind === 'PickStmt') {
      model.solutionPicks.set(resolveVertexName(stmt.vertex), stmt.index)
    }
  }

  // Pass 2: set anchor — first unconstrained free point in insertion order.
  // The anchor pins the translation degree of freedom for a fully-floating scene
  // (one where no point has explicit coordinates). If ANY point is explicitly placed
  // (free=false from a position constraint or coordinate declaration), the coordinate
  // system is already fixed and no anchor is needed — every remaining free point is
  // genuinely underconstrained relative to those fixed points.
  const hasExplicitlyPlaced = [...model.points.values()].some(pt => !pt.free)
  if (model.anchorKey === null && !hasExplicitlyPlaced) {
    for (const [k, pt] of model.points) {
      if (pt.free && !model.onLine.has(k) && !model.onSegment.has(k)) {
        model.anchorKey = k
        break
      }
    }
  }
  if (model.anchorKey) {
    setPoint(model, model.anchorKey, 0, 0, false)
  }

  // Pass 3: place all vertices using constraint propagation
  placeVertices(model)

  return { scene: buildSceneGraph(model), config }
}

// ─── Line registration ────────────────────────────────────────────────────────

function registerLine(model: GeomModel, decl: LineDecl) {
  if (model.lines.has(decl.name)) {
    throw new ConstraintError(`"${decl.name}" is already declared as a line`)
  }
  if (model.points.has(decl.name)) {
    throw new ConstraintError(`"${decl.name}" is already declared as a point`)
  }
  model.lines.set(decl.name, { a: decl.a, b: decl.b, c: decl.c })
}

// ─── Point registration ───────────────────────────────────────────────────────

function registerPoint(model: GeomModel, decl: PointDecl) {
  if (model.lines.has(decl.name)) {
    throw new ConstraintError(`"${decl.name}" is already declared as a line`)
  }
  const existing = model.points.get(decl.name)
  if (existing) {
    if (!existing.free) {
      // Explicitly placed — only allowed if same position
      if (decl.x !== null && decl.y !== null) {
        if (Math.abs(existing.x - decl.x) > 1e-9 || Math.abs(existing.y - decl.y) > 1e-9) {
          throw new ConstraintError(`"${decl.name}" is already placed at (${existing.x}, ${existing.y}), cannot redefine as (${decl.x}, ${decl.y})`)
        }
      }
      return  // same position or bare re-declaration — no-op
    }
    // Implicitly created (free) — apply coordinates if provided
    if (decl.x !== null && decl.y !== null) {
      setPoint(model, decl.name, decl.x, decl.y, false)
    }
    return
  }
  // Fresh declaration
  if (decl.x !== null && decl.y !== null) {
    setPoint(model, decl.name, decl.x, decl.y, false)
  } else {
    touchPoint(model, decl.name)
  }
}

// ─── Shape registration ───────────────────────────────────────────────────────

// Vertex name for subscript-mode shapes: shape "t", index 2 → "t_2"
function vn(shape: string, i: number): string { return `${shape}_${i}` }

// Vertex count for each shape kind (polygon uses polygonSides)
function vertexCountFor(decl: ShapeDecl): number | null {
  if (decl.shapeKind === 'segment')   return 2
  if (decl.shapeKind === 'triangle')  return 3
  if (decl.shapeKind === 'square')    return 4
  if (decl.shapeKind === 'rectangle') return 4
  if (decl.shapeKind === 'polygon')   return decl.polygonSides ?? null
  return null
}

function registerShape(model: GeomModel, decl: ShapeDecl) {
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
    if (n === null) {
      // Unimplemented shape kind — skip silently
    } else {
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

// ─── Ref resolution ───────────────────────────────────────────────────────────
// The parser produces NameRef | SubscriptRef. These helpers resolve refs to
// the string keys the model uses internally, with semantic validation.

/** Resolve a Ref to a single vertex key. Errors if ref looks like a segment. */
function resolveVertexName(ref: Ref): string {
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

// ─── Constraint application ───────────────────────────────────────────────────

function applyConstraint(model: GeomModel, c: Constraint) {
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
    if (existing && !existing.free) {
      if (Math.abs(existing.x - c.x) > 1e-9 || Math.abs(existing.y - c.y) > 1e-9) {
        throw new ConstraintError(`vertex "${name}" is already placed at (${existing.x}, ${existing.y}), cannot redefine as (${c.x}, ${c.y})`)
      }
    } else {
      setPoint(model, name, c.x, c.y, false)
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

// ─── Vertex placement ─────────────────────────────────────────────────────────
// Vertex-centric fixpoint algorithm. Does not care about declaration order or
// shape type — only the constraint graph matters.
//
// Each constraint on a vertex defines a locus — the set of positions where it
// could legally sit (circle, line, segment). Rules are tried in priority order,
// highest locus count first:
//
//   2+ loci  →  intersect them  →  finite solutions (exact)
//   1 locus  →  place at a default point on the locus  →  free
//   0 loci   →  no geometric info, structural fallback  →  free

function placeVertices(model: GeomModel): void {
  const placed = new Set<string>()
  // Seed with anchor and any explicitly-placed points (free=false)
  for (const [k, pt] of model.points) {
    if (!pt.free) placed.add(k)
  }

  // Whether we've fixed the orientation (the first non-anchor vertex placed
  // with 1 known-dist neighbor defines the x-axis direction, and is considered
  // "solved" by convention rather than underconstrained).
  // If there are placed points beyond the single anchor, at least one explicitly-
  // placed point exists — the scene is already anchored in space, so any 1-locus
  // circle placement is genuinely underconstrained (infinite positions on that circle)
  // and must not be treated as fixing orientation.
  const explicitlyPlaced = placed.size - (model.anchorKey !== null ? 1 : 0)
  let orientationFixed = explicitlyPlaced > 0

  // Heading for 1-locus circle placements. Starts pointing +x, rotates 90° CCW
  // each time to prevent collinear degeneracy (e.g. a rhombus becomes a square
  // rather than a flat line).
  let hdX = 1, hdY = 0

  let changed = true
  let isolatedSeedIndex = 0  // counts how many isolated components we've seeded
  while (changed) {
    changed = false

    // ── 2+ loci (exact) ───────────────────────────────────────────────────────
    // 2c. Line ∩ Line — on 2+ named lines. No placed neighbors needed; fires first.
    for (const v of model.points.keys()) {
      if (placed.has(v)) continue
      const lineNames = model.onLine.get(v)
      if (!lineNames || lineNames.length < 2) continue
      const l1 = model.lines.get(lineNames[0]!)!
      const l2 = model.lines.get(lineNames[1]!)!
      const pt = lineIntersect(l1, l2)
      if (!pt) {
        throw new ConstraintError(`no position for vertex ${v}: lines "${lineNames[0]}" and "${lineNames[1]}" are parallel`)
      }
      for (let i = 2; i < lineNames.length; i++) {
        const { a, b, c } = model.lines.get(lineNames[i]!)!
        if (Math.abs(a * pt.x + b * pt.y + c) > 1e-9) {
          throw new ConstraintError(`no position for vertex ${v}: lines "${lineNames[0]}", "${lineNames[1]}", and "${lineNames[i]}" have no common point`)
        }
      }
      setPoint(model, v, pt.x, pt.y, false)
      placed.add(v)
      changed = true
    }
    if (changed) continue

    // 2a. Circle ∩ Circle — 2+ placed neighbors with known distances.
    for (const v of model.points.keys()) {
      if (placed.has(v)) continue
      const nbrs = placedNeighborsWithDist(model, placed, v)
      if (nbrs.length >= 2) {
        const sols = circleIntersectBoth(nbrs[0]!, nbrs[1]!)
        if (sols.length === 0) {
          throw new ConstraintError(`no position for vertex ${v}: distance constraints are inconsistent`)
        }
        const inheritedFree = nbrs[0]!.free || nbrs[1]!.free
        const pick = model.solutionPicks.get(v)
        if (pick !== undefined && pick >= 1 && pick <= sols.length) {
          const s = sols[pick - 1]!
          setPoint(model, v, s.x, s.y, inheritedFree)
        } else if (sols.length === 1) {
          setPoint(model, v, sols[0]!.x, sols[0]!.y, inheritedFree)
        } else {
          // Multiple solutions, none picked — use solution 1 as position, store all
          setPoint(model, v, sols[0]!.x, sols[0]!.y, inheritedFree)
          model.points.get(v)!.allSolutions = sols
        }
        placed.add(v)
        changed = true
      }
    }
    if (changed) continue

    // 2b. Circle ∩ Line — on exactly one named line AND has a placed neighbor with known distance.
    for (const v of model.points.keys()) {
      if (placed.has(v)) continue
      const lineNames = model.onLine.get(v)
      if (!lineNames || lineNames.length !== 1) continue  // 2+ lines handled by 2c
      const lineName = lineNames[0]!
      const line = model.lines.get(lineName)!
      const nbrs = placedNeighborsWithDist(model, placed, v)
      if (nbrs.length >= 1) {
        const n = nbrs[0]!
        const sols = circleLineIntersectBoth(n.x, n.y, n.dist, line)
        if (sols.length === 0) {
          throw new ConstraintError(`no position for vertex ${v}: circle does not intersect line "${lineName}"`)
        }
        const pick = model.solutionPicks.get(v)
        if (pick !== undefined && pick >= 1 && pick <= sols.length) {
          setPoint(model, v, sols[pick - 1]!.x, sols[pick - 1]!.y, n.free)
        } else if (sols.length === 1) {
          setPoint(model, v, sols[0]!.x, sols[0]!.y, n.free)
        } else {
          setPoint(model, v, sols[0]!.x, sols[0]!.y, n.free)
          model.points.get(v)!.allSolutions = sols
        }
        placed.add(v)
        changed = true
      }
    }
    if (changed) continue

    // ── 1 locus (free) ────────────────────────────────────────────────────────
    // 1a. Circle — exactly 1 placed neighbor with known distance, no other loci.
    //     Heading rotates 90° CCW after each placement to avoid collinear
    //     degeneracy (e.g. rhombus → square instead of flat line).
    //     First placement fixes orientation (free=false); subsequent are free.
    for (const v of model.points.keys()) {
      if (placed.has(v)) continue
      const nbrs = placedNeighborsWithDist(model, placed, v)
      if (nbrs.length === 1) {
        const n = nbrs[0]!
        setPoint(model, v, n.x + n.dist * hdX, n.y + n.dist * hdY, orientationFixed);
        [hdX, hdY] = [-hdY, hdX]  // rotate 90° CCW
        orientationFixed = true
        placed.add(v)
        changed = true
        break  // one at a time so priority 1 re-runs before next
      }
    }
    if (changed) continue

    // 1b. Line — on a named line, no distance neighbors yet.
    //     Place at foot of perpendicular from origin to the line.
    for (const v of model.points.keys()) {
      if (placed.has(v)) continue
      const lineNames = model.onLine.get(v)
      if (!lineNames || lineNames.length === 0) continue
      const { a, b, c } = model.lines.get(lineNames[0]!)!
      const denom = a * a + b * b
      // Foot of perpendicular from (0,0) to ax+by+c=0
      const fx = -a * c / denom
      const fy = -b * c / denom
      setPoint(model, v, fx, fy, true)
      placed.add(v)
      changed = true
      break
    }
    if (changed) continue

    // 1c. Segment — on a segment, both endpoints placed.
    //     Distribute evenly: t = (i+1)/(n+1) for n unplaced points on same seg.
    {
      // Group unplaced on-segment points by their segment key
      const groups = new Map<string, string[]>()
      for (const v of model.points.keys()) {
        if (placed.has(v)) continue
        const seg = model.onSegment.get(v)
        if (!seg) continue
        if (!placed.has(seg.v1) || !placed.has(seg.v2)) continue
        const k = segKey(seg.v1, seg.v2)
        if (!groups.has(k)) groups.set(k, [])
        groups.get(k)!.push(v)
      }
      for (const [, pts] of groups) {
        const n = pts.length
        const seg = model.onSegment.get(pts[0]!)!
        const p1 = getPoint(model, seg.v1)!
        const p2 = getPoint(model, seg.v2)!
        pts.forEach((v, i) => {
          const t = (i + 1) / (n + 1)
          setPoint(model, v, p1.x + t * (p2.x - p1.x), p1.y + t * (p2.y - p1.y), true)  // always free (underconstrained along segment)
          placed.add(v)
          changed = true
        })
      }
    }
    if (changed) continue

    // ── 0 loci (fallback) ─────────────────────────────────────────────────────
    // 0a. Segment neighbor — shares a segment with a placed vertex but no known length.
    for (const v of model.points.keys()) {
      if (placed.has(v)) continue
      for (const p of placed) {
        if (model.segments.has(segKey(v, p))) {
          const anchor = getPoint(model, p)!
          setPoint(model, v, anchor.x + DEFAULT_LEN, anchor.y, true)
          placed.add(v)
          changed = true
          break
        }
      }
      if (changed) break
    }
    if (changed) continue

    // 0b. Isolated — no connection to any placed vertex.
    //     Seed one at a time so constraint propagation can reach its neighbors next round.
    for (const v of model.points.keys()) {
      if (placed.has(v)) continue
      // Stack isolated components vertically so they don't overlap each other or the main figure
      setPoint(model, v, 0, -(isolatedSeedIndex + 1) * DEFAULT_LEN * 2, true)
      isolatedSeedIndex++
      placed.add(v)
      changed = true
      break
    }
  }
}

function placedNeighborsWithDist(
  model: GeomModel,
  placed: Set<string>,
  v: string,
): Array<{ x: number; y: number; dist: number; free: boolean }> {
  const result: Array<{ x: number; y: number; dist: number; free: boolean }> = []
  for (const p of placed) {
    const dist = getLength(model, v, p)
    if (dist !== null) {
      const pt = getPoint(model, p)!
      result.push({ x: pt.x, y: pt.y, dist, free: pt.free })
    }
  }
  return result
}

// Line-line intersection. Returns null if lines are parallel or identical.
// Solves a₁x + b₁y + c₁ = 0, a₂x + b₂y + c₂ = 0 via Cramer's rule.
function lineIntersect(l1: GeomLine, l2: GeomLine): { x: number; y: number } | null {
  const det = l1.a * l2.b - l2.a * l1.b
  if (Math.abs(det) < 1e-10) return null
  return {
    x: (l1.b * l2.c - l2.b * l1.c) / det,
    y: (l2.a * l1.c - l1.a * l2.c) / det,
  }
}

// Two-circle intersection. Returns both solutions ordered CCW-first (solution 1
// is left-of-AB), then CW (solution 2). Returns [] if circles don't intersect.
function circleIntersectBoth(
  a: { x: number; y: number; dist: number },
  b: { x: number; y: number; dist: number },
): Array<{ x: number; y: number }> {
  const dx = b.x - a.x, dy = b.y - a.y
  const d = Math.sqrt(dx * dx + dy * dy)
  if (d < 1e-10) return []
  if (d > a.dist + b.dist + 1e-9) return []
  if (d < Math.abs(a.dist - b.dist) - 1e-9) return []

  const A  = (a.dist * a.dist - b.dist * b.dist + d * d) / (2 * d)
  const h  = Math.sqrt(Math.max(0, a.dist * a.dist - A * A))
  const mx = a.x + A * dx / d
  const my = a.y + A * dy / d

  const s1 = { x: mx - h * (dy / d), y: my + h * (dx / d) }  // CCW / left-of-AB
  const s2 = { x: mx + h * (dy / d), y: my - h * (dx / d) }  // CW  / right-of-AB

  // If tangent (h ≈ 0), only one unique solution
  if (h < 1e-9) return [s1]
  return [s1, s2]
}

// Circle-line intersection. Returns both solutions ordered higher-y-first
// (solution 1), or [] if circle doesn't reach the line.
function circleLineIntersectBoth(
  cx: number, cy: number, r: number,
  line: GeomLine,
): Array<{ x: number; y: number }> {
  const { a, b, c } = line
  const denom = a * a + b * b

  const fx = cx - a * (a * cx + b * cy + c) / denom
  const fy = cy - b * (a * cx + b * cy + c) / denom

  const dist = Math.sqrt((fx - cx) ** 2 + (fy - cy) ** 2)
  if (dist > r + 1e-9) return []

  const h = Math.sqrt(Math.max(0, r * r - dist * dist))
  const len = Math.sqrt(denom)
  const tx = -b / len, ty = a / len

  const p1 = { x: fx + h * tx, y: fy + h * ty }
  const p2 = { x: fx - h * tx, y: fy - h * ty }

  if (h < 1e-9) return [p1]  // tangent — one solution

  // Order: higher y first (solution 1); if equal, larger x first
  if (Math.abs(p1.y - p2.y) > 1e-9) return p1.y > p2.y ? [p1, p2] : [p2, p1]
  return p1.x > p2.x ? [p1, p2] : [p2, p1]
}

// ─── SceneGraph builder ───────────────────────────────────────────────────────

function buildSceneGraph(model: GeomModel): SceneGraph {
  const segments: SceneSegment[] = []
  const points: ScenePoint[] = []
  const lines: SceneLine[] = []

  for (const [name, ln] of model.lines) {
    lines.push({ a: ln.a, b: ln.b, c: ln.c, label: name })
  }

  // Collect all declared segments
  for (const key of model.segments) {
    const [v1, v2] = key.split(':') as [string, string]
    const p1 = getPoint(model, v1)
    const p2 = getPoint(model, v2)
    if (!p1 || !p2) continue

    const pt1HasMultiple = !!(p1.allSolutions)
    const pt2HasMultiple = !!(p2.allSolutions)

    if (pt1HasMultiple || pt2HasMultiple) {
      // Emit one segment per combination of solutions for ambiguous endpoints
      const sols1 = p1.allSolutions ?? [{ x: p1.x, y: p1.y }]
      const sols2 = p2.allSolutions ?? [{ x: p2.x, y: p2.y }]
      for (const s1 of sols1) {
        for (const s2 of sols2) {
          segments.push({ x1: s1.x, y1: s1.y, x2: s2.x, y2: s2.y, solutions: 'multiple', label: `${v1}${v2}` })
        }
      }
    } else {
      segments.push({
        x1: p1.x, y1: p1.y,
        x2: p2.x, y2: p2.y,
        solutions: segmentSolutions(model, v1, v2),
        label: `${v1}${v2}`,
      })
    }
  }

  // All points — emit one per solution when multiple exist
  for (const [key, pt] of model.points) {
    if (pt.allSolutions) {
      pt.allSolutions.forEach((s, i) => {
        points.push({ x: s.x, y: s.y, label: key, solutions: 'multiple', solutionIndex: i + 1 })
      })
    } else {
      points.push({ x: pt.x, y: pt.y, label: key, solutions: pt.free ? 'infinite' : 'one' })
    }
  }

  return { segments, points, arcs: [], annotations: [], lines }
}
