// ─── RuleBasedPick ────────────────────────────────────────────────────────────
// The rule-pile pick strategy. Each step call does ONE of:
//   1. Apply rule-anchor's gauge fixings, if it has anything new to place.
//   2. Place a single point/line by a locus rule.
//   3. Place a single point/line by a fallback rule.
//
// RuleBasedAnchor.plan() is still imported from geometric/anchor.ts (kept
// as-is for now — the rule-anchor body itself moves in step 7.3). The
// modelsEqual guard catches the "anchor already ran, no change" case so the
// outer loop knows to advance.
//
// The locus/fallback tail is owned by this pick. BudgetPick has its own copy
// — the two are free to diverge as BudgetPick learns to consume more
// symmetries directly.

import type { GeomModel } from '../geometric/model.js'
import { cloneModel, getPoint, setPoint, getLength, segKey } from '../geometric/model.js'
import {
  workingVal, isWorkingComplete, makePlacementState, PlacementState,
} from '../geometric/types.js'
import { isZero } from '../geometric/geom.js'
import { RuleBasedAnchor } from '../geometric/anchor.js'
import type { PickStrategy } from './interface.js'

const DEFAULT_LEN = 3

export class RuleBasedPick implements PickStrategy {
  private anchor = new RuleBasedAnchor()

  step(model: GeomModel): GeomModel | null {
    // 1. Rule-anchor's gauge fixings (T → R+S → line absorbing).
    const afterAnchor = this.anchor.plan(model)
    if (!modelsEqual(afterAnchor, model)) return afterAnchor

    // 2. Locus and 3. fallback rules. One placement at a time; the outer
    //    Solver loop re-enters propagate after each pick.
    const scratch = cloneModel(model)
    const st = makePlacementState(scratch)
    if (tryPlaceVertexByLocus(scratch, st))    return scratch
    if (tryCompleteLineByDefault(scratch, st)) return scratch
    if (tryPlaceVertexByFallback(scratch, st)) return scratch
    return null
  }
}

// ── Locus vertex placements ──────────────────────────────────────────────────
// One at a time — placing one vertex may give another vertex a second locus,
// promoting it to exact next iteration.

function tryPlaceVertexByLocus(model: GeomModel, st: PlacementState): boolean {
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

// ── Fallback vertex placements ───────────────────────────────────────────────

function tryPlaceVertexByFallback(model: GeomModel, st: PlacementState): boolean {
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

// ── Default line completion ──────────────────────────────────────────────────
// nullCount=3, 1 placed point → canonical direction (a=1, b=-1), solve c (dof=1)
// nullCount=1, no usable point → canonicalize the single null (c=0 / a=0 / b=1)
// nullCount=3, no placed points → canonicalize to y = x (a=1, b=-1, c=0)

function tryCompleteLineByDefault(model: GeomModel, st: PlacementState): boolean {
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
    const nullCount = (lv.a === null ? 1 : 0) + (lv.b === null ? 1 : 0) + (lv.c === null ? 1 : 0)
    const pts = placedOnLine.get(lineName) ?? []

    if (nullCount === 3) {
      if (pts.length > 0) {
        const p1 = pts[0]!
        lv.a = 1; lv.b = -1
        lv.c = -(p1.x - p1.y)
        if (wl.dof === 2) wl.dof = 1
      } else {
        lv.a = 1; lv.b = -1; lv.c = 0
      }
      return true
    }

    if (nullCount === 1) {
      if (lv.c === null) { lv.c = 0; return true }
      if (lv.a === null) {
        const rFree = rFreeIgnoring(model, lineName)
        lv.a = isZero(lv.b!) ? 1 : -lv.b!
        if (rFree) wl.dof = 0
        return true
      }
      if (lv.b === null) {
        const rFree = rFreeIgnoring(model, lineName)
        lv.b = isZero(lv.a!) ? 1 : -lv.a!
        if (rFree) wl.dof = 0
        return true
      }
    }
  }
  return false
}

/** True if rotation-gauge is still unconsumed, ignoring the given line. */
function rFreeIgnoring(model: GeomModel, exceptLineName: string): boolean {
  for (const [name, wl] of model.lines) {
    if (name === exceptLineName) continue
    const lv = workingVal(wl)
    if (lv.a !== null && lv.b !== null) return false
  }
  let placedCount = 0
  for (const wp of model.points.values()) {
    if (isWorkingComplete(wp)) {
      placedCount++
      if (placedCount >= 2) return false
    }
  }
  return true
}

// ── Helpers ──────────────────────────────────────────────────────────────────

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

/** True if `a` and `b` are equivalent in every field a pick can change. */
function modelsEqual(a: GeomModel, b: GeomModel): boolean {
  if (a.points.size !== b.points.size) return false
  for (const [k, wpA] of a.points) {
    const wpB = b.points.get(k)
    if (!wpB) return false
    if (wpA.dof !== wpB.dof) return false
    if (wpA.resolved.length !== wpB.resolved.length) return false
    for (let i = 0; i < wpA.resolved.length; i++) {
      const rA = wpA.resolved[i]!, rB = wpB.resolved[i]!
      if (rA.x !== rB.x || rA.y !== rB.y) return false
    }
  }

  if (a.lines.size !== b.lines.size) return false
  for (const [k, wlA] of a.lines) {
    const wlB = b.lines.get(k)
    if (!wlB) return false
    if (wlA.dof !== wlB.dof) return false
    if (wlA.resolved.length !== wlB.resolved.length) return false
    const lvA = workingVal(wlA), lvB = workingVal(wlB)
    if (lvA.a !== lvB.a || lvA.b !== lvB.b || lvA.c !== lvB.c) return false
  }

  if (a.lengths.size !== b.lengths.size) return false
  for (const [k, vA] of a.lengths) {
    if (b.lengths.get(k) !== vA) return false
  }

  return true
}
