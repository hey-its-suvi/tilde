// ─── Tilde Solver — Budget-based Anchor (WIP) ─────────────────────────────────
// An alternative AnchorStrategy that tracks gauge consumption explicitly:
// each gauge (T, R, S) is a limited resource that elements claim in priority
// order. Unlike RuleBasedAnchor, no gauge can be double-claimed — once
// consumed, it's gone, and any element that wanted it falls back to a less
// canonical placement or remains underdetermined.
//
// Gauge model:
//   T (translation, 2-dim ℝ²) — splittable. Each claim consumes a 1-dim
//     subspace (a direction); two linearly-independent claims exhaust it.
//   R (rotation, 1-dim SO(2)) — atomic. Claimed or not.
//   S (uniform scale, 1-dim ℝ⁺) — atomic. Claimed or not.
//
// The dimensional asymmetry is inherent to the similarity group in 2D, not an
// implementation choice. See conversation around the `line l; line m` case for
// derivation.
//
// Development plan: implement one element type at a time. Unimplemented cases
// produce an empty plan (no anchor constraints) — the scene then resolves with
// no canonical placement, which generally manifests as test failures under
// ANCHOR=budget. This is intentional: keeping the contract narrow avoids
// hidden dependencies on RuleBasedAnchor's behaviour.

import type { GeomModel } from './model.js'
import { cloneModel, setPoint, setLength } from './model.js'
import type { AnchorStrategy } from './anchor.js'
import {
  CANONICAL_X, CANONICAL_Y,
  CANONICAL_DIR_X, CANONICAL_DIR_Y, CANONICAL_SCALE,
} from './anchor.js'
import { isWorkingComplete, workingVal } from './types.js'

// ── Gauge budget ──────────────────────────────────────────────────────────────

export type Direction = { dx: number; dy: number }

const EPS_DIR = 1e-9

export class GaugeBudget {
  /** Unit vectors of T-directions already pinned. Length 0, 1, or 2. */
  private tPinned: Direction[] = []
  private rFree = true
  private sFree = true

  /** Try to claim translation along `dir`. Returns false if `dir` is linearly
   *  dependent on already-pinned directions (or if T is already full). */
  claimT(dir: Direction): boolean {
    const norm = Math.hypot(dir.dx, dir.dy)
    if (norm < EPS_DIR) return false
    const u: Direction = { dx: dir.dx / norm, dy: dir.dy / norm }
    if (this.tPinned.length >= 2) return false
    for (const p of this.tPinned) {
      const cross = u.dx * p.dy - u.dy * p.dx
      if (Math.abs(cross) < EPS_DIR) return false
    }
    this.tPinned.push(u)
    return true
  }

  /** Claim all of T at once. Succeeds only if T is completely free. */
  claimTFull(): boolean {
    if (this.tPinned.length > 0) return false
    this.tPinned.push({ dx: 1, dy: 0 })
    this.tPinned.push({ dx: 0, dy: 1 })
    return true
  }

  claimR(): boolean {
    if (!this.rFree) return false
    this.rFree = false
    return true
  }

  claimS(): boolean {
    if (!this.sFree) return false
    this.sFree = false
    return true
  }

  /** When exactly one T-direction has been pinned, return the perpendicular
   *  unit vector — the remaining 1D-free axis of translation. Null when T is
   *  fully free or fully consumed. */
  residualTDirection(): Direction | null {
    if (this.tPinned.length !== 1) return null
    const p = this.tPinned[0]!
    return { dx: -p.dy, dy: p.dx }
  }

  get tConsumedDim(): number { return this.tPinned.length }
  get rConsumed(): boolean { return !this.rFree }
  get sConsumed(): boolean { return !this.sFree }
}

// ── Claimant interface ────────────────────────────────────────────────────────

export interface Claimant {
  /** Returns a new model with the claim applied. Must not mutate `model`.
   *  If the claim is inapplicable or the required gauges are unavailable,
   *  return `model` unchanged. May also synthesize internal aux lines
   *  (underscore-prefixed names, filtered by the scene builder) — for example
   *  a perpendicular helper line used to express a partial-T claim on a point.
   *  The budget IS mutated as gauges are claimed (it's a running tally). */
  claim(model: GeomModel, budget: GaugeBudget): GeomModel
}

// ── Pre-debit ────────────────────────────────────────────────────────────────
// Scan the input model for user-supplied facts that already consume gauges,
// and debit them from the budget before any claimant runs. This way claimants
// see an accurate picture of what's still available.

function preDebit(model: GeomModel, budget: GaugeBudget): void {
  // Lines with known coefficients debit R (direction) and T-perp (position).
  // Done first so a point pinned on a line with known direction debits
  // consistently afterward.
  for (const wl of model.lines.values()) {
    const lv = workingVal(wl)
    if (lv.a !== null && lv.b !== null) {
      budget.claimR()
      if (lv.c !== null) {
        const norm = Math.hypot(lv.a, lv.b)
        if (norm > EPS_DIR) budget.claimT({ dx: lv.a / norm, dy: lv.b / norm })
      }
    }
  }

  // Fully-placed points consume T first, then R, then S as more accumulate.
  let pinnedPoints = 0
  let firstPt: { x: number; y: number } | null = null
  for (const wp of model.points.values()) {
    if (!isWorkingComplete(wp)) continue
    const pv = workingVal(wp)
    pinnedPoints++
    if (pinnedPoints === 1) {
      budget.claimTFull()
      firstPt = { x: pv.x!, y: pv.y! }
    } else if (pinnedPoints === 2 && firstPt) {
      // Two distinct points fix direction (R) and scale (S).
      const dx = pv.x! - firstPt.x, dy = pv.y! - firstPt.y
      if (Math.hypot(dx, dy) > EPS_DIR) { budget.claimR(); budget.claimS() }
    }
  }

  // Any known length consumes S (if not already taken).
  for (const len of model.lengths.values()) {
    if (len !== null) { budget.claimS(); break }
  }
}

