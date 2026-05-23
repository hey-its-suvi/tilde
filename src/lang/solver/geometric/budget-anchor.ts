// ─── Tilde Solver — Budget-based Anchor (WIP) ─────────────────────────────────
// An alternative AnchorStrategy that tracks gauge consumption explicitly:
// each gauge (T, R, S) is a limited resource that elements claim in priority
// order. Unlike RuleBasedAnchor, no gauge can be double-claimed — once
// consumed, it's gone, and any element that wanted it falls back to a less
// canonical placement or remains underdetermined.
//
// Development plan: implement one element type at a time. For everything not
// yet handled, delegate to RuleBasedAnchor so behaviour stays identical to
// main at every step. Each subsequent commit takes over one more element type.

import type { GeomModel } from './model.js'
import type { AnchorStrategy, AnchorPlan } from './anchor.js'
import { RuleBasedAnchor } from './anchor.js'

export class BudgetAnchor implements AnchorStrategy {
  private fallback = new RuleBasedAnchor()

  plan(model: GeomModel): AnchorPlan {
    // TODO: incrementally take over from fallback.
    return this.fallback.plan(model)
  }
}

// ── HANDOVER_TODO ─────────────────────────────────────────────────────────────
// Targets in roughly the order we'll tackle them:
//
//   [ ] bare points: claim T, place at origin
//   [ ] bare segments: 2 endpoints + length 1
//   [ ] bare lines: claim R for direction, T-perp for c=0 (else S for offset)
//   [ ] bare circles: claim T for center, S for radius
//   [ ] partial lines (slope/intercept-only, etc.)
//   [ ] points with explicit coords already consume T before anchor runs
//   [ ] on-line / on-segment / on-circle points
//   [ ] segments with known lengths
//   [ ] lines with known direction / parallel / perpendicular
//
// Each milestone: take responsibility for that case, leave the rest delegated,
// run all tests, commit if green.
