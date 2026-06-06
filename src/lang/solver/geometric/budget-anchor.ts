// ─── Gauge budget ─────────────────────────────────────────────────────────────
// Bookkeeping for which gauges have been canonicalised on a given solve.
// Used by BudgetPick to decide what canonical placement is still available.
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
