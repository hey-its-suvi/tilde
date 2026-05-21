// ─── Tilde Solver — Pass 2: Anchor ─────────────────────────────────────────────
// An AnchorStrategy analyses a GeomModel and returns the set of gauge-fixing
// constraints needed to lift a floating scene into a standard position.
// Conceptually anchor just *adds constraints* — points pinned, segments given
// canonical length, lines given canonical direction/position. The solver
// applies the returned constraints alongside the user's; the dof of each
// element falls out naturally from constraint counting.
//
// Multiple strategies can implement the same interface — they differ in how
// they decide which gauges go where. `RuleBasedAnchor` (this file) reproduces
// the original rule-pile behaviour; future strategies (e.g. a budget-based
// one) plug into the same interface and can be A/B tested by passing a
// different strategy into `GeometricSolver`.

import { GeomModel, setPoint, setLength, getLength, cloneModel } from './model.js'
import { workingVal, isWorkingComplete, lineDofFromState } from './types.js'
import { isZero, isEqual } from './geom.js'
import type { ResolvedConstraint } from '../interface.js'

// ── Strategy interface ────────────────────────────────────────────────────────

export type AnchorPlan = {
  /** Gauge-fixing constraints to apply to the model. Same shape as user constraints. */
  constraints: ResolvedConstraint[]
  /** The T-anchor point, if one was selected. Used by `resolve` to determine
   *  whether scene orientation is already pinned. */
  anchorKey: string | null
}

export interface AnchorStrategy {
  /** Read-only analysis. Returns the gauge-fixing constraints; the caller
   *  applies them to a model. Implementations must not mutate the input. */
  plan(model: GeomModel): AnchorPlan
}

// These define the "standard position" that pass 2 normalises every floating
// scene into.  Change them here to shift the convention globally.
export const CANONICAL_X     = 0   // T fixer: anchor lands at this x
export const CANONICAL_Y     = 0   // T fixer: anchor lands at this y
export const CANONICAL_DIR_X = 1   // R fixer: reference point is placed in this direction from anchor
export const CANONICAL_DIR_Y = 0   //          (1,0) = +x axis; must be a unit vector
export const CANONICAL_SCALE = 1   // S fixer: canonical distance from anchor to reference point

// ── Rule-based strategy ───────────────────────────────────────────────────────
// Runs the legacy two-pass logic (T → R+S → line absorbing) on a private clone
// of the model, then diffs against the input to produce gauge-fixing
// constraints. The strategy itself doesn't mutate the caller's model.

export class RuleBasedAnchor implements AnchorStrategy {
  plan(model: GeomModel): AnchorPlan {
    const scratch = cloneModel(model)
    runRuleBasedAnchor(scratch)
    return diffToPlan(model, scratch)
  }
}

