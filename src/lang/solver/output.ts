// ─── Tilde Scene Graph Builder ────────────────────────────────────────────────
// Converts a SolveResult into a SceneGraph for the renderer.
// This is solver-agnostic — it only reads the SolveResult interface.

import { SolveResult, ElementResult } from './interface.js'
import { SceneGraph, SceneLine, SceneSegment, ScenePoint, Solutions } from '../../renderer/interface.js'

function solutionsStatus<T>(result: ElementResult<T>): Solutions {
  if (result.solutions.length > 1) return 'multiple'
  if (result.dof > 0) return 'infinite'
  return 'one'
}

export function buildSceneGraph(result: SolveResult): SceneGraph {
  const segments: SceneSegment[] = []
  const points: ScenePoint[] = []
  const lines: SceneLine[] = []

  // Lines (skip anonymous elements created from inline tuples)
  for (const [name, lr] of result.lines) {
    if (name.startsWith('_') || lr.solutions.length === 0) continue
    const status = solutionsStatus(lr)
    if (status === 'multiple') {
      lr.solutions.forEach((s, i) => {
        lines.push({ a: s.a, b: s.b, c: s.c, label: name, solutions: 'multiple', solutionIndex: i + 1 })
      })
    } else {
      const s = lr.solutions[0]!
      lines.push({ a: s.a, b: s.b, c: s.c, label: name, solutions: status })
    }
  }

  // Segments
  for (const key of result.segments) {
    const [v1, v2] = key.split(':') as [string, string]
    const pr1 = result.points.get(v1)
    const pr2 = result.points.get(v2)
    if (!pr1 || !pr2 || pr1.solutions.length === 0 || pr2.solutions.length === 0) continue

    const s1 = solutionsStatus(pr1)
    const s2 = solutionsStatus(pr2)

    if (s1 === 'multiple' || s2 === 'multiple') {
      // Emit one segment per combination of solutions for ambiguous endpoints
      for (const p1 of pr1.solutions) {
        for (const p2 of pr2.solutions) {
          segments.push({ x1: p1.x, y1: p1.y, x2: p2.x, y2: p2.y, solutions: 'multiple', label: `${v1}${v2}` })
        }
      }
    } else {
      const p1 = pr1.solutions[0]!, p2 = pr2.solutions[0]!
      const segStatus: Solutions = (pr1.dof === 0 && pr2.dof === 0) ? 'one' : 'infinite'
      segments.push({ x1: p1.x, y1: p1.y, x2: p2.x, y2: p2.y, solutions: segStatus, label: `${v1}${v2}` })
    }
  }

  // Points (skip anonymous elements created from inline tuples)
  for (const [key, pr] of result.points) {
    if (key.startsWith('_')) continue
    const status = solutionsStatus(pr)
    if (status === 'multiple') {
      pr.solutions.forEach((s, i) => {
        points.push({ x: s.x, y: s.y, label: key, solutions: 'multiple', solutionIndex: i + 1 })
      })
    } else if (pr.solutions.length > 0) {
      const s = pr.solutions[0]!
      points.push({ x: s.x, y: s.y, label: key, solutions: status })
    }
  }

  return { segments, points, arcs: [], annotations: [], lines }
}
