// ─── PropagateStrategy ────────────────────────────────────────────────────────
// One half of the unified Solver loop. Applies forced placements — those that
// follow uniquely from the model's current constraints. Returns a new model on
// any change, or null when nothing fires. Stateless: any "state" is derived
// from the model on entry to each `step` call.

import type { GeomModel } from '../model.js'

export interface PropagateStrategy {
  /** Apply one or more forced placements. Returns a new model if anything
   *  changed, else null. Must not mutate the input. */
  step(model: GeomModel): GeomModel | null
}
