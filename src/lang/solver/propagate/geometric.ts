// ─── GeometricPropagate (adapter) ─────────────────────────────────────────────
// Wraps the existing exact-rule try* functions from geometric/resolve.ts behind
// the PropagateStrategy interface. Clones the model on entry so the underlying
// mutating rules don't touch the caller's model.
//
// Only the exact (priority-2) rules live here. Locus and fallback rules are
// arbitrary picks and belong to PickStrategy.

import type { GeomModel } from '../geometric/model.js'
import { cloneModel } from '../geometric/model.js'
import { makePlacementState } from '../geometric/types.js'
import {
  tryPlaceVertexByLineIntersectLine,
  tryPlaceVertexByCircleIntersectCircle,
  tryPlaceVertexByCircleIntersectLine,
} from '../geometric/points.js'
import {
  tryCompleteLineByConstraint,
  tryApplyLineRelation,
} from '../geometric/lines.js'
import { tryResolveScalarBindings } from '../geometric/resolve.js'
import type { PropagateStrategy } from './interface.js'

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
