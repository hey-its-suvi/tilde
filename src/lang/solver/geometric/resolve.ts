// ─── Tilde Solver — Resolution Loop (Pass 3) ─────────────────────────────────
// Unified fixpoint algorithm. Element types (vertices, lines, …) participate
// in the same priority-ordered loop so a line completion can immediately unlock
// an exact vertex intersection without doing a separate pass first.
//
// Priority order (higher always fires before lower, across all element types):
//   2  exact    — 2+ loci intersected  → finite solutions
//   1  locus    — 1 locus              → free (representative point chosen)
//   0  fallback — 0 loci               → structural guess, always free

import { GeomModel } from './model.js'
import { isWorkingComplete, workingVal, PlacementState } from './types.js'
import {
  tryPlaceVertexByLineIntersectLine,
  tryPlaceVertexByCircleIntersectCircle,
  tryPlaceVertexByCircleIntersectLine,
  tryPlaceVertexByLocus,
  tryPlaceVertexByFallback,
} from './points.js'
import { tryCompleteLineByConstraint, tryCompleteLineByDefault, tryApplyLineRelation } from './lines.js'
import { tryCompleteCircleByConstraint, tryCompleteCircleByDefault } from './circles.js'

export function resolve(model: GeomModel): void {
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
    if (tryApplyLineRelation(model))                      { changed = true; continue }
    if (tryPlaceVertexByLineIntersectLine(model, st))     { changed = true; continue }
    if (tryPlaceVertexByCircleIntersectCircle(model, st)) { changed = true; continue }
    if (tryPlaceVertexByCircleIntersectLine(model, st))   { changed = true; continue }
    if (tryCompleteLineByConstraint(model, st))           { changed = true; continue }
    if (tryCompleteCircleByConstraint(model, st))         { changed = true; continue }
    // Priority 1: locus
    if (tryPlaceVertexByLocus(model, st))                 { changed = true; continue }
    if (tryCompleteLineByDefault(model, st))              { changed = true; continue }
    if (tryCompleteCircleByDefault(model, st))            { changed = true; continue }
    // Priority 0: fallback
    if (tryPlaceVertexByFallback(model, st))              { changed = true; continue }
    // Scalar bindings: propagate element fields → scalars
    if (tryResolveScalarBindings(model))                  { changed = true; continue }
  }
}

function tryResolveScalarBindings(model: GeomModel): boolean {
  for (const binding of model.scalarBindings) {
    const ws = model.scalars.get(binding.scalar)
    if (!ws || ws.resolved[0] !== null) continue

    // Try to extract the field from the bound element
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

    const wc = model.circles.get(binding.element)
    if (wc) {
      const cv = workingVal(wc)
      const val = (cv as Record<string, number | string | null>)[binding.field]
      if (typeof val === 'number') {
        ws.resolved[0] = val
        ws.dof = 0
        return true
      }
    }
  }
  return false
}
