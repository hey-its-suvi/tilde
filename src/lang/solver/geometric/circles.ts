// ─── Tilde Solver — Circle Completion ─────────────────────────────────────────
// Circle completion functions for the resolution loop (pass 3).

import { GeomModel, setPoint } from './model.js'
import { workingVal, isWorkingComplete, PlacementState } from './types.js'
import { isZero, isEqual } from './geom.js'
import { ConstraintError } from '../interface.js'

// ── Priority 2: exact circle completions ──────────────────────────────────────
//
// Cases handled (in order of decreasing information):
//   3+ placed points on circle, center unplaced     → circumcenter formula
//   1+ placed point on circle, center placed, r=null → r = dist(center, p)

export function tryCompleteCircleByConstraint(model: GeomModel, st: PlacementState): boolean {
  // Build inverse map: circle → placed points on it
  const placedOnCircle = new Map<string, Array<{ x: number; y: number }>>()
  for (const [v, circleNames] of model.onCircle) {
    if (!st.placed.has(v)) continue
    const pv = workingVal(model.points.get(v)!)
    for (const cn of circleNames) {
      if (!placedOnCircle.has(cn)) placedOnCircle.set(cn, [])
      placedOnCircle.get(cn)!.push({ x: pv.x!, y: pv.y! })
    }
  }

  for (const [circleName, wc] of model.circles) {
    const cv = workingVal(wc)
    if (cv.center === null) continue  // shouldn't happen — elaboration always sets center

    const centerWp = model.points.get(cv.center)
    const centerPlaced = centerWp !== undefined && st.placed.has(cv.center)
    const pts = placedOnCircle.get(circleName) ?? []

    // ── Center placed, r known: nothing to do
    if (centerPlaced && cv.r !== null) {
      // Verify any placed points lie on the circle
      const cpv = workingVal(centerWp!)
      for (const pt of pts) {
        const d2 = (pt.x - cpv.x!) ** 2 + (pt.y - cpv.y!) ** 2
        if (!isEqual(Math.sqrt(d2), cv.r)) {
          throw new ConstraintError(`circle "${circleName}": point (${pt.x}, ${pt.y}) is not at radius ${cv.r}`)
        }
      }
      continue
    }

    // ── Center placed, r unknown: 1+ point on circle → r = dist
    if (centerPlaced && cv.r === null && pts.length >= 1) {
      const cpv = workingVal(centerWp!)
      const p1 = pts[0]!
      const r = Math.sqrt((p1.x - cpv.x!) ** 2 + (p1.y - cpv.y!) ** 2)
      // Verify others
      for (let i = 1; i < pts.length; i++) {
        const pi = pts[i]!
        const ri = Math.sqrt((pi.x - cpv.x!) ** 2 + (pi.y - cpv.y!) ** 2)
        if (!isEqual(ri, r)) {
          throw new ConstraintError(`circle "${circleName}": placed points are not equidistant from center`)
        }
      }
      cv.r = r
      wc.dof = 0
      return true
    }

    // ── Center unplaced, 3+ points on circle → circumcenter
    if (!centerPlaced && pts.length >= 3) {
      const center = circumcenter(pts[0]!, pts[1]!, pts[2]!)
      if (center === null) {
        throw new ConstraintError(`circle "${circleName}": three placed points are collinear`)
      }
      const r = Math.sqrt((pts[0]!.x - center.x) ** 2 + (pts[0]!.y - center.y) ** 2)
      // Verify any extra points
      for (let i = 3; i < pts.length; i++) {
        const pi = pts[i]!
        const ri = Math.sqrt((pi.x - center.x) ** 2 + (pi.y - center.y) ** 2)
        if (!isEqual(ri, r)) {
          throw new ConstraintError(`circle "${circleName}": placed points are not concyclic`)
        }
      }
      setPoint(model, cv.center, center.x, center.y, 0)
      st.placed.add(cv.center)
      if (cv.r === null) cv.r = r
      wc.dof = 0
      return true
    }
  }
  return false
}

// ── Priority 1: default circle completion ─────────────────────────────────────
// A bare circle with no radius defaults to r = 1.
//
// If the global S-freedom is still available, that default *consumes* S (the
// circle's size is the system's chosen scale, dof=0). If S is already consumed
// elsewhere — e.g. by a length constraint, an anchor-set length, or two placed
// points implicitly defining scale — then r = 1 is a representative choice with
// no constraint behind it, so the circle has dof=1 (renders as underconstrained).

export function tryCompleteCircleByDefault(model: GeomModel, _st: PlacementState): boolean {
  for (const [, wc] of model.circles) {
    const cv = workingVal(wc)
    if (cv.r === null) {
      cv.r = 1
      wc.dof = sFreeRemaining(model) ? 0 : 1
      return true
    }
  }
  return false
}

/** True if the global scale gauge is still unconsumed at this point in the
 *  resolve loop. Mirrors the sFree computation in anchor.ts. */
function sFreeRemaining(model: GeomModel): boolean {
  const noLengths = [...model.lengths.values()].every(l => l === null)
  if (!noLengths) return false
  let placedCount = 0
  for (const [, wp] of model.points) {
    if (isWorkingComplete(wp)) placedCount++
    if (placedCount >= 2) return false
  }
  return true
}

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Circumcenter of three points — intersection of perpendicular bisectors.
 *  Returns null if the three points are collinear. */
function circumcenter(
  a: { x: number; y: number },
  b: { x: number; y: number },
  c: { x: number; y: number },
): { x: number; y: number } | null {
  const d = 2 * (a.x * (b.y - c.y) + b.x * (c.y - a.y) + c.x * (a.y - b.y))
  if (isZero(d)) return null
  const a2 = a.x * a.x + a.y * a.y
  const b2 = b.x * b.x + b.y * b.y
  const c2 = c.x * c.x + c.y * c.y
  return {
    x: (a2 * (b.y - c.y) + b2 * (c.y - a.y) + c2 * (a.y - b.y)) / d,
    y: (a2 * (c.x - b.x) + b2 * (a.x - c.x) + c2 * (b.x - a.x)) / d,
  }
}
