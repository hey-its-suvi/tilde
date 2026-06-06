// ─── Default line completion (locus/fallback) ────────────────────────────────
// The *arbitrary* (representative) line completion used by both PickStrategy
// implementations as a tail. The exact (forced) line rules have moved to
// propagate/geometric.ts.
//
// Slated to be inlined into each pick file in a follow-up commit; kept
// exported here meanwhile so both RuleBasedPick and BudgetPick can share
// without duplication during the transition.

import { GeomModel } from './model.js'
import { workingVal, isWorkingComplete, PlacementState } from './types.js'
import { isZero } from './geom.js'

// nullCount=3, 1 placed point → canonical direction (a=1, b=-1), solve c (dof=1)
// nullCount=1, no usable point → canonicalize the single null (c=0 / a=0 / b=1)
// nullCount=3, no placed points → canonicalize to y = x (a=1, b=-1, c=0)

export function tryCompleteLineByDefault(model: GeomModel, st: PlacementState): boolean {
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
