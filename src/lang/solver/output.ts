// ─── Tilde Solver — Scene Graph Builder ──────────────────────────────────────
// Converts the solved GeomModel into a SceneGraph for the renderer.

import { GeomModel, getPoint, getLength } from './model.js'
import { workingVal, isWorkingComplete } from './types.js'
import { SceneGraph, SceneLine, SceneSegment, ScenePoint, Solutions } from '../../renderer/interface.js'

function segmentSolutions(model: GeomModel, v1: string, v2: string): Solutions {
  const p1 = model.points.get(v1)
  const p2 = model.points.get(v2)
  if (p1 && p1.dof === 0 && p2 && p2.dof === 0) return 'one'
  return getLength(model, v1, v2) !== null ? 'one' : 'infinite'
}

export function buildSceneGraph(model: GeomModel): SceneGraph {
  const segments: SceneSegment[] = []
  const points: ScenePoint[] = []
  const lines: SceneLine[] = []

  for (const [name, wl] of model.lines) {
    if (!isWorkingComplete(wl)) continue
    if (wl.resolved.length > 1) {
      const pick = model.solutionPicks.get(name)
      if (pick !== undefined && pick >= 1 && pick <= wl.resolved.length) {
        const s = wl.resolved[pick - 1]!
        lines.push({ a: s.a!, b: s.b!, c: s.c!, label: name, solutions: 'one', freeCoefs: wl.freeCoefs })
      } else {
        wl.resolved.forEach((s, i) => {
          lines.push({ a: s.a!, b: s.b!, c: s.c!, label: name, solutions: 'multiple', solutionIndex: i + 1, freeCoefs: wl.freeCoefs })
        })
      }
    } else {
      const lv = workingVal(wl)
      lines.push({ a: lv.a!, b: lv.b!, c: lv.c!, label: name, solutions: wl.dof === 0 ? 'one' : 'infinite', freeCoefs: wl.freeCoefs })
    }
  }

  // Collect all declared segments
  for (const key of model.segments) {
    const [v1, v2] = key.split(':') as [string, string]
    const wp1 = getPoint(model, v1)
    const wp2 = getPoint(model, v2)
    if (!wp1 || !wp2) continue

    const pt1HasMultiple = wp1.resolved.length > 1
    const pt2HasMultiple = wp2.resolved.length > 1

    if (pt1HasMultiple || pt2HasMultiple) {
      // Emit one segment per combination of solutions for ambiguous endpoints
      const sols1 = pt1HasMultiple ? wp1.resolved : [workingVal(wp1)]
      const sols2 = pt2HasMultiple ? wp2.resolved : [workingVal(wp2)]
      for (const s1 of sols1) {
        for (const s2 of sols2) {
          segments.push({ x1: s1.x!, y1: s1.y!, x2: s2.x!, y2: s2.y!, solutions: 'multiple', label: `${v1}${v2}` })
        }
      }
    } else {
      const pv1 = workingVal(wp1), pv2 = workingVal(wp2)
      segments.push({
        x1: pv1.x!, y1: pv1.y!,
        x2: pv2.x!, y2: pv2.y!,
        solutions: segmentSolutions(model, v1, v2),
        label: `${v1}${v2}`,
      })
    }
  }

  // All points — emit one per solution when multiple exist
  for (const [key, wp] of model.points) {
    if (wp.resolved.length > 1) {
      wp.resolved.forEach((s, i) => {
        points.push({ x: s.x!, y: s.y!, label: key, solutions: 'multiple', solutionIndex: i + 1 })
      })
    } else {
      const pv = workingVal(wp)
      points.push({ x: pv.x!, y: pv.y!, label: key, solutions: wp.dof > 0 ? 'infinite' : 'one' })
    }
  }

  return { segments, points, arcs: [], annotations: [], lines }
}