function runRuleBasedAnchor(model: GeomModel): void {
  let hasFullLine      = false  // all of a,b,c known — fixes T and R
  let hasDirectionLine = false  // a,b known (c may be null) — fixes R only
  for (const wl of model.lines.values()) {
    if (isWorkingComplete(wl)) { hasFullLine = true; hasDirectionLine = true; break }
    const v = workingVal(wl)
    if (v.a !== null && v.b !== null) hasDirectionLine = true
  }
  const fixedPts = [...model.points.entries()].filter(([, wp]) => isWorkingComplete(wp))
  const tFree    = fixedPts.length === 0 && !hasFullLine
  const rFree    = !hasDirectionLine && fixedPts.length <= 1
  const sFree    = [...model.lengths.values()].every(l => l === null) && fixedPts.length < 2

  // ── T fixer ──
  // Find eligible anchor and consume T-gauge. Two-tier search:
  //
  //   Tier 1: a free point with no on-line, on-segment, or on-circle constraints
  //           → pin it at the canonical origin (0, 0).
  //
  //   Tier 2: if no tier-1 candidate exists, fall back to a free point with a
  //           single on-line constraint. Place it at the line's "natural" point
  //           (the position that satisfies the constraint regardless of the
  //           line's still-unknown coefficients). Lines whose only unknown is
  //           `c` go through the origin; lines pinned at (0, k) take that pin
  //           as the natural position; etc.
  //
  // This tier-2 path is what lets `line l = (1,); point p on l` resolve fully
  // (T-gauge absorbs p's slide-along-line freedom) instead of leaving both as
  // representative placements.
  //
  // If T is already fixed by exactly 1 explicit point, use it as the pivot for R.
  let anchor: string | null = null
  if (tFree) {
    for (const [k, wp] of model.points) {
      if (wp.dof > 0 && !model.onLine.has(k) && !model.onSegment.has(k)) {
        anchor = k
        break
      }
    }
    if (anchor !== null) {
      setPoint(model, anchor, CANONICAL_X, CANONICAL_Y, 0)
      model.anchorKey = anchor
    } else {
      // Tier 2: fall back to a free on-line point with a single line constraint.
      for (const [k, wp] of model.points) {
        if (wp.dof === 0) continue
        if (model.onSegment.has(k)) continue
        const lineNames = model.onLine.get(k)
        if (!lineNames || lineNames.length !== 1) continue
        const wl = model.lines.get(lineNames[0]!)
        if (!wl) continue
        const placement = naturalPointOnLine(wl)
        if (placement === null) continue
        setPoint(model, k, placement.x, placement.y, 0)
        model.anchorKey = k
        anchor = k
        break
      }
    }
  } else if (rFree && fixedPts.length === 1) {
    // T fixed by 1 explicit point — use it as pivot for R fixer below
    anchor = fixedPts[0]![0]
  }

  // ── R + S fixers ──
  // Phase 1: prefer a segment directly connected to the anchor (same component).
  // Phase 2: if none found, use the first free segment in the model — since
  //          translation is already fixed and the segment is in a disconnected
  //          component, we can still use global rotation+scale to pin its first
  //          endpoint canonically (the anchor being a point doesn't constrain
  //          the orientation of an unconnected segment).
  if (anchor !== null && rFree) {
    const anchorWp  = model.points.get(anchor)!
    const anchorVal = workingVal(anchorWp)

    // The canonical reference target is whichever of {origin, (1,0)} is not the anchor:
    //   anchor at origin (T was free)     → reference goes to (1, 0)
    //   anchor not at origin (T was fixed) → reference goes to (0, 0)
    const anchorAtOrigin = isEqual(anchorVal.x!, CANONICAL_X) &&
                           isEqual(anchorVal.y!, CANONICAL_Y)
    const refTargetX = anchorAtOrigin ? CANONICAL_X + CANONICAL_DIR_X * CANONICAL_SCALE : CANONICAL_X
    const refTargetY = anchorAtOrigin ? CANONICAL_Y + CANONICAL_DIR_Y * CANONICAL_SCALE : CANONICAL_Y
    const refDirX = refTargetX - anchorVal.x!
    const refDirY = refTargetY - anchorVal.y!
    const refDist = Math.sqrt(refDirX * refDirX + refDirY * refDirY)

    // Attempt to fix R (and S if sFree) using a given point as reference.
    const tryFix = (ref: string): boolean => {
      if (isZero(refDist)) return false  // anchor coincides with target — degenerate
      const refWp = model.points.get(ref)
      if (!refWp || refWp.dof === 0 || model.onLine.has(ref) || model.onSegment.has(ref)) return false
      const knownLen = getLength(model, anchor!, ref)
      if (sFree) {
        // Fix R + S: place ref at canonical target, set length = distance anchor→target
        setLength(model, anchor!, ref, refDist)
        setPoint(model, ref, refTargetX, refTargetY, 0)
        return true
      } else if (knownLen !== null) {
        // Fix R only: place ref along anchor→target direction at the known distance
        setPoint(model, ref, anchorVal.x! + (refDirX / refDist) * knownLen,
                             anchorVal.y! + (refDirY / refDist) * knownLen, 0)
        return true
      }
      return false
    }

    let fixed = false
    // Phase 1: anchor-adjacent segment
    for (const segK of model.segments) {
      const [v1, v2] = segK.split(':') as [string, string]
      const nbr = v1 === anchor ? v2 : v2 === anchor ? v1 : null
      if (nbr === null) continue
      if (tryFix(nbr)) { fixed = true; break }
    }
    // Phase 2: any free segment in the model (disconnected component)
    if (!fixed) {
      for (const segK of model.segments) {
        const [v1, v2] = segK.split(':') as [string, string]
        if (tryFix(v1)) { fixed = true; break }
        if (tryFix(v2)) { fixed = true; break }
      }
    }
    // Phase 3: any free eligible point — two free points always define a direction
    // and scale that can be normalized, even across disconnected components.
    if (!fixed) {
      for (const [k] of model.points) {
        if (k === anchor) continue
        if (tryFix(k)) { fixed = true; break }
      }
    }
  } else if (!rFree && sFree) {
    // R fixed, S free: set first unconstrained segment (between two free points) to length 1
    for (const [k] of model.lengths) {
      const [v1, v2] = k.split(':') as [string, string]
      const p1 = model.points.get(v1), p2 = model.points.get(v2)
      if ((p1?.dof ?? 0) > 0 && (p2?.dof ?? 0) > 0) {
        model.lengths.set(k, 1)
        break
      }
    }
  }

  // ── Line anchoring ──
  // After point-based anchoring, determine the effective DOF for each line
  // based on remaining global freedoms. Only affects disconnected lines —
  // lines connected to the anchored frame (via on-line points, parallel,
  // perpendicular) get their DOF resolved naturally in pass 3.
  //
  // A disconnected bare line has 2 intrinsic DOFs (direction + position).
  // Each remaining global freedom can absorb one:
  //   R free → absorbs direction
  //   T free → absorbs position
  //   S free → absorbs position (distance from anchor, via uniform scaling)
  //
  // A disconnected direction-only line has 1 intrinsic DOF (position).
  //   T free → absorbs position
  //   S free → absorbs position
  //
  // A disconnected intercept-only line has 1 intrinsic DOF (direction).
  //   R free → absorbs direction

  // Recompute what's free after point anchoring (point anchoring may have consumed T/R/S)
  const postFixedPts = [...model.points.entries()].filter(([, wp]) => isWorkingComplete(wp))
  let postHasDirectionLine = false
  let postHasFullLine = false
  for (const wl of model.lines.values()) {
    if (isWorkingComplete(wl)) { postHasFullLine = true; postHasDirectionLine = true; break }
    const v = workingVal(wl)
    if (v.a !== null && v.b !== null) postHasDirectionLine = true
  }
  const postTFree = postFixedPts.length === 0 && !postHasFullLine
  const postRFree = !postHasDirectionLine && postFixedPts.length <= 1
  const postSFree = [...model.lengths.values()].every(l => l === null) && postFixedPts.length < 2

  for (const [lineName, wl] of model.lines) {
    const lv = workingVal(wl)
    const nullCount = (lv.a === null ? 1 : 0) + (lv.b === null ? 1 : 0) + (lv.c === null ? 1 : 0)
    if (nullCount === 0) continue  // fully specified, nothing to anchor
    if (isLineConnected(model, lineName)) continue  // resolve handles these

    // Absorb available global freedoms by writing canonical values into the
    // line's unknown coefficients. dof falls out naturally from how many nulls
    // remain after the assignment (via `lineDofFromState`).
    //   R absorbs direction (canonical slope 1: a = -b)
    //   T or S absorbs position (canonical c = 0)
    const directionKnown = lv.a !== null && lv.b !== null
    const positionKnown = lv.c !== null

    if (!directionKnown && postRFree) {
      // Slope 1: a = -b. If b is also null, use the canonical (1, -1) pair.
      if (lv.b !== null) {
        lv.a = -lv.b
      } else if (lv.a !== null) {
        lv.b = -lv.a
      } else {
        lv.a = 1
        lv.b = -1
      }
    }
    if (!positionKnown && (postTFree || postSFree)) {
      lv.c = 0
    }

    wl.dof = lineDofFromState(lv.a, lv.b, lv.c)
  }
}

