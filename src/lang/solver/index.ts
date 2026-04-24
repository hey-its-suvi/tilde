// ─── Tilde Solver ─────────────────────────────────────────────────────────────
// Walks the AST, builds a GeomModel, places all points, outputs a SceneGraph.

export class ConstraintError extends Error {
  constructor(message: string) {
    super(`[Constraint] ${message}`)
  }
}

import { Program, ShapeDecl, LineDecl, PointDecl, Constraint, LengthUnit } from '../ast.js'
import { resolveLength } from '../units.js'
import {
  GeomModel, GeomLine, makeModel,
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
          if (c.kind === 'MeasureConstraint' && c.value.unit !== null) {
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
      const v = stmt.vertex
      const name = v.kind === 'ExplicitVertex' ? v.name : `${v.shape}_${v.i}`
      model.solutionPicks.set(name, stmt.index)
    }
  }

  // Pass 2: set anchor — first unconstrained free point in insertion order.
  // Skip points on lines/segments (their position is determined by that constraint,
  // not by being fixed at origin) and skip explicitly-placed points (free=false).
  if (model.anchorKey === null) {
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
  if (model.points.has(decl.name)) {
    throw new ConstraintError(`"${decl.name}" is already declared`)
  }
  setPoint(model, decl.name, decl.x, decl.y, false)
}

// ─── Shape registration ───────────────────────────────────────────────────────

function registerShape(model: GeomModel, decl: ShapeDecl) {
  const { shapeKind, name, named } = decl

  if (shapeKind === 'segment' && !named && name.length === 2) {
    const [v1, v2] = [name[0]!, name[1]!]
    touchPointChecked(model, v1)
    touchPointChecked(model, v2)
    model.segments.add(segKey(v1, v2))
  }

  if (shapeKind === 'triangle' && !named && name.length === 3) {
    const [v1, v2, v3] = [name[0]!, name[1]!, name[2]!]
    touchPointChecked(model, v1)
    touchPointChecked(model, v2)
    touchPointChecked(model, v3)
    model.segments.add(segKey(v1, v2))
    model.segments.add(segKey(v2, v3))
    model.segments.add(segKey(v3, v1))
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

// ─── Constraint application ───────────────────────────────────────────────────

function applyConstraint(model: GeomModel, c: Constraint) {
  if (c.kind === 'MeasureConstraint') {
    const { target, value } = c
    if (target.kind === 'ExplicitSegment') {
      touchPoint(model, target.v1)
      touchPoint(model, target.v2)
      setLength(model, target.v1, target.v2, resolveLength(value, model.activeUnit))
    }
    if (target.kind === 'ExplicitAngle') {
      touchPoint(model, target.v1)
      touchPoint(model, target.v2)
      touchPoint(model, target.v3)
      setAngle(model, target.v1, target.v2, target.v3, value.value)
    }
  }

  if (c.kind === 'OnConstraint') {
    touchPointChecked(model, c.point)
    if (model.lines.has(c.target)) {
      // target is a named line
      model.onLine.set(c.point, c.target)
    } else if (c.target.length === 2) {
      // target is a 2-char segment name (e.g. "ab")
      const v1 = c.target[0]!, v2 = c.target[1]!
      touchPointChecked(model, v1)
      touchPointChecked(model, v2)
      model.segments.add(segKey(v1, v2))
      model.onSegment.set(c.point, { v1, v2 })
    } else {
      throw new ConstraintError(`"${c.target}" is neither a declared line nor a 2-vertex segment`)
    }
  }
}

// ─── Vertex placement ─────────────────────────────────────────────────────────
// Vertex-centric fixpoint algorithm. Does not care about declaration order or
// shape type — only the constraint graph matters.

function placeVertices(model: GeomModel): void {
  const placed = new Set<string>()
  // Seed with anchor and any explicitly-placed points (free=false)
  for (const [k, pt] of model.points) {
    if (!pt.free) placed.add(k)
  }

  // Whether we've fixed the orientation (the first non-anchor vertex placed
  // with 1 known-dist neighbor defines the x-axis direction, and is considered
  // "solved" by convention rather than underconstrained).
  let orientationFixed = false

  // Heading for P2 placements. Starts pointing +x, rotates 90° CCW each time.
  // This prevents collinear degeneracy in cycles (e.g. a rhombus becomes a
  // square rather than a flat line).
  let hdX = 1, hdY = 0

  let changed = true
  let isolatedSeedIndex = 0  // counts how many isolated components we've seeded
  while (changed) {
    changed = false

    // Priority 1 — circle intersection: vertex has 2+ placed neighbors with known distances.
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

    // Priority 1b — circle-line: vertex is on a line AND has 1 placed neighbor with known distance.
    for (const v of model.points.keys()) {
      if (placed.has(v)) continue
      const lineName = model.onLine.get(v)
      if (!lineName) continue
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

    // Priority 2 — single known-dist neighbor: place using current heading.
    // The heading rotates 90° CCW after each placement to avoid collinear
    // degeneracy in cycles (e.g. rhombus → square instead of flat line).
    // The first placement fixes orientation (free=false); subsequent ones
    // are genuinely underconstrained in angle (free=true, shows wavy circle).
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

    // Priority 3 — on-line only: no distance neighbors yet. Place at the foot
    // of perpendicular from the anchor (or origin) to the line.
    for (const v of model.points.keys()) {
      if (placed.has(v)) continue
      const lineName = model.onLine.get(v)
      if (!lineName) continue
      const { a, b, c } = model.lines.get(lineName)!
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

    // Priority 3b — on-segment, both endpoints placed: distribute evenly along
    // the segment. t = (i+1)/(n+1) where n = total unplaced points on same seg.
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

    // Priority 4 — segment neighbor, no known dist: default length placeholder.
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

    // Priority 5 — completely isolated vertex (no connection to any placed vertex).
    // Seed one at a time so constraint propagation can resolve its neighbors next round.
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
