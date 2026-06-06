// ─── Model I/O ────────────────────────────────────────────────────────────────
// Functions that translate between the public solver interface (ConstraintSet
// / SolveResult) and the internal GeomModel. Called by Solver.solve() at the
// boundaries of the propagate/pick loop.

import {
  ConstraintSet, SolveResult, ResolvedConstraint,
  ElementResult, Point, Line, Scalar, ConstraintError,
} from './interface.js'
import {
  GeomModel, makeModel, touchPoint, setPoint, setLength, setAngle,
} from './geometric/model.js'
import {
  makeWorkingLine, makeWorkingScalar, workingVal, isWorkingComplete, lineDofFromState,
} from './geometric/types.js'
import { isEqual } from './geometric/geom.js'

// ── Build GeomModel from ConstraintSet ───────────────────────────────────────

export function buildModel(input: ConstraintSet): GeomModel {
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
  for (const name of input.scalars) {
    model.scalars.set(name, makeWorkingScalar())
  }

  // Apply picks
  for (const [key, index] of input.picks) {
    model.solutionPicks.set(key, index)
  }

  // Apply all constraints
  for (const c of input.constraints) {
    applyConstraint(model, c)
  }

  return model
}

function applyConstraint(model: GeomModel, c: ResolvedConstraint): void {
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
      wl.dof = lineDofFromState(lv.a, lv.b, lv.c)
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
    case 'scalar-equality': {
      const ws = model.scalars.get(c.scalar)
      if (!ws) throw new ConstraintError(`scalar "${c.scalar}" is not declared`)
      if (typeof c.target === 'number') {
        ws.resolved[0] = c.target
        ws.dof = 0
      } else {
        model.scalarBindings.push({ scalar: c.scalar, element: c.target.element, field: c.target.field })
      }
      break
    }
  }
}

// ── Extract SolveResult from solved GeomModel ────────────────────────────────

export function extractResult(model: GeomModel, input: ConstraintSet): SolveResult {
  const points = new Map<string, ElementResult<Point>>()
  const lines = new Map<string, ElementResult<Line>>()
  const scalars = new Map<string, ElementResult<Scalar>>()

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

  for (const [name, ws] of model.scalars) {
    if (ws.resolved[0] !== null) {
      scalars.set(name, { solutions: [ws.resolved[0]!], dof: ws.dof })
    } else {
      scalars.set(name, { solutions: [], dof: ws.dof })
    }
  }

  return { points, lines, scalars, segments: input.segments }
}
