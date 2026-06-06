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
import { cloneModel, setPoint, setLength, getLength } from '../geometric/model.js'
import { makePlacementState, workingVal, isWorkingComplete } from '../geometric/types.js'
import {
  CANONICAL_X, CANONICAL_Y,
  CANONICAL_DIR_X, CANONICAL_DIR_Y, CANONICAL_SCALE,
} from '../geometric/anchor.js'
import { GaugeBudget } from '../geometric/budget-anchor.js'
import {
  tryPlaceVertexByLocus,
  tryPlaceVertexByFallback,
} from '../geometric/points.js'
import { tryCompleteLineByDefault } from '../geometric/lines.js'
import type { PickStrategy } from './interface.js'

const EPS = 1e-9

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
