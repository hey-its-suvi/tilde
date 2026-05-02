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
  GeomModel, RegisteredShape, makeModel,
  touchPoint, setPoint, getPoint,
  setLength, getLength, segKey,
  setAngle,
} from './model.js'
import {
  makeWorkingLine, workingVal, isWorkingComplete, isZero, isEqual,
} from './geom.js'
import { SceneGraph, SceneLine, SceneSegment, ScenePoint, RenderConfig, DEFAULT_CONFIG, Solutions } from '../../renderer/interface.js'

// Default display length (units) when a segment's length is unknown
const DEFAULT_LEN = 3

// ─── Canonical form constants ─────────────────────────────────────────────────
// These define the "standard position" that pass 2 normalises every floating
// scene into.  Change them here to shift the convention globally.
export const CANONICAL_X   = 0   // T fixer: anchor lands at this x
export const CANONICAL_Y   = 0   // T fixer: anchor lands at this y
export const CANONICAL_DIR_X = 1 // R fixer: reference point is placed in this direction from anchor
export const CANONICAL_DIR_Y = 0 //          (1,0) = +x axis; must be a unit vector
export const CANONICAL_SCALE = 1 // S fixer: canonical distance from anchor to reference point

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

  // Pass 2: DOF analysis + canonical form fixers
  // ─────────────────────────────────────────────
  // After pass 1, determine which global degrees of freedom are still unconstrained,
  // then apply the minimal canonical fixers to bring the scene into standard form.
  //
  // DOF detection rules:
  //   T (translation) free  — no point has explicit coords AND no line has a known position
  //   R (rotation) free     — no line AND at most 1 point has explicit coords
  //                           (2+ placed points define a direction → rotation fixed)
  //   S (scale) free        — no length constraint exists AND fewer than 2 points have explicit coords
  //                           (2+ placed points implicitly define a scale via their distance)
  //
  // Canonical fixers applied in order T → R+S:
  //   T      : pin first eligible free point to origin (0, 0)
  //   R + S  : find first free segment from anchor, set length = 1, pin far end to (1, 0)
  //   R only : find first free segment from anchor with known length L, pin far end to (L, 0)
  //   S only : find first segment between two free points with no length, set length = 1
  //
  // Winding (W) is always free and is handled in pass 3 (resolved at placement time).
  {
    let hasFullLine      = false  // all of a,b,c known — fixes T and R
    let hasDirectionLine = false  // a,b known (c may be null) — fixes R only
    for (const wl of model.lines.values()) {
      if (isWorkingComplete(wl)) { hasFullLine = true; hasDirectionLine = true; break }
      const v = workingVal(wl)
      if (v.a !== null && v.b !== null) hasDirectionLine = true
    }
    const fixedPts = [...model.points.entries()].filter(([, wp]) => isWorkingComplete(wp))
    const tFree    = fixedPts.length === 0 && !hasFullLine
    const rFree    = !hasDirectionLine && fixedPts.length <= 1
    const sFree    = [...model.lengths.values()].every(l => l === null) && fixedPts.length < 2

    // ── T fixer ──
    // Find eligible anchor: free point, not on-line, not on-segment.
    // If T is already fixed by exactly 1 explicit point, use it as the pivot for R.
    let anchor: string | null = null
    if (tFree) {
      for (const [k, wp] of model.points) {
        if (wp.dof > 0 && !model.onLine.has(k) && !model.onSegment.has(k)) {
          anchor = k
          break
        }
      }
      if (anchor !== null) {
        setPoint(model, anchor, CANONICAL_X, CANONICAL_Y, 0)
        model.anchorKey = anchor
      }
    } else if (rFree && fixedPts.length === 1) {
      // T fixed by 1 explicit point — use it as pivot for R fixer below
      anchor = fixedPts[0]![0]
    }

    // ── R + S fixers ──
    // Phase 1: prefer a segment directly connected to the anchor (same component).
    // Phase 2: if none found, use the first free segment in the model — since
    //          translation is already fixed and the segment is in a disconnected
    //          component, we can still use global rotation+scale to pin its first
    //          endpoint canonically (the anchor being a point doesn't constrain
    //          the orientation of an unconnected segment).
    if (anchor !== null && rFree) {
      const anchorWp  = model.points.get(anchor)!
      const anchorVal = workingVal(anchorWp)

      // The canonical reference target is whichever of {origin, (1,0)} is not the anchor:
      //   anchor at origin (T was free)     → reference goes to (1, 0)
      //   anchor not at origin (T was fixed) → reference goes to (0, 0)
      // This way a free point is always mapped to the origin via rotate+scale around the anchor,
      // which is geometrically natural: "translate anchor to origin, scale/rotate, translate back."
      const anchorAtOrigin = isEqual(anchorVal.x!, CANONICAL_X) &&
                             isEqual(anchorVal.y!, CANONICAL_Y)
      const refTargetX = anchorAtOrigin ? CANONICAL_X + CANONICAL_DIR_X * CANONICAL_SCALE : CANONICAL_X
      const refTargetY = anchorAtOrigin ? CANONICAL_Y + CANONICAL_DIR_Y * CANONICAL_SCALE : CANONICAL_Y
      const refDirX = refTargetX - anchorVal.x!
      const refDirY = refTargetY - anchorVal.y!
      const refDist = Math.sqrt(refDirX * refDirX + refDirY * refDirY)

      // Helper: attempt to fix R (and S if sFree) using a given point as reference.
      // Returns true if it successfully applied a fixer.
      const tryFix = (ref: string): boolean => {
        if (isZero(refDist)) return false  // anchor coincides with target — degenerate
        const refWp = model.points.get(ref)
        if (!refWp || refWp.dof === 0 || model.onLine.has(ref) || model.onSegment.has(ref)) return false
        const knownLen = getLength(model, anchor!, ref)
        if (sFree) {
          // Fix R + S: place ref at canonical target, set length = distance anchor→target
          setLength(model, anchor!, ref, refDist)
          setPoint(model, ref, refTargetX, refTargetY, 0)
          return true
        } else if (knownLen !== null) {
          // Fix R only: place ref along anchor→target direction at the known distance
          setPoint(model, ref, anchorVal.x! + (refDirX / refDist) * knownLen,
                               anchorVal.y! + (refDirY / refDist) * knownLen, 0)
          return true
        }
        return false
      }

      let fixed = false
      // Phase 1: anchor-adjacent segment
      for (const segK of model.segments) {
        const [v1, v2] = segK.split(':') as [string, string]
        const nbr = v1 === anchor ? v2 : v2 === anchor ? v1 : null
        if (nbr === null) continue
        if (tryFix(nbr)) { fixed = true; break }
      }
      // Phase 2: any free segment in the model (disconnected component)
      if (!fixed) {
        for (const segK of model.segments) {
          const [v1, v2] = segK.split(':') as [string, string]
          if (tryFix(v1)) { fixed = true; break }
          if (tryFix(v2)) { fixed = true; break }
        }
      }
      // Phase 3: any free eligible point — two free points always define a direction
      // and scale that can be normalized, even across disconnected components.
      if (!fixed) {
        for (const [k] of model.points) {
          if (k === anchor) continue
          if (tryFix(k)) { fixed = true; break }
        }
      }
    } else if (!rFree && sFree) {
      // R fixed, S free: set first unconstrained segment (between two free points) to length 1
      for (const [k] of model.lengths) {
        const [v1, v2] = k.split(':') as [string, string]
        const p1 = model.points.get(v1), p2 = model.points.get(v2)
        if ((p1?.dof ?? 0) > 0 && (p2?.dof ?? 0) > 0) {
          model.lengths.set(k, 1)
          break
        }
      }
    }
  }

  // Pass 3: resolve all geometry via constraint propagation
  resolve(model)

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
  model.lines.set(decl.name, makeWorkingLine(decl.a, decl.b, decl.c))
}

