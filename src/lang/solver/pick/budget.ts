// ─── BudgetPick ───────────────────────────────────────────────────────────────
// Gauge-aware pick strategy. Each step:
//   1. Derive the current gauge budget from the model (which gauges are still
//      free, which are consumed by existing placements / known coefficients).
//   2. Try to place ONE element by claiming the gauges it needs:
//        - bare points: T-full (origin), or R+S (reference), or R-only (length)
//        - bare lines:  R + T-perp, or residual T-along  (added in step 5b)
//   3. If no claim is available, fall back to a single representative
//      placement (locus or fallback rule) — same as RuleBasedPick's tail.
//
// Critical: BudgetPick is stateless. The budget is derived fresh on every
// step call from the model alone. Nothing persists between calls.

import type { GeomModel } from '../geometric/model.js'
import { cloneModel, getPoint, setPoint, setLength, getLength, segKey } from '../geometric/model.js'
import {
  makePlacementState, workingVal, isWorkingComplete, PlacementState,
} from '../geometric/types.js'
import { isZero } from '../geometric/geom.js'
import { GaugeBudget } from '../geometric/budget-anchor.js'
import type { PickStrategy } from './interface.js'

const EPS = 1e-9
const DEFAULT_LEN = 3

// Canonical frame: where this pick sends gauge-justified placements.
const CANONICAL_X     = 0
const CANONICAL_Y     = 0
const CANONICAL_DIR_X = 1
const CANONICAL_DIR_Y = 0
const CANONICAL_SCALE = 1

export class BudgetPick implements PickStrategy {
  step(model: GeomModel): GeomModel | null {
    const budget = deriveBudget(model)

    // Gauge-justified placements.
    const pt = tryClaimBarePoint(model, budget)
    if (pt) return pt

    // (line claimant — added in step 5b)

    // Representative (arbitrary) placements — no gauge consumed.
    const scratch = cloneModel(model)
    const st = makePlacementState(scratch)
    if (tryPlaceVertexByLocus(scratch, st))    return scratch
    if (tryCompleteLineByDefault(scratch, st)) return scratch
    if (tryPlaceVertexByFallback(scratch, st)) return scratch
    return null
  }
}

// ── deriveBudget ──────────────────────────────────────────────────────────────
// Reads the current model and reconstructs which gauges have already been
// consumed. Replaces the lossy preDebit in budget-anchor.ts.
//
// Per-axis T claim trick: instead of claimTFull() for a pinned point (which
// fails silently if any T direction is already pinned), claim T-x and T-y
// separately. That way if a line already consumed T-perp, the residual
// T-along still gets debited correctly by the point lying on it.

export function deriveBudget(model: GeomModel): GaugeBudget {
  const b = new GaugeBudget()

  // Lines with known direction → R consumed; if c also known, T-perp consumed.
  for (const wl of model.lines.values()) {
    const lv = workingVal(wl)
    if (lv.a !== null && lv.b !== null) {
      b.claimR()
      if (lv.c !== null) {
        const n = Math.hypot(lv.a, lv.b)
        if (n > EPS) b.claimT({ dx: lv.a / n, dy: lv.b / n })
      }
    }
  }

  // Pinned points: per-axis T claims. Pairs of points also pin R and S.
  let pinnedCount = 0
  let firstPt: { x: number; y: number } | null = null
  for (const wp of model.points.values()) {
    if (!isWorkingComplete(wp)) continue
    const pv = workingVal(wp)
    b.claimT({ dx: 1, dy: 0 })
    b.claimT({ dx: 0, dy: 1 })
    pinnedCount++
    if (pinnedCount === 1) {
      firstPt = { x: pv.x!, y: pv.y! }
    } else if (pinnedCount === 2 && firstPt) {
      const dx = pv.x! - firstPt.x, dy = pv.y! - firstPt.y
      if (Math.hypot(dx, dy) > EPS) { b.claimR(); b.claimS() }
    }
  }

  // Any known length consumes S.
  for (const len of model.lengths.values()) {
    if (len !== null) { b.claimS(); break }
  }

  return b
}

// ── Bare point claimant ───────────────────────────────────────────────────────
// Places at most ONE bare point per call. Cascade matches the existing
// PointClaimant in budget-anchor.ts:
//   Case 1: T fully free                → pin at origin (claim T-full).
//   Case 2: T consumed, R + S free      → pin at canonical reference from a
//                                          pivot, synthesize unit-length
//                                          distance (claim R + S).
//   Case 3: T consumed, R free, S used,
//           known length from pivot     → pin along reference direction at
//                                          that length (claim R).
//   Otherwise                           → defer (resolve/locus handles it).

function tryClaimBarePoint(model: GeomModel, budget: GaugeBudget): GeomModel | null {
  for (const [k, wp] of model.points) {
    if (isWorkingComplete(wp)) continue
    if (model.onLine.has(k)) continue
    if (model.onSegment.has(k)) continue

    // Case 1: T-full free → origin.
    if (budget.tConsumedDim === 0) {
      budget.claimT({ dx: 1, dy: 0 })
      budget.claimT({ dx: 0, dy: 1 })
      const result = cloneModel(model)
      setPoint(result, k, CANONICAL_X, CANONICAL_Y, 0)
      return result
    }

    // T (at least partially) consumed. Need a pivot for R/S logic.
    const pivot = findFirstPlaced(model)
    if (pivot === null) continue

    const pivotAtOrigin = Math.hypot(pivot.x - CANONICAL_X, pivot.y - CANONICAL_Y) < EPS
    const refTargetX = pivotAtOrigin ? CANONICAL_X + CANONICAL_DIR_X * CANONICAL_SCALE : CANONICAL_X
    const refTargetY = pivotAtOrigin ? CANONICAL_Y + CANONICAL_DIR_Y * CANONICAL_SCALE : CANONICAL_Y
    const refDirX = refTargetX - pivot.x
    const refDirY = refTargetY - pivot.y
    const refDist = Math.hypot(refDirX, refDirY)
    if (refDist < EPS) continue

    // Case 2: R + S free → canonical reference, synthesize length.
    if (!budget.rConsumed && !budget.sConsumed) {
      budget.claimR()
      budget.claimS()
      const result = cloneModel(model)
      setPoint(result, k, refTargetX, refTargetY, 0)
      setLength(result, pivot.name, k, refDist)
      return result
    }

    // Case 3: R free, S consumed, length from pivot known → along ref direction.
    if (!budget.rConsumed && budget.sConsumed) {
      const knownLen = getLength(model, pivot.name, k)
      if (knownLen !== null) {
        budget.claimR()
        const dx = refDirX / refDist, dy = refDirY / refDist
        const result = cloneModel(model)
        setPoint(result, k, pivot.x + dx * knownLen, pivot.y + dy * knownLen, 0)
        return result
      }
    }

    // Otherwise: leave this point — try the next eligible one, or fall through.
  }
  return null
}

function findFirstPlaced(model: GeomModel): { name: string; x: number; y: number } | null {
  for (const [k, wp] of model.points) {
    if (!isWorkingComplete(wp)) continue
    const pv = workingVal(wp)
    return { name: k, x: pv.x!, y: pv.y! }
  }
  return null
}

// ── Representative tail ───────────────────────────────────────────────────────
// Locus and fallback rules used when no gauge claim is available. Owned by
// this pick — RuleBasedPick has its own copy. Free to diverge as BudgetPick
// learns to consume more symmetries directly (e.g. bare lines via R + T-perp,
// at which point tryCompleteLineByDefault here can drop its bare-line case).

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
