// ─── Tilde Solver — Line Completion & Relations ───────────────────────────────
// Line completion functions for the resolution loop (pass 3).

import { GeomModel } from './model.js'
import { workingVal, isWorkingComplete, PlacementState } from './types.js'
import { isZero, isEqual } from './geom.js'
import { ConstraintError } from './types.js'

// ── Priority 2: exact line completions ────────────────────────────────────────
// Only fires when a placed point fully determines the line (dof=0 result).
//
// nullCount=1, 1+ points  → solve the one null from first point, verify rest
// nullCount=3, 2+ points  → two-point form, verify rest

export function tryCompleteLineByConstraint(model: GeomModel, st: PlacementState): boolean {
  // Build inverse map: line → all placed points on it
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
    const pts = placedOnLine.get(lineName) ?? []
    if (pts.length === 0) continue

    const nullCount = (lv.a === null ? 1 : 0) + (lv.b === null ? 1 : 0) + (lv.c === null ? 1 : 0)
    const p1 = pts[0]!

    // Verify all placed points lie on the line (ax+by+c=0)
    const verify = (a: number, b: number, c: number) => {
      for (const pt of pts) {
        if (!isZero(a * pt.x + b * pt.y + c))
          throw new ConstraintError(`line "${lineName}": point (${pt.x}, ${pt.y}) is inconsistent`)
      }
    }

    // ── nullCount=3: bare line ────────────────────────────────────────────────
    if (nullCount === 3) {
      const p2 = pts.find(p => !isEqual(p.x, p1.x) || !isEqual(p.y, p1.y))
      if (!p2) continue  // only one distinct point — priority 1 handles direction canonicalization
      // Two distinct points → fully determines the line
      const a = p2.y - p1.y
      const b = p1.x - p2.x
      const c = -(a * p1.x + b * p1.y)
      verify(a, b, c)
      lv.a = a; lv.b = b; lv.c = c
      wl.dof = 0
      return true
    }

    // ── nullCount=1: one coefficient unknown — solve from placed point ────────
    if (nullCount === 1) {
      if (lv.c === null) {
        const c = -(lv.a! * p1.x + lv.b! * p1.y)
        verify(lv.a!, lv.b!, c)
        lv.c = c; wl.dof = 0; return true
      }
      if (lv.a === null) {
        // Need a point with non-zero x to solve for a; try all placed points
        const pt = pts.find(p => !isZero(p.x))
        if (!pt) continue
        const a = -(lv.b! * pt.y + lv.c!) / pt.x
        verify(a, lv.b!, lv.c!)
        lv.a = a; wl.dof = 0; return true
      }
      if (lv.b === null) {
        // Need a point with non-zero y to solve for b; try all placed points
        const pt = pts.find(p => !isZero(p.y))
        if (!pt) continue
        const b = -(lv.a! * pt.x + lv.c!) / pt.y
        verify(lv.a!, b, lv.c!)
        lv.b = b; wl.dof = 0; return true
      }
    }
  }
  return false
}

// ── Priority 2: direction propagation from parallel/perpendicular ─────────────
// Copies direction coefficients (a, b) from a resolved partner line.
// After direction is known, existing completion functions handle c.
// For `parallel at d`: once partner is fully resolved, computes two c values (dof=0).

export function tryApplyLineRelation(model: GeomModel): boolean {
  for (const [lineName, wl] of model.lines) {
    if (isWorkingComplete(wl)) continue
    const lv = workingVal(wl)
    const directionKnown = lv.a !== null && lv.b !== null

    // ── Parallel ──────────────────────────────────────────────────────────────
    for (const { other, distance } of (model.lineParallel.get(lineName) ?? [])) {
      const wl2 = model.lines.get(other)
      if (!wl2) continue
      const lv2 = workingVal(wl2)
      if (lv2.a === null || lv2.b === null) continue  // partner direction not known yet

      if (!directionKnown) {
        lv.a = lv2.a; lv.b = lv2.b
        return true
      }

      // Direction already set — apply distance if c is still unknown and partner is complete
      if (distance !== undefined && lv.c === null && lv2.c !== null) {
        const norm = Math.sqrt(lv.a! * lv.a! + lv.b! * lv.b!)
        const delta = distance * norm
        lv.c = lv2.c + delta
        wl.dof = 0
        wl.resolved.push({ a: lv.a!, b: lv.b!, c: lv2.c - delta })
        return true
      }
    }

    // ── Perpendicular ─────────────────────────────────────────────────────────
    if (!directionKnown) {
      for (const other of (model.linePerpendicular.get(lineName) ?? [])) {
        const wl2 = model.lines.get(other)
        if (!wl2) continue
        const lv2 = workingVal(wl2)
        if (lv2.a === null || lv2.b === null) continue

        // Perpendicular direction: rotate partner's normal 90° → (b2, -a2)
        lv.a = lv2.b; lv.b = -lv2.a
        return true
      }
    }
  }
  return false
}

// ── Priority 1: default line completions ──────────────────────────────────────
// Canonicalizes free parameters when no exact solution is possible yet.
// dof is NOT decremented (values are chosen canonically, not by constraint),
// except for the 1-point bare-line case where c is solved from the point (dof=1).
//
// nullCount=3, 1 placed point → canonical direction (a=1, b=-1), solve c (dof=1)
// nullCount=1, no usable point → canonicalize the single null (c=0 / a=0 / b=1)
// nullCount=3, no placed points → canonicalize to y = x (a=1, b=-1, c=0)

export function tryCompleteLineByDefault(model: GeomModel, st: PlacementState): boolean {
  // Build inverse map: line → all placed points on it
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
        // One distinct point on a bare line — canonical direction (slope 1), solve c from point
        // dof=1: direction chosen canonically but position is fully constrained by the point
        const p1 = pts[0]!
        lv.a = 1; lv.b = -1
        lv.c = -(p1.x - p1.y)
        wl.dof = 1
        wl.freeCoefs.a = true; wl.freeCoefs.b = true
      } else {
        // No constraining points — canonical y = x; dof=0 matches bare point behaviour
        lv.a = 1; lv.b = -1; lv.c = 0; wl.dof = 0
      }
      return true
    }

    if (nullCount === 1) {
      if (lv.c === null) { lv.c = 0; wl.freeCoefs.c = true; return true }
      if (lv.a === null) { lv.a = 0; wl.freeCoefs.a = true; return true }
      if (lv.b === null) { lv.b = 1; wl.freeCoefs.b = true; return true }
    }
  }
  return false
}