// ─── Point registration ───────────────────────────────────────────────────────

function registerPoint(model: GeomModel, decl: PointDecl) {
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

// ─── Geometry resolution ──────────────────────────────────────────────────────
// Unified fixpoint algorithm. Element types (vertices, lines, …) participate
// in the same priority-ordered loop so a line completion can immediately unlock
// an exact vertex intersection without doing a separate pass first.
//
// Priority order (higher always fires before lower, across all element types):
//   2  exact   — 2+ loci intersected  → finite solutions
//   1  locus   — 1 locus              → free (representative point chosen)
//   0  fallback — 0 loci              → structural guess, always free

type PlacementState = {
  placed:           Set<string>
  orientationFixed: boolean
  hdX:              number   // heading for 1-locus circle placements
  hdY:              number
  isolatedSeedIdx:  number
}

// ── Priority 2: exact vertex placements ───────────────────────────────────────
// Each function is greedy — places every eligible vertex in one pass, returns
// true so the outer loop restarts and re-checks from the top.
// Line∩Line fires first because it needs no placed neighbours; the circle
// variants need 2 and 1 placed neighbours respectively.

// Vertex lies on 2+ fully-determined lines → place at their intersection.
function tryPlaceVertexByLineIntersectLine(model: GeomModel, st: PlacementState): boolean {
  let any = false
  for (const v of model.points.keys()) {
    if (st.placed.has(v)) continue
    const lineNames = model.onLine.get(v)
    if (!lineNames || lineNames.length < 2) continue
    // All referenced lines must be fully determined before we can intersect them
    if (lineNames.some(n => !isWorkingComplete(model.lines.get(n)!))) continue
    const wl1 = model.lines.get(lineNames[0]!)!
    const wl2 = model.lines.get(lineNames[1]!)!
    const lv1 = workingVal(wl1), lv2 = workingVal(wl2)
    const pt = lineIntersect(
      { a: lv1.a!, b: lv1.b!, c: lv1.c! },
      { a: lv2.a!, b: lv2.b!, c: lv2.c! },
    )
    if (!pt) throw new ConstraintError(`no position for vertex ${v}: lines "${lineNames[0]}" and "${lineNames[1]}" are parallel`)
    for (let i = 2; i < lineNames.length; i++) {
      const wli = model.lines.get(lineNames[i]!)!
      const lvi = workingVal(wli)
      if (!isZero(lvi.a! * pt.x + lvi.b! * pt.y + lvi.c!))
        throw new ConstraintError(`no position for vertex ${v}: lines "${lineNames[0]}", "${lineNames[1]}", and "${lineNames[i]}" have no common point`)
    }
    setPoint(model, v, pt.x, pt.y, 0)
    st.placed.add(v)
    any = true
  }
  return any
}

// Vertex has 2+ placed neighbours with known distances → place at circle∩circle.
function tryPlaceVertexByCircleIntersectCircle(model: GeomModel, st: PlacementState): boolean {
  let any = false
  for (const v of model.points.keys()) {
    if (st.placed.has(v)) continue
    const nbrs = placedNeighborsWithDist(model, st.placed, v)
    if (nbrs.length < 2) continue
    const sols = circleIntersectBoth(nbrs[0]!, nbrs[1]!)
    if (sols.length === 0) throw new ConstraintError(`no position for vertex ${v}: distance constraints are inconsistent`)
    const inheritedDof = (nbrs[0]!.dof > 0 || nbrs[1]!.dof > 0) ? 1 : 0
    const pick = model.solutionPicks.get(v)
    const wp = model.points.get(v)!
    if (pick !== undefined && pick >= 1 && pick <= sols.length) {
      setPoint(model, v, sols[pick - 1]!.x, sols[pick - 1]!.y, inheritedDof)
    } else if (sols.length === 1) {
      setPoint(model, v, sols[0]!.x, sols[0]!.y, inheritedDof)
    } else {
      // Multiple discrete solutions — store all in resolved
      wp.resolved = sols.map(s => ({ x: s.x, y: s.y }))
      wp.dof = 0
    }
    st.placed.add(v)
    any = true
  }
  return any
}

// Vertex lies on exactly 1 fully-determined line AND has 1+ placed neighbours
// with known distances → place at circle∩line.
function tryPlaceVertexByCircleIntersectLine(model: GeomModel, st: PlacementState): boolean {
  let any = false
  for (const v of model.points.keys()) {
    if (st.placed.has(v)) continue
    const lineNames = model.onLine.get(v)
    if (!lineNames || lineNames.length !== 1) continue  // 2+ lines → LineIntersectLine
    const lineName = lineNames[0]!
    const wl = model.lines.get(lineName)!
    if (!isWorkingComplete(wl)) continue  // partial line — defer until resolved
    const nbrs = placedNeighborsWithDist(model, st.placed, v)
    if (nbrs.length < 1) continue
    const n = nbrs[0]!
    const lv = workingVal(wl)
    const sols = circleLineIntersectBoth(n.x, n.y, n.dist, { a: lv.a!, b: lv.b!, c: lv.c! })
    if (sols.length === 0) throw new ConstraintError(`no position for vertex ${v}: circle does not intersect line "${lineName}"`)
    const inheritedDof = n.dof > 0 ? 1 : 0
    const pick = model.solutionPicks.get(v)
    const wp = model.points.get(v)!
    if (pick !== undefined && pick >= 1 && pick <= sols.length) {
      setPoint(model, v, sols[pick - 1]!.x, sols[pick - 1]!.y, inheritedDof)
    } else if (sols.length === 1) {
      setPoint(model, v, sols[0]!.x, sols[0]!.y, inheritedDof)
    } else {
      // Multiple discrete solutions — store all in resolved
      wp.resolved = sols.map(s => ({ x: s.x, y: s.y }))
      wp.dof = 0
    }
    st.placed.add(v)
    any = true
  }
  return any
}

// ── Priority 1: locus vertex placements ───────────────────────────────────────
// One at a time — placing one vertex may give another vertex a second locus,
// promoting it to exact next iteration.

function tryPlaceVertexByLocus(model: GeomModel, st: PlacementState): boolean {
  // 1a. Circle — exactly 1 placed neighbour with known distance, no other loci.
  //     Heading rotates 90° CCW after each use to prevent colliisEqual degeneracy.
  for (const v of model.points.keys()) {
    if (st.placed.has(v)) continue
    const nbrs = placedNeighborsWithDist(model, st.placed, v)
    if (nbrs.length !== 1) continue
    const n = nbrs[0]!
    setPoint(model, v, n.x + n.dist * st.hdX, n.y + n.dist * st.hdY, st.orientationFixed ? 1 : 0)
    ;[st.hdX, st.hdY] = [-st.hdY, st.hdX]  // rotate 90° CCW
    st.orientationFixed = true
    st.placed.add(v)
    return true
  }

  // 1b. Line — on a named line, no distance neighbours yet.
  //     Place at foot of perpendicular from origin to the line.
  for (const v of model.points.keys()) {
    if (st.placed.has(v)) continue
    const lineNames = model.onLine.get(v)
    if (!lineNames || lineNames.length === 0) continue
    const wl = model.lines.get(lineNames[0]!)!
    if (!isWorkingComplete(wl)) continue  // partial line — defer until resolved
    const lv = workingVal(wl)
    const { a, b, c } = { a: lv.a!, b: lv.b!, c: lv.c! }
    const denom = a * a + b * b
    setPoint(model, v, -a * c / denom, -b * c / denom, 1)
    st.placed.add(v)
    return true
  }

  // 1c. Segment — on a segment, both endpoints already placed.
  //     Distribute evenly: t = (i+1)/(n+1) for the n unplaced points on the segment.
  const groups = new Map<string, string[]>()
  for (const v of model.points.keys()) {
    if (st.placed.has(v)) continue
    const seg = model.onSegment.get(v)
    if (!seg || !st.placed.has(seg.v1) || !st.placed.has(seg.v2)) continue
    const k = segKey(seg.v1, seg.v2)
    if (!groups.has(k)) groups.set(k, [])
    groups.get(k)!.push(v)
  }
  for (const [, pts] of groups) {
    const seg = model.onSegment.get(pts[0]!)!
    const wp1 = getPoint(model, seg.v1)!, wp2 = getPoint(model, seg.v2)!
    const pv1 = workingVal(wp1), pv2 = workingVal(wp2)
    pts.forEach((v, i) => {
      const t = (i + 1) / (pts.length + 1)
      setPoint(model, v, pv1.x! + t * (pv2.x! - pv1.x!), pv1.y! + t * (pv2.y! - pv1.y!), 1)
      st.placed.add(v)
    })
    return true
  }

  return false
}

// ── Priority 0: fallback vertex placements ────────────────────────────────────
// Last resort — only fires when no exact or locus placement is possible for
// any element type. One at a time.

function tryPlaceVertexByFallback(model: GeomModel, st: PlacementState): boolean {
  // 0a. Segment neighbour — shares a segment with a placed vertex but no known length.
  for (const v of model.points.keys()) {
    if (st.placed.has(v)) continue
    for (const p of st.placed) {
      if (model.segments.has(segKey(v, p))) {
        const pv = workingVal(getPoint(model, p)!)
        setPoint(model, v, pv.x! + DEFAULT_LEN, pv.y!, 1)
        st.placed.add(v)
        return true
      }
    }
  }

  // 0b. Isolated — no connection to any placed vertex.
  //     Stack vertically so disconnected components don't overlap.
  for (const v of model.points.keys()) {
    if (st.placed.has(v)) continue
    setPoint(model, v, 0, -(st.isolatedSeedIdx + 1) * DEFAULT_LEN * 2, 1)
    st.isolatedSeedIdx++
    st.placed.add(v)
    return true
  }

  return false
}

// ── Priority 2: exact line completions ────────────────────────────────────────
// A line with exactly one null coefficient can be completed when a placed vertex
// on that line provides the missing value.  Only fires for nullCount === 1.

function tryCompleteLineByConstraint(model: GeomModel, st: PlacementState): boolean {
  for (const [lineName, wl] of model.lines) {
    if (isWorkingComplete(wl)) continue
    const lv = workingVal(wl)
    const nullCount = (lv.a === null ? 1 : 0) + (lv.b === null ? 1 : 0) + (lv.c === null ? 1 : 0)
    if (nullCount !== 1) continue

    // Find a placed vertex on this line to solve the remaining null
    for (const [v, lineNames] of model.onLine) {
      if (!st.placed.has(v)) continue
      if (!lineNames.includes(lineName)) continue
      const pv = workingVal(model.points.get(v)!)
      const pt = { x: pv.x!, y: pv.y! }

      if (lv.c === null) {
        lv.c = -(lv.a! * pt.x + lv.b! * pt.y)
        wl.dof = 0
        return true
      }
      if (lv.a === null) {
        if (isZero(pt.x)) continue
        lv.a = -(lv.b! * pt.y + lv.c!) / pt.x
        wl.dof = 0
        return true
      }
      if (lv.b === null) {
        if (isZero(pt.y)) continue
        lv.b = -(lv.a! * pt.x + lv.c!) / pt.y
        wl.dof = 0
        return true
      }
    }
  }
  return false
}

// ── Priority 1: default line completions ──────────────────────────────────────
// Partial line with no placed vertex available to constrain it — assign
// canonical defaults so the line is usable for vertex placement.
//   c unknown  →  c = 0  (line passes through origin)
//   a unknown  →  a = 0  (horizontal — least opinionated slope)
//   b unknown  →  b = 1  (avoid b=0 which would be degenerate for perpendicular foot)
// dof is intentionally NOT decremented — the position was chosen canonically,
// not by constraint, so the line remains underconstrained (dof > 0) in the output.

function tryCompleteLineByDefault(model: GeomModel, _st: PlacementState): boolean {
  for (const [, wl] of model.lines) {
    if (isWorkingComplete(wl)) continue
    const lv = workingVal(wl)
    if (lv.c === null) { lv.c = 0; return true }
    if (lv.a === null) { lv.a = 0; return true }
    if (lv.b === null) { lv.b = 1; return true }
  }
  return false
}

// ── Main resolution loop ───────────────────────────────────────────────────────

function resolve(model: GeomModel): void {
  const placed = new Set<string>()
  for (const [k, wp] of model.points) {
    if (isWorkingComplete(wp)) placed.add(k)
  }

  const explicitlyPlaced = placed.size - (model.anchorKey !== null ? 1 : 0)
  const orientationFixed  = explicitlyPlaced > 0

  const st: PlacementState = {
    placed,
    orientationFixed,
    hdX: orientationFixed ? 0 : 1,
    hdY: orientationFixed ? 1 : 0,
    isolatedSeedIdx: 0,
  }

  let changed = true
  while (changed) {
    changed = false
    // Priority 2: exact
    if (tryPlaceVertexByLineIntersectLine(model, st))     { changed = true; continue }
    if (tryPlaceVertexByCircleIntersectCircle(model, st)) { changed = true; continue }
    if (tryPlaceVertexByCircleIntersectLine(model, st))   { changed = true; continue }
    if (tryCompleteLineByConstraint(model, st))           { changed = true; continue }
    // Priority 1: locus
    if (tryPlaceVertexByLocus(model, st))                 { changed = true; continue }
    if (tryCompleteLineByDefault(model, st))              { changed = true; continue }
    // Priority 0: fallback
    if (tryPlaceVertexByFallback(model, st))     { changed = true; continue }
  }
}

function placedNeighborsWithDist(
  model: GeomModel,
  placed: Set<string>,
  v: string,
): Array<{ x: number; y: number; dist: number; dof: number }> {
  const result: Array<{ x: number; y: number; dist: number; dof: number }> = []
  for (const p of placed) {
    const dist = getLength(model, v, p)
    if (dist !== null) {
      const wp = getPoint(model, p)!
      const pv = workingVal(wp)
      result.push({ x: pv.x!, y: pv.y!, dist, dof: wp.dof })
    }
  }
  return result
}

// Line-line intersection. Returns null if lines are parallel or identical.
// Solves a₁x + b₁y + c₁ = 0, a₂x + b₂y + c₂ = 0 via Cramer's rule.
function lineIntersect(
  l1: { a: number; b: number; c: number },
  l2: { a: number; b: number; c: number },
): { x: number; y: number } | null {
  const det = l1.a * l2.b - l2.a * l1.b
  if (isZero(det)) return null
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
  if (isZero(d)) return []
  if (d > a.dist + b.dist + 1e-9) return []
  if (d < Math.abs(a.dist - b.dist) - 1e-9) return []

  const A  = (a.dist * a.dist - b.dist * b.dist + d * d) / (2 * d)
  const h  = Math.sqrt(Math.max(0, a.dist * a.dist - A * A))
  const mx = a.x + A * dx / d
  const my = a.y + A * dy / d

  const s1 = { x: mx - h * (dy / d), y: my + h * (dx / d) }  // CCW / left-of-AB
  const s2 = { x: mx + h * (dy / d), y: my - h * (dx / d) }  // CW  / right-of-AB

  // If tangent (h ≈ 0), only one unique solution
  if (isZero(h)) return [s1]
  return [s1, s2]
}

// Circle-line intersection. Returns both solutions ordered higher-y-first
// (solution 1), or [] if circle doesn't reach the line.
function circleLineIntersectBoth(
  cx: number, cy: number, r: number,
  line: { a: number; b: number; c: number },
): Array<{ x: number; y: number }> {
  const { a, b, c } = line
  const denom = a * a + b * b

  const fx = cx - a * (a * cx + b * cy + c) / denom
  const fy = cy - b * (a * cx + b * cy + c) / denom

  const dist = Math.sqrt((fx - cx) ** 2 + (fy - cy) ** 2)
  if (dist > r + 1e-9) return []  // circle doesn't reach line

  const h = Math.sqrt(Math.max(0, r * r - dist * dist))
  const len = Math.sqrt(denom)
  const tx = -b / len, ty = a / len

  const p1 = { x: fx + h * tx, y: fy + h * ty }
  const p2 = { x: fx - h * tx, y: fy - h * ty }

  if (isZero(h)) return [p1]  // tangent — one solution

  // Order: higher y first (solution 1); if equal, larger x first
  if (!isEqual(p1.y, p2.y)) return p1.y > p2.y ? [p1, p2] : [p2, p1]
  return p1.x > p2.x ? [p1, p2] : [p2, p1]
}

// ─── SceneGraph builder ───────────────────────────────────────────────────────

function segmentSolutions(model: GeomModel, v1: string, v2: string): Solutions {
  const p1 = model.points.get(v1)
  const p2 = model.points.get(v2)
  if (p1 && p1.dof === 0 && p2 && p2.dof === 0) return 'one'
  return getLength(model, v1, v2) !== null ? 'one' : 'infinite'
}

function buildSceneGraph(model: GeomModel): SceneGraph {
  const segments: SceneSegment[] = []
  const points: ScenePoint[] = []
  const lines: SceneLine[] = []

  for (const [name, wl] of model.lines) {
    if (isWorkingComplete(wl)) {
      const lv = workingVal(wl)
      lines.push({ a: lv.a!, b: lv.b!, c: lv.c!, label: name, solutions: wl.dof === 0 ? 'one' : 'infinite' })
    }
  }

  // Collect all declared segments
  for (const key of model.segments) {
    const [v1, v2] = key.split(':') as [string, string]
    const wp1 = getPoint(model, v1)
    const wp2 = getPoint(model, v2)
    if (!wp1 || !wp2) continue

    const pt1HasMultiple = wp1.resolved.length > 1
    const pt2HasMultiple = wp2.resolved.length > 1

    if (pt1HasMultiple || pt2HasMultiple) {
      // Emit one segment per combination of solutions for ambiguous endpoints
      const sols1 = pt1HasMultiple ? wp1.resolved : [workingVal(wp1)]
      const sols2 = pt2HasMultiple ? wp2.resolved : [workingVal(wp2)]
      for (const s1 of sols1) {
        for (const s2 of sols2) {
          segments.push({ x1: s1.x!, y1: s1.y!, x2: s2.x!, y2: s2.y!, solutions: 'multiple', label: `${v1}${v2}` })
        }
      }
    } else {
      const pv1 = workingVal(wp1), pv2 = workingVal(wp2)
      segments.push({
        x1: pv1.x!, y1: pv1.y!,
        x2: pv2.x!, y2: pv2.y!,
        solutions: segmentSolutions(model, v1, v2),
        label: `${v1}${v2}`,
      })
    }
  }

  // All points — emit one per solution when multiple exist
  for (const [key, wp] of model.points) {
    if (wp.resolved.length > 1) {
      wp.resolved.forEach((s, i) => {
        points.push({ x: s.x!, y: s.y!, label: key, solutions: 'multiple', solutionIndex: i + 1 })
      })
    } else {
      const pv = workingVal(wp)
      points.push({ x: pv.x!, y: pv.y!, label: key, solutions: wp.dof > 0 ? 'infinite' : 'one' })
    }
  }

  return { segments, points, arcs: [], annotations: [], lines }
}