// ── Diffing ───────────────────────────────────────────────────────────────────
// Read the scratch model after `runRuleBasedAnchor` has mutated it, compare to
// the input, and emit the constraints that describe the difference.

function diffToPlan(before: GeomModel, after: GeomModel): AnchorPlan {
  const constraints: ResolvedConstraint[] = []

  // Points that gained a placement
  for (const [k, afterWp] of after.points) {
    const beforeWp = before.points.get(k)
    if (beforeWp && isWorkingComplete(beforeWp)) continue   // already placed
    if (!isWorkingComplete(afterWp)) continue               // still unplaced
    const pv = workingVal(afterWp)
    constraints.push({ kind: 'position', point: k, x: pv.x!, y: pv.y! })
  }

  // Lengths that gained a value
  for (const [k, afterLen] of after.lengths) {
    if (afterLen === null) continue
    const beforeLen = before.lengths.get(k)
    if (beforeLen !== null && beforeLen !== undefined) continue
    const [p1, p2] = k.split(':') as [string, string]
    constraints.push({ kind: 'distance', p1, p2, value: afterLen })
  }

  // Lines whose coefficients gained values (anchor canonicalising direction/position)
  for (const [name, afterWl] of after.lines) {
    const beforeWl = before.lines.get(name)
    if (!beforeWl) continue
    const bv = workingVal(beforeWl), av = workingVal(afterWl)
    const dA = bv.a === null && av.a !== null ? av.a : null
    const dB = bv.b === null && av.b !== null ? av.b : null
    const dC = bv.c === null && av.c !== null ? av.c : null
    if (dA !== null || dB !== null || dC !== null) {
      constraints.push({ kind: 'line-equation', line: name, a: dA, b: dB, c: dC })
    }
  }

  return { constraints, anchorKey: after.anchorKey }
}