// ── Claimants ────────────────────────────────────────────────────────────────

/** Pin one fully-free point at the canonical origin, claiming T-full.
 *  "Bare" = not on any line, not on any segment, dof > 0. We stop at the first
 *  eligible candidate because once T-full is claimed, no other bare point can
 *  claim it; subsequent points need a different claimant (e.g. R-reference). */
class BarePointClaimant implements Claimant {
  claim(model: GeomModel, budget: GaugeBudget): GeomModel {
    for (const [k, wp] of model.points) {
      if (isWorkingComplete(wp)) continue
      if (model.onLine.has(k)) continue
      if (model.onSegment.has(k)) continue
      if (!budget.claimTFull()) return model
      const next = cloneModel(model)
      setPoint(next, k, CANONICAL_X, CANONICAL_Y, 0)
      return next
    }
    return model
  }
}

/** Pin a second free point at the canonical reference target, claiming R + S
 *  together. Requires a pivot (any already-placed point — explicit, or pinned
 *  by BarePointClaimant) and an eligible bare point. Synthesizes a unit-scale
 *  distance constraint between them so the placement is consistent.
 *
 *  Reference target depends on the pivot's position:
 *    pivot at origin     → reference at CANONICAL_DIR × CANONICAL_SCALE
 *    pivot anywhere else → reference at origin (so the new placement lies on
 *                          the line from pivot toward the canonical frame).
 *
 *  Covers: `point a; point b`, `segment ab`, `triangle abc`, `point a = …;
 *  point b`, `point a = …; segment bc`. Does NOT cover segments with known
 *  lengths or any case where S is already consumed — that's the R-only
 *  claimant's job (next step). */
class BareRSReferenceClaimant implements Claimant {
  claim(model: GeomModel, budget: GaugeBudget): GeomModel {
    if (budget.rConsumed || budget.sConsumed) return model

    let pivotName: string | null = null
    let pivotX = 0, pivotY = 0
    for (const [k, wp] of model.points) {
      if (!isWorkingComplete(wp)) continue
      const pv = workingVal(wp)
      pivotName = k
      pivotX = pv.x!
      pivotY = pv.y!
      break
    }
    if (pivotName === null) return model

    const pivotAtOrigin = Math.hypot(pivotX - CANONICAL_X, pivotY - CANONICAL_Y) < EPS_DIR
    const refTargetX = pivotAtOrigin ? CANONICAL_X + CANONICAL_DIR_X * CANONICAL_SCALE : CANONICAL_X
    const refTargetY = pivotAtOrigin ? CANONICAL_Y + CANONICAL_DIR_Y * CANONICAL_SCALE : CANONICAL_Y
    const refDist = Math.hypot(refTargetX - pivotX, refTargetY - pivotY)
    if (refDist < EPS_DIR) return model

    for (const [k, wp] of model.points) {
      if (k === pivotName) continue
      if (isWorkingComplete(wp)) continue
      if (model.onLine.has(k)) continue
      if (model.onSegment.has(k)) continue

      budget.claimR()
      budget.claimS()
      const next = cloneModel(model)
      setPoint(next, k, refTargetX, refTargetY, 0)
      setLength(next, pivotName, k, refDist)
      return next
    }
    return model
  }
}

// ── BudgetAnchor ──────────────────────────────────────────────────────────────

export class BudgetAnchor implements AnchorStrategy {
  /** Each claimant takes the running model + live budget and returns a new
   *  model (possibly unchanged). The chained output is fed straight to
   *  resolve — no constraint round-trip. */
  private claimants: Claimant[] = [
    new BarePointClaimant(),
    new BareRSReferenceClaimant(),
  ]

  plan(model: GeomModel): GeomModel {
    const budget = new GaugeBudget()
    preDebit(model, budget)

    let current = model
    for (const claimant of this.claimants) {
      current = claimant.claim(current, budget)
    }
    return current
  }
}

// ── HANDOVER_TODO ─────────────────────────────────────────────────────────────
// Targets in roughly the order we'll tackle them:
//
//   [x] infrastructure: GaugeBudget, Claimant, pre-debit
//   [x] bare points: claim T-full, place at origin
//   [ ] bare segments: 2 endpoints + length 1 (T + R + S)
//   [ ] bare lines: claim R + T-perp (partial-T); second bare line uses
//                   residual T-direction via aux line to canonicalize position
//   [ ] bare circles: claim T for center, S for radius
//   [ ] partial lines (slope/intercept-only, etc.)
//   [ ] points with explicit coords already consume T before anchor runs
//   [ ] on-line / on-segment / on-circle points
//   [ ] segments with known lengths
//   [ ] lines with known direction / parallel / perpendicular
//
// Each milestone: take responsibility for that case, leave the rest delegated,
// run all tests, commit if green.
