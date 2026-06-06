// ─── Geometric Solver (legacy) ────────────────────────────────────────────────
// The original anchor + resolve solver. Kept around during the path-b
// migration so the new loop-based Solver can be A/B-tested against it.
// Slated for deletion in step 6 of the migration plan.

import { SolverInterface, ConstraintSet, SolveResult } from '../interface.js'
import { buildModel, extractResult } from '../model-io.js'
import { AnchorStrategy, RuleBasedAnchor } from './anchor.js'
import { resolve } from './resolve.js'

export class GeometricSolver implements SolverInterface {
  constructor(private anchor: AnchorStrategy = new RuleBasedAnchor()) {}

  solve(input: ConstraintSet): SolveResult {
    const inputModel = buildModel(input)
    const anchored = this.anchor.plan(inputModel)
    resolve(anchored)
    return extractResult(anchored, input)
  }
}
