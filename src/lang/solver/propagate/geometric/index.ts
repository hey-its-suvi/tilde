// ─── GeometricPropagate ───────────────────────────────────────────────────────
// Applies all forced (exact) placements. A placement is "forced" when the
// constraints uniquely determine the element — no canonical choice, no
// representative pick. Each step call clones the input model, runs the rules
// to quiescence, and returns the new model (or null if nothing fired).
//
// Rule priority (higher fires before lower):
//   line∩line vertex   — point on 2+ known lines
//   circle∩circle      — 2 distance neighbours
//   circle∩line        — 1 distance neighbour + 1 known line
//   line completion    — line with 1+ placed on-line points
//   line relation      — direction copy via parallel/perpendicular
//   scalar binding     — element.field → scalar
//
// Locus and fallback rules (point on a line with no other info, isolated
// fallback, default canonical line direction) are arbitrary placements and
// belong to PickStrategy, not here.

import type { GeomModel } from '../../model.js'
import { cloneModel, getPoint, setPoint, getLength } from '../../model.js'
import {
  workingVal, isWorkingComplete, makePlacementState, PlacementState,
} from '../../types.js'
import { isZero, isEqual } from '../../geom.js'
import { lineIntersect, circleIntersectBoth, circleLineIntersectBoth } from './intersections.js'
import { ConstraintError } from '../../interface.js'
import type { PropagateStrategy } from '../interface.js'

export class GeometricPropagate implements PropagateStrategy {
  step(model: GeomModel): GeomModel | null {
    const scratch = cloneModel(model)
    const st = makePlacementState(scratch)
    let changed = false
    while (true) {
      if (tryApplyLineRelation(scratch))                      { changed = true; continue }
      if (tryPlaceVertexByLineIntersectLine(scratch, st))     { changed = true; continue }
      if (tryPlaceVertexByCircleIntersectCircle(scratch, st)) { changed = true; continue }
      if (tryPlaceVertexByCircleIntersectLine(scratch, st))   { changed = true; continue }
      if (tryCompleteLineByConstraint(scratch, st))           { changed = true; continue }
      if (tryResolveScalarBindings(scratch))                  { changed = true; continue }
      break
    }
    return changed ? scratch : null
  }
}

// ── Exact vertex placements ──────────────────────────────────────────────────

// Vertex lies on 2+ fully-determined lines → place at their intersection.
function tryPlaceVertexByLineIntersectLine(model: GeomModel, st: PlacementState): boolean {
  let any = false
  for (const v of model.points.keys()) {
    if (st.placed.has(v)) continue
    const lineNames = model.onLine.get(v)
    if (!lineNames || lineNames.length < 2) continue
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
      wp.resolved = sols.map(s => ({ x: s.x, y: s.y }))
      wp.dof = 0
    }
    st.placed.add(v)
    any = true
  }
  return any
}

// Vertex on exactly 1 fully-determined line + 1+ placed neighbours with known
// distances → place at circle∩line.
function tryPlaceVertexByCircleIntersectLine(model: GeomModel, st: PlacementState): boolean {
  let any = false
  for (const v of model.points.keys()) {
    if (st.placed.has(v)) continue
    const lineNames = model.onLine.get(v)
    if (!lineNames || lineNames.length !== 1) continue
    const lineName = lineNames[0]!
    const wl = model.lines.get(lineName)!
    if (!isWorkingComplete(wl)) continue
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
      wp.resolved = sols.map(s => ({ x: s.x, y: s.y }))
      wp.dof = 0
    }
    st.placed.add(v)
    any = true
  }
  return any
}

// ── Exact line placements ────────────────────────────────────────────────────

