// ─── Tilde Solver — Pass 2: Anchor Selection ─────────────────────────────────
// Detects which global DOFs (T, R, S) are unconstrained and pins them
// to a canonical position.  This is deterministic constraint solving —
// not guesswork — it's the minimal set of fixers that lift a floating scene
// into standard form (gauge fixing).
//
// DOF detection rules:
//   T (translation) free  — no point has explicit coords AND no line has a known position
//   R (rotation) free     — no line AND at most 1 point has explicit coords
//                           (2+ placed points define a direction → rotation fixed)
//   S (scale) free        — no length constraint exists AND fewer than 2 points have explicit coords
//                           (2+ placed points implicitly define a scale via their distance)
//
// Canonical fixers applied in order T → R+S → lines:
//   T      : pin first eligible free point to origin (0, 0)
//   R + S  : find first free segment from anchor, set length = 1, pin far end to (1, 0)
//   R only : find first free segment from anchor with known length L, pin far end to (L, 0)
//   S only : find first segment between two free points with no length, set length = 1
//   Lines  : for each disconnected line, determine how many DOFs are absorbed
//            by remaining global freedoms after point anchoring

import { GeomModel, setPoint, setLength, getLength } from './model.js'
import { workingVal, isWorkingComplete } from './types.js'
import { isZero, isEqual } from './geom.js'

// These define the "standard position" that pass 2 normalises every floating
// scene into.  Change them here to shift the convention globally.
export const CANONICAL_X     = 0   // T fixer: anchor lands at this x
export const CANONICAL_Y     = 0   // T fixer: anchor lands at this y
export const CANONICAL_DIR_X = 1   // R fixer: reference point is placed in this direction from anchor
export const CANONICAL_DIR_Y = 0   //          (1,0) = +x axis; must be a unit vector
export const CANONICAL_SCALE = 1   // S fixer: canonical distance from anchor to reference point

export function applyAnchor(model: GeomModel): void {
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
  // Find eligible anchor: free point, not on-line, not on-segment.
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
    // Skip lines that already have coefficients (not bare/partial from declaration)
    const lv = workingVal(wl)
    const nullCount = (lv.a === null ? 1 : 0) + (lv.b === null ? 1 : 0) + (lv.c === null ? 1 : 0)
    if (nullCount === 0) continue  // fully specified, nothing to anchor

    // Skip connected lines — resolve pass handles them
    if (isLineConnected(model, lineName)) continue

    // Determine how many intrinsic DOFs are absorbed by global freedoms
    const directionKnown = lv.a !== null && lv.b !== null
    const positionKnown = lv.c !== null  // simplified: c known means position is constrained

    let absorbed = 0
    if (!directionKnown && postRFree) absorbed++   // R absorbs direction
    if (!positionKnown && (postTFree || postSFree)) absorbed++  // T or S absorbs position

    const intrinsicDof = (directionKnown ? 0 : 1) + (positionKnown ? 0 : 1)
    wl.dof = intrinsicDof - absorbed
  }
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
