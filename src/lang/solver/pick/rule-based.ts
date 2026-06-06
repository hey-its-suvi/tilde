// ─── RuleBasedPick ────────────────────────────────────────────────────────────
// The rule-pile pick strategy. Each step call does ONE of:
//   1. Apply rule-based gauge fixings (T → R+S → line absorbing). The whole
//      cascade runs in one call; modelsEqual then detects that subsequent
//      step() invocations on the same input are no-ops, signalling the outer
//      loop to advance to the locus/fallback tail.
//   2. Place a single point/line by a locus rule.
//   3. Place a single point/line by a fallback rule.
//
// The locus/fallback tail is owned by this pick. BudgetPick has its own copy
// — the two are free to diverge as BudgetPick learns to consume more
// symmetries directly.

import type { GeomModel } from '../model.js'
import { cloneModel, getPoint, setPoint, setLength, getLength, segKey } from '../model.js'
import {
  workingVal, isWorkingComplete, lineDofFromState,
  makePlacementState, PlacementState, WorkingLine,
} from '../types.js'
import { isZero, isEqual } from '../geom.js'
import type { PickStrategy } from './interface.js'

const DEFAULT_LEN = 3

// Canonical frame: where rule-based fixers send the anchor and its reference.
// Exported so canonical-form tests can stay in sync with the convention.
export const CANONICAL_X     = 0   // T fixer: anchor lands at this x
export const CANONICAL_Y     = 0   // T fixer: anchor lands at this y
export const CANONICAL_DIR_X = 1   // R fixer: reference point is placed in this direction from anchor
export const CANONICAL_DIR_Y = 0   //          (1,0) = +x axis; must be a unit vector
export const CANONICAL_SCALE = 1   // S fixer: canonical distance from anchor to reference point

export class RuleBasedPick implements PickStrategy {
  step(model: GeomModel): GeomModel | null {
    // 1. Rule-based gauge fixings (T → R+S → line absorbing).
    const scratch = cloneModel(model)
    runRuleBasedFixers(scratch)
    if (!modelsEqual(scratch, model)) return scratch

    // 2. Locus and 3. fallback rules. One placement at a time; the outer
    //    Solver loop re-enters propagate after each pick.
    const st = makePlacementState(scratch)
    if (tryPlaceVertexByLocus(scratch, st))    return scratch
    if (tryCompleteLineByDefault(scratch, st)) return scratch
    if (tryPlaceVertexByFallback(scratch, st)) return scratch
    return null
  }
}

// ── Rule-based gauge fixers ───────────────────────────────────────────────────
// Two-pass: point-based T/R/S anchoring, then a separate pass absorbing the
// remaining global freedoms into disconnected lines.