// Line with placed on-line points → solve for unknown coefficients.
function tryCompleteLineByConstraint(model: GeomModel, st: PlacementState): boolean {
  const placedOnLine = new Map<string, Array<{ x: number; y: number }>>()
  for (const [v, lineNames] of model.onLine) {
    if (!st.placed.has(v)) continue
    const pv = workingVal(model.points.get(v)!)
    for (const ln of lineNames) {
      if (!placedOnLine.has(ln)) placedOnLine.set(ln, [])
      placedOnLine.get(ln)!.push({ x: pv.x!, y: pv.y! })
    }
  }

  for (const [lineName, wl] of model.lines) {
    if (isWorkingComplete(wl)) continue
    const lv = workingVal(wl)
    const pts = placedOnLine.get(lineName) ?? []
    if (pts.length === 0) continue

    const nullCount = (lv.a === null ? 1 : 0) + (lv.b === null ? 1 : 0) + (lv.c === null ? 1 : 0)
    const p1 = pts[0]!

    const verify = (a: number, b: number, c: number) => {
      for (const pt of pts) {
        if (!isZero(a * pt.x + b * pt.y + c))
          throw new ConstraintError(`line "${lineName}": point (${pt.x}, ${pt.y}) is inconsistent`)
      }
    }

    if (nullCount >= 2) {
      const p2 = pts.find(p => !isEqual(p.x, p1.x) || !isEqual(p.y, p1.y))
      if (!p2) continue
      let a = p2.y - p1.y
      let b = p1.x - p2.x
      let c = -(a * p1.x + b * p1.y)
      if (lv.a !== null && !isZero(a)) { const s = lv.a / a; a = lv.a; b *= s; c *= s }
      else if (lv.b !== null && !isZero(b)) { const s = lv.b / b; a *= s; b = lv.b; c *= s }
      else if (lv.c !== null && !isZero(c)) { const s = lv.c / c; a *= s; b *= s; c = lv.c }
      verify(a, b, c)
      lv.a = a; lv.b = b; lv.c = c
      wl.dof = 0
      return true
    }

    if (nullCount === 1) {
      if (lv.c === null) {
        const c = -(lv.a! * p1.x + lv.b! * p1.y)
        verify(lv.a!, lv.b!, c)
        lv.c = c; wl.dof = 0; return true
      }
      if (lv.a === null) {
        const pt = pts.find(p => !isZero(p.x))
        if (!pt) continue
        const a = -(lv.b! * pt.y + lv.c!) / pt.x
        verify(a, lv.b!, lv.c!)
        lv.a = a; wl.dof = 0; return true
      }
      if (lv.b === null) {
        const pt = pts.find(p => !isZero(p.y))
        if (!pt) continue
        const b = -(lv.a! * pt.x + lv.c!) / pt.y
        verify(lv.a!, b, lv.c!)
        lv.b = b; wl.dof = 0; return true
      }
    }
  }
  return false
}

// Direction propagation from parallel/perpendicular partners. After direction
// is known, tryCompleteLineByConstraint handles c. For parallel-at-distance:
// once the partner is fully resolved, computes two c values (dof=0).
function tryApplyLineRelation(model: GeomModel): boolean {
  for (const [lineName, wl] of model.lines) {
    if (isWorkingComplete(wl)) continue
    const lv = workingVal(wl)
    const directionKnown = lv.a !== null && lv.b !== null

    for (const { other, distance } of (model.lineParallel.get(lineName) ?? [])) {
      const wl2 = model.lines.get(other)
      if (!wl2) continue
      const lv2 = workingVal(wl2)
      if (lv2.a === null || lv2.b === null) continue

      if (!directionKnown) {
        lv.a = lv2.a; lv.b = lv2.b
        return true
      }

      if (distance !== undefined && lv.c === null && lv2.c !== null) {
        const norm = Math.sqrt(lv.a! * lv.a! + lv.b! * lv.b!)
        const delta = distance * norm
        lv.c = lv2.c + delta
        wl.dof = 0
        wl.resolved.push({ a: lv.a!, b: lv.b!, c: lv2.c - delta })
        return true
      }
    }

    if (!directionKnown) {
      for (const other of (model.linePerpendicular.get(lineName) ?? [])) {
        const wl2 = model.lines.get(other)
        if (!wl2) continue
        const lv2 = workingVal(wl2)
        if (lv2.a === null || lv2.b === null) continue
        lv.a = lv2.b; lv.b = -lv2.a
        return true
      }
    }
  }
  return false
}

// ── Scalar bindings ──────────────────────────────────────────────────────────
// scalar = element.field — propagate from a resolved element to its scalar.

function tryResolveScalarBindings(model: GeomModel): boolean {
  for (const binding of model.scalarBindings) {
    const ws = model.scalars.get(binding.scalar)
    if (!ws || ws.resolved[0] !== null) continue

    const wl = model.lines.get(binding.element)
    if (wl && isWorkingComplete(wl)) {
      const lv = workingVal(wl)
      const val = (lv as Record<string, number | null>)[binding.field]
      if (val !== null && val !== undefined) {
        ws.resolved[0] = val
        ws.dof = 0
        return true
      }
    }

    const wp = model.points.get(binding.element)
    if (wp && isWorkingComplete(wp)) {
      const pv = workingVal(wp)
      const val = (pv as Record<string, number | null>)[binding.field]
      if (val !== null && val !== undefined) {
        ws.resolved[0] = val
        ws.dof = 0
        return true
      }
    }
  }
  return false
}

// ── Helper ────────────────────────────────────────────────────────────────────

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

