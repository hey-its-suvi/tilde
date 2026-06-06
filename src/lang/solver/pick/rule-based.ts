// ─── RuleBasedPick (adapter) ──────────────────────────────────────────────────
// Wraps the existing RuleBasedAnchor.plan() + the locus/fallback try* rules
// behind the PickStrategy interface. Each step call does ONE of:
//   1. Apply rule-anchor's gauge fixings, if it has anything new to place.
//   2. Place a single point/line by a locus rule.
//   3. Place a single point/line by a fallback rule.
// In that priority order. Returns null when nothing fires.
//
// RuleBasedAnchor.plan() is monolithic (it does all gauge fixings in one call),
// so once the anchor has run on a given model state subsequent calls are
// no-ops. modelsEqual detects that no-op case.

import type { GeomModel } from '../geometric/model.js'
import { cloneModel } from '../geometric/model.js'
import { makePlacementState, workingVal } from '../geometric/types.js'
import { RuleBasedAnchor } from '../geometric/anchor.js'
import {
  tryPlaceVertexByLocus,
  tryPlaceVertexByFallback,
} from '../geometric/points.js'
import { tryCompleteLineByDefault } from '../geometric/lines.js'
import type { PickStrategy } from './interface.js'

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

/** True if `a` and `b` are equivalent in every field a pick can change.
 *  Compares point coordinates + dof, line coefficients + dof, and lengths.
 *  Doesn't compare onLine/onSegment/parallel/etc. — those are inputs to the
 *  pick, not outputs. */
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
