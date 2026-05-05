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
import { isWorkingComplete, PlacementState } from './types.js'
import {
  tryPlaceVertexByLineIntersectLine,
  tryPlaceVertexByCircleIntersectCircle,
  tryPlaceVertexByCircleIntersectLine,
  tryPlaceVertexByLocus,
  tryPlaceVertexByFallback,
} from './points.js'
import { tryCompleteLineByConstraint, tryCompleteLineByDefault, tryApplyLineRelation } from './lines.js'

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
    // Priority 1: locus
    if (tryPlaceVertexByLocus(model, st))                 { changed = true; continue }
    if (tryCompleteLineByDefault(model, st))              { changed = true; continue }
    // Priority 0: fallback
    if (tryPlaceVertexByFallback(model, st))              { changed = true; continue }
  }
}