function runRuleBasedFixers(model: GeomModel): void {
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
  // Two-tier search:
  //   Tier 1: a free point with no on-line, on-segment, or on-circle constraints
  //           → pin it at the canonical origin (0, 0).
  //   Tier 2: a free point with a single on-line constraint → pin at the line's
  //           "natural" point. Lets `line l = (1,); point p on l` fully resolve.
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
    } else {
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
        anchor = k
        break
      }
    }
  } else if (rFree && fixedPts.length === 1) {
    anchor = fixedPts[0]![0]
  }

  // ── R + S fixers ──
  // Phase 1: a segment directly connected to the anchor (same component).
  // Phase 2: any free segment in the model (disconnected component).
  // Phase 3: any free eligible point — two free points always define a direction
  // and scale even across disconnected components.
  if (anchor !== null && rFree) {
    const anchorWp  = model.points.get(anchor)!
    const anchorVal = workingVal(anchorWp)
    const anchorAtOrigin = isEqual(anchorVal.x!, CANONICAL_X) &&
                           isEqual(anchorVal.y!, CANONICAL_Y)
    const refTargetX = anchorAtOrigin ? CANONICAL_X + CANONICAL_DIR_X * CANONICAL_SCALE : CANONICAL_X
    const refTargetY = anchorAtOrigin ? CANONICAL_Y + CANONICAL_DIR_Y * CANONICAL_SCALE : CANONICAL_Y
    const refDirX = refTargetX - anchorVal.x!
    const refDirY = refTargetY - anchorVal.y!
    const refDist = Math.sqrt(refDirX * refDirX + refDirY * refDirY)

    const tryFix = (ref: string): boolean => {
      if (isZero(refDist)) return false
      const refWp = model.points.get(ref)
      if (!refWp || refWp.dof === 0 || model.onLine.has(ref) || model.onSegment.has(ref)) return false
      const knownLen = getLength(model, anchor!, ref)
      if (sFree) {
        setLength(model, anchor!, ref, refDist)
        setPoint(model, ref, refTargetX, refTargetY, 0)
        return true
      } else if (knownLen !== null) {
        setPoint(model, ref, anchorVal.x! + (refDirX / refDist) * knownLen,
                             anchorVal.y! + (refDirY / refDist) * knownLen, 0)
        return true
      }
      return false
    }

    let fixed = false
    for (const segK of model.segments) {
      const [v1, v2] = segK.split(':') as [string, string]
      const nbr = v1 === anchor ? v2 : v2 === anchor ? v1 : null
      if (nbr === null) continue
      if (tryFix(nbr)) { fixed = true; break }
    }
    if (!fixed) {
      for (const segK of model.segments) {
        const [v1, v2] = segK.split(':') as [string, string]
        if (tryFix(v1)) { fixed = true; break }
        if (tryFix(v2)) { fixed = true; break }
      }
    }
    if (!fixed) {
      for (const [k] of model.points) {
        if (k === anchor) continue
        if (tryFix(k)) { fixed = true; break }
      }
    }
  } else if (!rFree && sFree) {
    // R fixed, S free: set first unconstrained segment between two free points to length 1.
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
  // After point-based anchoring, absorb remaining global freedoms into
  // disconnected lines. Connected lines (via on-line points, parallel,
  // perpendicular) get resolved by the propagate pass instead.
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
    if (nullCount === 0) continue
    if (isLineConnected(model, lineName)) continue

    const directionKnown = lv.a !== null && lv.b !== null
    const positionKnown = lv.c !== null

    if (!directionKnown && postRFree) {
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

/** A line is "connected" if it has on-line points or parallel/perpendicular
 *  relationships. Connected lines get resolved by propagate; only disconnected
 *  ones need the rule-based line anchor. */
function isLineConnected(model: GeomModel, lineName: string): boolean {
  for (const lineNames of model.onLine.values()) {
    if (lineNames.includes(lineName)) return true
  }
  const par = model.lineParallel.get(lineName)
  if (par && par.length > 0) return true
  const perp = model.linePerpendicular.get(lineName)
  if (perp && perp.length > 0) return true
  return false
}

/** A point on a line that satisfies the constraint regardless of which of the
 *  line's remaining unknown coefficients gets filled in later. */
function naturalPointOnLine(wl: WorkingLine): { x: number; y: number } | null {
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

// ── Locus vertex placements ──────────────────────────────────────────────────
// One at a time — placing one vertex may give another vertex a second locus,
// promoting it to exact next iteration.

function tryPlaceVertexByLocus(model: GeomModel, st: PlacementState): boolean {
  // Circle — exactly 1 placed neighbour with known distance.
  for (const v of model.points.keys()) {
    if (st.placed.has(v)) continue
    const nbrs = placedNeighborsWithDist(model, st.placed, v)
    if (nbrs.length !== 1) continue
    const n = nbrs[0]!
    setPoint(model, v, n.x + n.dist * st.hdX, n.y + n.dist * st.hdY, 1)
    ;[st.hdX, st.hdY] = [-st.hdY, st.hdX]
    st.placed.add(v)
    return true
  }

  // Line — on a named line, no distance neighbours yet.
  for (const v of model.points.keys()) {
    if (st.placed.has(v)) continue
    const lineNames = model.onLine.get(v)
    if (!lineNames || lineNames.length === 0) continue
    const wl = model.lines.get(lineNames[0]!)!
    const lv = workingVal(wl)
    if (lv.a === null || lv.b === null || lv.c === null) continue
    const { a, b, c } = { a: lv.a, b: lv.b, c: lv.c }
    const denom = a * a + b * b
    setPoint(model, v, -a * c / denom, -b * c / denom, 1)
    st.placed.add(v)
    return true
  }

  // Segment — on a segment, both endpoints already placed. Distribute evenly.
  const groups = new Map<string, string[]>()
  for (const v of model.points.keys()) {
    if (st.placed.has(v)) continue
    const seg = model.onSegment.get(v)
    if (!seg || !st.placed.has(seg.v1) || !st.placed.has(seg.v2)) continue
    const k = segKey(seg.v1, seg.v2)
    if (!groups.has(k)) groups.set(k, [])
    groups.get(k)!.push(v)
  }
  for (const [, pts] of groups) {
    const seg = model.onSegment.get(pts[0]!)!
    const wp1 = getPoint(model, seg.v1)!, wp2 = getPoint(model, seg.v2)!
    const pv1 = workingVal(wp1), pv2 = workingVal(wp2)
    pts.forEach((v, i) => {
      const t = (i + 1) / (pts.length + 1)
      setPoint(model, v, pv1.x! + t * (pv2.x! - pv1.x!), pv1.y! + t * (pv2.y! - pv1.y!), 1)
      st.placed.add(v)
    })
    return true
  }

  return false
}

// ── Fallback vertex placements ───────────────────────────────────────────────

function tryPlaceVertexByFallback(model: GeomModel, st: PlacementState): boolean {
  // Segment neighbour — shares a segment with a placed vertex but no known length.
  for (const v of model.points.keys()) {
    if (st.placed.has(v)) continue
    for (const p of st.placed) {
      if (model.segments.has(segKey(v, p))) {
        const pv = workingVal(getPoint(model, p)!)
        setPoint(model, v, pv.x! + DEFAULT_LEN, pv.y!, 1)
        st.placed.add(v)
        return true
      }
    }
  }

  // Isolated — no connection to any placed vertex. Stack vertically.
  for (const v of model.points.keys()) {
    if (st.placed.has(v)) continue
    setPoint(model, v, 0, -(st.isolatedSeedIdx + 1) * DEFAULT_LEN * 2, 1)
    st.isolatedSeedIdx++
    st.placed.add(v)
    return true
  }

  return false
}

// ── Default line completion ──────────────────────────────────────────────────
// nullCount=3, 1 placed point → canonical direction (a=1, b=-1), solve c (dof=1)
// nullCount=1, no usable point → canonicalize the single null (c=0 / a=0 / b=1)
// nullCount=3, no placed points → canonicalize to y = x (a=1, b=-1, c=0)

function tryCompleteLineByDefault(model: GeomModel, st: PlacementState): boolean {
  const placedOnLine = new Map<string, Array<{ x: number; y: number }>>()
  for (const [v, lineNames] of model.onLine) {
    if (!st.placed.has(v)) continue
    const pv = workingVal(model.points.get(v)!)
    for (const ln of lineNames) {
      if (!placedOnLine.has(ln)) placedOnLine.set(ln, [])
      placedOnLine.get(ln)!.push({ x: pv.x!, y: pv.y! })
    }
  }

  for (const [lineName, wl] of model.lines) {
    if (isWorkingComplete(wl)) continue
    const lv = workingVal(wl)
    const nullCount = (lv.a === null ? 1 : 0) + (lv.b === null ? 1 : 0) + (lv.c === null ? 1 : 0)
    const pts = placedOnLine.get(lineName) ?? []

    if (nullCount === 3) {
      if (pts.length > 0) {
        const p1 = pts[0]!
        lv.a = 1; lv.b = -1
        lv.c = -(p1.x - p1.y)
        if (wl.dof === 2) wl.dof = 1
      } else {
        lv.a = 1; lv.b = -1; lv.c = 0
      }
      return true
    }

    if (nullCount === 1) {
      if (lv.c === null) { lv.c = 0; return true }
      if (lv.a === null) {
        const rFree = rFreeIgnoring(model, lineName)
        lv.a = isZero(lv.b!) ? 1 : -lv.b!
        if (rFree) wl.dof = 0
        return true
      }
      if (lv.b === null) {
        const rFree = rFreeIgnoring(model, lineName)
        lv.b = isZero(lv.a!) ? 1 : -lv.a!
        if (rFree) wl.dof = 0
        return true
      }
    }
  }
  return false
}

/** True if rotation-gauge is still unconsumed, ignoring the given line. */
function rFreeIgnoring(model: GeomModel, exceptLineName: string): boolean {
  for (const [name, wl] of model.lines) {
    if (name === exceptLineName) continue
    const lv = workingVal(wl)
    if (lv.a !== null && lv.b !== null) return false
  }
  let placedCount = 0
  for (const wp of model.points.values()) {
    if (isWorkingComplete(wp)) {
      placedCount++
      if (placedCount >= 2) return false
    }
  }
  return true
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function placedNeighborsWithDist(
  model: GeomModel,
  placed: Set<string>,
  v: string,
): Array<{ x: number; y: number; dist: number; dof: number }> {
  const result: Array<{ x: number; y: number; dist: number; dof: number }> = []
  for (const p of placed) {
    const dist = getLength(model, v, p)
    if (dist !== null) {
      const wp = getPoint(model, p)!
      const pv = workingVal(wp)
      result.push({ x: pv.x!, y: pv.y!, dist, dof: wp.dof })
    }
  }
  return result
}

/** True if `a` and `b` are equivalent in every field a pick can change. */
function modelsEqual(a: GeomModel, b: GeomModel): boolean {
  if (a.points.size !== b.points.size) return false
  for (const [k, wpA] of a.points) {
    const wpB = b.points.get(k)
    if (!wpB) return false
    if (wpA.dof !== wpB.dof) return false
    if (wpA.resolved.length !== wpB.resolved.length) return false
    for (let i = 0; i < wpA.resolved.length; i++) {
      const rA = wpA.resolved[i]!, rB = wpB.resolved[i]!
      if (rA.x !== rB.x || rA.y !== rB.y) return false
    }
  }

  if (a.lines.size !== b.lines.size) return false
  for (const [k, wlA] of a.lines) {
    const wlB = b.lines.get(k)
    if (!wlB) return false
    if (wlA.dof !== wlB.dof) return false
    if (wlA.resolved.length !== wlB.resolved.length) return false
    const lvA = workingVal(wlA), lvB = workingVal(wlB)
    if (lvA.a !== lvB.a || lvA.b !== lvB.b || lvA.c !== lvB.c) return false
  }

  if (a.lengths.size !== b.lengths.size) return false
  for (const [k, vA] of a.lengths) {
    if (b.lengths.get(k) !== vA) return false
  }

  return true
}
