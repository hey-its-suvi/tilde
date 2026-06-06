// ─── Locus & fallback vertex placements ──────────────────────────────────────
// These are the *arbitrary* (representative) vertex placements used by both
// PickStrategy implementations as a tail when no canonical gauge can be
// claimed. The exact (forced) vertex rules have moved to
// propagate/geometric.ts.
//
// Slated to be inlined into each pick file in a follow-up commit (per the
// "each pick owns its tail" decision); kept exported here meanwhile so both
// RuleBasedPick and BudgetPick can share without duplication during the
// transition.

import { GeomModel, getPoint, setPoint, getLength, segKey } from './model.js'
import { workingVal, PlacementState } from './types.js'

const DEFAULT_LEN = 3

// ── Locus placements ─────────────────────────────────────────────────────────
// One at a time — placing one vertex may give another vertex a second locus,
// promoting it to exact next iteration.

export function tryPlaceVertexByLocus(model: GeomModel, st: PlacementState): boolean {
  // Circle — exactly 1 placed neighbour with known distance.
  for (const v of model.points.keys()) {
    if (st.placed.has(v)) continue
    const nbrs = placedNeighborsWithDist(model, st.placed, v)
    if (nbrs.length !== 1) continue
    const n = nbrs[0]!
    setPoint(model, v, n.x + n.dist * st.hdX, n.y + n.dist * st.hdY, 1)
    ;[st.hdX, st.hdY] = [-st.hdY, st.hdX]
    st.placed.add(v)
    return true
  }

  // Line — on a named line, no distance neighbours yet.
  for (const v of model.points.keys()) {
    if (st.placed.has(v)) continue
    const lineNames = model.onLine.get(v)
    if (!lineNames || lineNames.length === 0) continue
    const wl = model.lines.get(lineNames[0]!)!
    const lv = workingVal(wl)
    if (lv.a === null || lv.b === null || lv.c === null) continue
    const { a, b, c } = { a: lv.a, b: lv.b, c: lv.c }
    const denom = a * a + b * b
    setPoint(model, v, -a * c / denom, -b * c / denom, 1)
    st.placed.add(v)
    return true
  }

  // Segment — on a segment, both endpoints already placed. Distribute evenly.
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

// ── Fallback placements ──────────────────────────────────────────────────────
// Last resort — only fires when no exact or locus placement is possible for
// any element type. One at a time.

export function tryPlaceVertexByFallback(model: GeomModel, st: PlacementState): boolean {
  // Segment neighbour — shares a segment with a placed vertex but no known length.
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

  // Isolated — no connection to any placed vertex. Stack vertically.
  for (const v of model.points.keys()) {
    if (st.placed.has(v)) continue
    setPoint(model, v, 0, -(st.isolatedSeedIdx + 1) * DEFAULT_LEN * 2, 1)
    st.isolatedSeedIdx++
    st.placed.add(v)
    return true
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
