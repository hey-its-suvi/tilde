// ─── Tilde Solver — Point Placement ──────────────────────────────────────────
// All point placement functions for the resolution loop (pass 3).
// Functions are ordered by priority: exact (2) → locus (1) → fallback (0).

import { GeomModel, getPoint, setPoint, getLength, segKey } from './model.js'
import { workingVal, isWorkingComplete, PlacementState } from './types.js'
import { isZero, lineIntersect, circleIntersectBoth, circleLineIntersectBoth } from './geom.js'
import { ConstraintError } from './types.js'

// Default display length (units) when a segment's length is unknown
const DEFAULT_LEN = 3

// ── Priority 2: exact vertex placements ───────────────────────────────────────
// Each function is greedy — places every eligible vertex in one pass, returns
// true so the outer loop restarts and re-checks from the top.
// Line∩Line fires first because it needs no placed neighbours; the circle
// variants need 2 and 1 placed neighbours respectively.

// Vertex lies on 2+ fully-determined lines → place at their intersection.
export function tryPlaceVertexByLineIntersectLine(model: GeomModel, st: PlacementState): boolean {
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
export function tryPlaceVertexByCircleIntersectCircle(model: GeomModel, st: PlacementState): boolean {
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
export function tryPlaceVertexByCircleIntersectLine(model: GeomModel, st: PlacementState): boolean {
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

export function tryPlaceVertexByLocus(model: GeomModel, st: PlacementState): boolean {
  // 1a. Circle — exactly 1 placed neighbour with known distance, no other loci.
  //     Heading rotates 90° CCW after each use to prevent collinear degeneracy.
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

export function tryPlaceVertexByFallback(model: GeomModel, st: PlacementState): boolean {
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

// ── Internal helper ───────────────────────────────────────────────────────────

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
