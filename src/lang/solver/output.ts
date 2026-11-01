// ─── Tilde Scene Graph Builder ────────────────────────────────────────────────
// Converts a SolveResult into a SceneGraph for the renderer.
// This is solver-agnostic — it only reads the SolveResult interface.
//
// Every field crossing the solver boundary is a Scalar. A singleton draws;
// anything else — a genuine range, a discrete union of more than one value,
// or fully unknown — doesn't. Drawing one point per combination of
// discrete-valued fields would need each solution kept as a whole, correlated
// element, which isn't built yet (see plans/interval-backend.md), so a
// multi-valued field is treated the same as any other non-singleton, for now.

import { SolveResult } from './interface.js'
import { singleValue } from '../values/scalar.js'
import { SceneGraph, SceneLine, SceneCircle, SceneSegment, ScenePoint, SceneScalar } from '../../renderer/interface.js'

/** Element key → what to call it on screen. A key is not what the user typed:
 *  a point is keyed `Point#1` while the program called it `a`, and the drawing
 *  should say what was written. Without a map, keys are shown as they are. */
export type Labels = ReadonlyMap<string, string>

const labelFor = (key: string, labels?: Labels) => labels?.get(key) ?? key

/** Not drawn: something with no label when there are labels to go by, and
 *  anything the language made for itself (a label starting with `_`). */
const hidden = (key: string, labels?: Labels) =>
  (labels !== undefined && !labels.has(key)) || labelFor(key, labels).startsWith('_')

export function buildSceneGraph(result: SolveResult, labels?: Labels): SceneGraph {
  const segments: SceneSegment[] = []
  const points: ScenePoint[] = []
  const lines: SceneLine[] = []
  const circles: SceneCircle[] = []

  // Lines (skip anonymous elements created from inline tuples)
  for (const [name, l] of result.lines) {
    if (hidden(name, labels)) continue
    const a = singleValue(l.a), b = singleValue(l.b), c = singleValue(l.c)
    if (a === undefined || b === undefined || c === undefined) continue
    lines.push({ a, b, c, label: labelFor(name, labels), solutions: 'one' })
  }

  // Segments
  for (const key of result.segments) {
    const [v1, v2] = key.split(':') as [string, string]
    const p1 = result.points.get(v1)
    const p2 = result.points.get(v2)
    if (!p1 || !p2) continue
    const x1 = singleValue(p1.x), y1 = singleValue(p1.y)
    const x2 = singleValue(p2.x), y2 = singleValue(p2.y)
    if (x1 === undefined || y1 === undefined || x2 === undefined || y2 === undefined) continue
    segments.push({ x1, y1, x2, y2, solutions: 'one', label: segLabel(v1, v2, labels) })
  }

  // Circles (skip anonymous synthesised circles)
  for (const [name, c] of result.circles) {
    if (hidden(name, labels)) continue
    const r = singleValue(c.r)
    if (r === undefined || c.center === null) continue
    const centerP = result.points.get(c.center)
    if (!centerP) continue
    const cx = singleValue(centerP.x), cy = singleValue(centerP.y)
    if (cx === undefined || cy === undefined) continue
    circles.push({ cx, cy, r, label: labelFor(name, labels), solutions: 'one' })
  }

  // Points (skip anonymous elements created from inline tuples)
  for (const [key, p] of result.points) {
    if (hidden(key, labels)) continue
    const x = singleValue(p.x), y = singleValue(p.y)
    if (x === undefined || y === undefined) continue
    points.push({ x, y, label: labelFor(key, labels), solutions: 'one' })
  }

  // Scalars
  const scalars: SceneScalar[] = []
  for (const [name, s] of result.scalars) {
    const v = singleValue(s)
    if (v !== undefined) scalars.push({ label: labelFor(name, labels), value: v })
  }

  return { segments, points, arcs: [], annotations: [], lines, circles, scalars }
}

/** A segment reads as its two endpoints joined: `ab`, the classical notation.
 *  A dotted path has to be separated or `t.a` and `t.b` run together into the
 *  unreadable `t.at.b` — but only then, so ordinary names keep the plain form. */
function segLabel(v1: string, v2: string, labels?: Labels): string {
  const a = labelFor(v1, labels)
  const b = labelFor(v2, labels)
  return a.includes('.') || b.includes('.') ? `${a}–${b}` : `${a}${b}`
}