// ── Helpers ──────────────────────────────────────────────────────────────────

/** A line is "connected" if it has on-line points, or parallel/perpendicular
 *  relationships to other lines. Connected lines get resolved by pass 3. */
function isLineConnected(model: GeomModel, lineName: string): boolean {
  // Check for on-line points
  for (const lineNames of model.onLine.values()) {
    if (lineNames.includes(lineName)) return true
  }
  // Check for parallel/perpendicular relationships
  const par = model.lineParallel.get(lineName)
  if (par && par.length > 0) return true
  const perp = model.linePerpendicular.get(lineName)
  if (perp && perp.length > 0) return true

  return false
}

/** A point on a line that satisfies the constraint regardless of which of the
 *  line's remaining unknown coefficients gets filled in later. Used by the
 *  tier-2 T-anchor to find a "natural" position for an on-line point.
 *
 *  Cases:
 *    all of a, b, c known          → foot of perpendicular from origin
 *    c null (any direction, any pos) → origin (lets resolve set c = 0 to match)
 *    a null but b, c known           → invariant (0, -c/b) — line family pivots
 *                                       around this point as a varies
 *    b null but a, c known           → invariant (-c/a, 0) — symmetric case
 *    otherwise (two or more unknowns
 *    with c known)                   → not enough information; defer
 *
 *  Returns null when no well-defined natural placement exists. */
function naturalPointOnLine(wl: import('./types.js').WorkingLine): { x: number; y: number } | null {
  const { a, b, c } = workingVal(wl)
  if (a !== null && b !== null && c !== null) {
    const denom = a * a + b * b
    if (isZero(denom)) return null
    return { x: -a * c / denom, y: -b * c / denom }
  }
  if (c === null) return { x: 0, y: 0 }
  if (a === null && b !== null) {
    if (isZero(b)) return null
    return { x: 0, y: -c / b }
  }
  if (b === null && a !== null) {
    if (isZero(a)) return null
    return { x: -c / a, y: 0 }
  }
  return null
}
