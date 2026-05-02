// ─── Tilde Solver — Line Completion ──────────────────────────────────────────
// Line completion functions for the resolution loop (pass 3).

import { GeomModel } from './model.js'
import { workingVal, isWorkingComplete, PlacementState } from './types.js'
import { isZero } from './geom.js'

// ── Priority 2: exact line completions ────────────────────────────────────────
// A line with exactly one null coefficient can be completed when a placed vertex
// on that line provides the missing value.  Only fires for nullCount === 1.

export function tryCompleteLineByConstraint(model: GeomModel, st: PlacementState): boolean {
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

export function tryCompleteLineByDefault(model: GeomModel, _st: PlacementState): boolean {
  for (const [, wl] of model.lines) {
    if (isWorkingComplete(wl)) continue
    const lv = workingVal(wl)
    if (lv.c === null) { lv.c = 0; return true }
    if (lv.a === null) { lv.a = 0; return true }
    if (lv.b === null) { lv.b = 1; return true }
  }
  return false
}
