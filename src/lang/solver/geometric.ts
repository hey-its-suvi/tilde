// ─── Geometric Solver ─────────────────────────────────────────────────────────
// Wraps the existing geometric solver (anchor + resolve) behind the Solver
// interface. Takes a ConstraintSet, internally builds a GeomModel, runs the
// existing passes, and converts the result to a SolveResult.

import {
  Solver, ConstraintSet, SolveResult,
  ResolvedConstraint, ElementResult, PointSolution, LineSolution,
} from './interface.js'
import { GeomModel, makeModel, touchPoint, setPoint, setLength, setAngle, segKey } from './model.js'
import { makeWorkingLine, workingVal, isWorkingComplete, ConstraintError } from './types.js'
import { isEqual } from './geom.js'
import { applyAnchor } from './anchor.js'
import { resolve } from './resolve.js'

export class GeometricSolver implements Solver {
  solve(input: ConstraintSet): SolveResult {
    const model = this.buildModel(input)
    applyAnchor(model)
    resolve(model)
    return this.extractResult(model, input)
  }

  // ── Build GeomModel from ConstraintSet ───────────────────────────────────

  private buildModel(input: ConstraintSet): GeomModel {
    const model = makeModel()

    // Register all declared elements
    for (const key of input.points) {
      touchPoint(model, key)
    }
    for (const key of input.segments) {
      model.segments.add(key)
    }
    for (const name of input.lines) {
      model.lines.set(name, makeWorkingLine(null, null, null))
    }

    // Apply picks
    for (const [key, index] of input.picks) {
      model.solutionPicks.set(key, index)
    }

    // Apply all constraints
    for (const c of input.constraints) {
      this.applyConstraint(model, c)
    }

    return model
  }

  private applyConstraint(model: GeomModel, c: ResolvedConstraint): void {
    switch (c.kind) {
      case 'position': {
        const existing = model.points.get(c.point)
        if (existing && isWorkingComplete(existing)) {
          const ev = workingVal(existing)
          if (!isEqual(ev.x!, c.x) || !isEqual(ev.y!, c.y)) {
            throw new ConstraintError(`vertex "${c.point}" is already placed at (${ev.x}, ${ev.y}), cannot redefine as (${c.x}, ${c.y})`)
          }
        } else {
          setPoint(model, c.point, c.x, c.y, 0)
        }
        break
      }
      case 'distance': {
        setLength(model, c.p1, c.p2, c.value)
        break
      }
      case 'angle': {
        setAngle(model, c.from, c.vertex, c.to, c.degrees)
        break
      }
      case 'on-line': {
        const existing = model.onLine.get(c.point) ?? []
        if (!existing.includes(c.line)) {
          model.onLine.set(c.point, [...existing, c.line])
        }
        break
      }
      case 'on-segment': {
        model.onSegment.set(c.point, { v1: c.s1, v2: c.s2 })
        break
      }
      case 'line-equation': {
        const wl = model.lines.get(c.line)
        if (!wl) throw new ConstraintError(`line "${c.line}" is not declared`)
        const lv = workingVal(wl)
        if (c.a !== null) lv.a = c.a
        if (c.b !== null) lv.b = c.b
        if (c.c !== null) lv.c = c.c
        // Recalculate dof
        const nulls = (lv.a === null ? 1 : 0) + (lv.b === null ? 1 : 0) + (lv.c === null ? 1 : 0)
        wl.dof = Math.min(nulls, 2)
        break
      }
      case 'parallel': {
        const lp = model.lineParallel.get(c.l1) ?? []
        lp.push({ other: c.l2, distance: c.distance })
        model.lineParallel.set(c.l1, lp)

        const rp = model.lineParallel.get(c.l2) ?? []
        rp.push({ other: c.l1, distance: c.distance })
        model.lineParallel.set(c.l2, rp)
        break
      }
      case 'perpendicular': {
        const lpp = model.linePerpendicular.get(c.l1) ?? []
        lpp.push(c.l2)
        model.linePerpendicular.set(c.l1, lpp)

        const rpp = model.linePerpendicular.get(c.l2) ?? []
        rpp.push(c.l1)
        model.linePerpendicular.set(c.l2, rpp)
        break
      }
    }
  }

  // ── Extract SolveResult from solved GeomModel ────────────────────────────

  private extractResult(model: GeomModel, input: ConstraintSet): SolveResult {
    const points = new Map<string, ElementResult<PointSolution>>()
    const lines = new Map<string, ElementResult<LineSolution>>()

    for (const [key, wp] of model.points) {
      if (wp.resolved.length > 1) {
        // Multiple discrete solutions — check for pick
        const pick = model.solutionPicks.get(key)
        if (pick !== undefined && pick >= 1 && pick <= wp.resolved.length) {
          const s = wp.resolved[pick - 1]!
          points.set(key, { solutions: [{ x: s.x!, y: s.y! }], dof: 0 })
        } else {
          points.set(key, {
            solutions: wp.resolved.map(s => ({ x: s.x!, y: s.y! })),
            dof: 0,
          })
        }
      } else {
        const pv = workingVal(wp)
        if (pv.x !== null && pv.y !== null) {
          points.set(key, { solutions: [{ x: pv.x, y: pv.y }], dof: wp.dof })
        } else {
          points.set(key, { solutions: [], dof: wp.dof })
        }
      }
    }

    for (const [name, wl] of model.lines) {
      if (!isWorkingComplete(wl)) {
        lines.set(name, { solutions: [], dof: wl.dof })
        continue
      }
      if (wl.resolved.length > 1) {
        const pick = model.solutionPicks.get(name)
        if (pick !== undefined && pick >= 1 && pick <= wl.resolved.length) {
          const s = wl.resolved[pick - 1]!
          lines.set(name, { solutions: [{ a: s.a!, b: s.b!, c: s.c! }], dof: 0 })
        } else {
          lines.set(name, {
            solutions: wl.resolved.map(s => ({ a: s.a!, b: s.b!, c: s.c! })),
            dof: 0,
          })
        }
      } else {
        const lv = workingVal(wl)
        lines.set(name, {
          solutions: [{ a: lv.a!, b: lv.b!, c: lv.c! }],
          dof: wl.dof,
        })
      }
    }

    return { points, lines, segments: input.segments }
  }
}
