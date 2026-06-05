// ─── PickStrategy ─────────────────────────────────────────────────────────────
// The other half of the unified Solver loop. Places one element — either by
// consuming a still-free gauge (canonical placement, dof=0) or by an arbitrary
// representative choice (dof>0). Returns a new model on any change, or null
// when nothing more can be picked. Stateless: budget/state is derived from the
// model on entry to each `step` call.

import type { GeomModel } from '../geometric/model.js'

export interface PickStrategy {
  /** Place one element. Returns a new model if anything changed, else null.
   *  Must not mutate the input. */
  step(model: GeomModel): GeomModel | null
}
