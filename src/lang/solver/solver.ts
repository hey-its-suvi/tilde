// ─── Unified Solver ───────────────────────────────────────────────────────────
// One Solver class, two swappable strategies. Each iteration:
//   1. Propagate — apply all forced placements until quiescent.
//   2. Pick — place one element (gauge-justified or arbitrary).
// Loop until neither phase fires. Then extract a SolveResult.
//
// Both strategies are pure: they take a model, return a new model or null.
// All "state" (budget, placement set, headings, …) is derived from the model
// on entry to each `step` call — nothing persists across iterations.

import { SolverInterface, ConstraintSet, SolveResult } from './interface.js'
import { buildModel, extractResult } from './model-io.js'
import { PropagateStrategy } from './propagate/interface.js'
import { PickStrategy } from './pick/interface.js'

export class Solver implements SolverInterface {
  constructor(
    private propagate: PropagateStrategy,
    private pick: PickStrategy,
  ) {}

  solve(input: ConstraintSet): SolveResult {
    let model = buildModel(input)
    while (true) {
      const next = this.propagate.step(model) ?? this.pick.step(model)
      if (next === null) break
      model = next
    }
    return extractResult(model, input)
  }
}
