// ─── Tilde GeomModel ──────────────────────────────────────────────────────────

import { LengthUnit, ShapeKind } from '../ast.js'
import {
  WorkingPoint, WorkingLine, WorkingCircle, WorkingScalar,
  makeWorkingPoint, makeWorkingLine,
} from './types.js'

export type RegisteredShape = { kind: ShapeKind; vertexCount: number }

export type GeomModel = {
  points:       Map<string, WorkingPoint>
  segments:     Set<string>                              // canonical keys of all declared segments
  lengths:      Map<string, number | null>               // null = unknown
  angles:       Map<string, number | null>               // degrees, null = unknown
  lines:        Map<string, WorkingLine>                 // named lines
  circles:      Map<string, WorkingCircle>               // named circles
  shapes:       Map<string, RegisteredShape>             // named shapes (subscript mode)
  onLine:       Map<string, string[]>                    // vertex name → line names (supports 2+ for intersection)
  onCircle:     Map<string, string[]>                    // vertex name → circle names
  onSegment:    Map<string, { v1: string; v2: string }>  // vertex name → segment endpoints
  lineParallel:       Map<string, Array<{ other: string; distance?: number }>>  // line → parallel partners
  linePerpendicular:  Map<string, string[]>              // line → perpendicular partners
  scalars:      Map<string, WorkingScalar>                // named scalars
  scalarBindings: Array<{ scalar: string; element: string; field: string }>  // scalar ← element.field
  solutionPicks: Map<string, number>                     // vertex name → 1-based solution index
  activeUnit:   LengthUnit | null                        // null = pure abstract (no units used)
}

export function makeModel(): GeomModel {
  return {
    points: new Map(), segments: new Set(),
    lengths: new Map(), angles: new Map(),
    lines: new Map(), circles: new Map(), shapes: new Map(),
    onLine: new Map(), onCircle: new Map(), onSegment: new Map(),
    lineParallel: new Map(), linePerpendicular: new Map(),
    scalars: new Map(), scalarBindings: [],
    solutionPicks: new Map(),
    activeUnit: null,
  }
}

/** Deep-clone a model. Used by strategies that want to mutate scratch state
 *  without touching the caller's model. */
export function cloneModel(m: GeomModel): GeomModel {
  const cloneWorking = (w: { resolved: Array<Record<string, unknown> | number | null>; dof: number }) => ({
    resolved: w.resolved.map(r => r === null || typeof r === 'number' ? r : { ...r }),
    dof: w.dof,
  })
  return {
    points: new Map([...m.points].map(([k, v]) => [k, cloneWorking(v) as WorkingPoint])),
    segments: new Set(m.segments),
    lengths: new Map(m.lengths),
    angles: new Map(m.angles),
    lines: new Map([...m.lines].map(([k, v]) => [k, cloneWorking(v) as WorkingLine])),
    circles: new Map([...m.circles].map(([k, v]) => [k, cloneWorking(v) as WorkingCircle])),
    shapes: new Map(m.shapes),
    onLine: new Map([...m.onLine].map(([k, v]) => [k, [...v]])),
    onCircle: new Map([...m.onCircle].map(([k, v]) => [k, [...v]])),
    onSegment: new Map(m.onSegment),
    lineParallel: new Map([...m.lineParallel].map(([k, v]) => [k, v.map(p => ({ ...p }))])),
    linePerpendicular: new Map([...m.linePerpendicular].map(([k, v]) => [k, [...v]])),
    scalars: new Map([...m.scalars].map(([k, v]) => [k, cloneWorking(v) as WorkingScalar])),
    scalarBindings: m.scalarBindings.map(b => ({ ...b })),
    solutionPicks: new Map(m.solutionPicks),
    activeUnit: m.activeUnit,
  }
}

// ─── Point helpers ────────────────────────────────────────────────────────────

export function touchPoint(model: GeomModel, key: string): WorkingPoint {
  if (!model.points.has(key)) {
    model.points.set(key, makeWorkingPoint())
  }
  return model.points.get(key)!
}

/** Place a point at (x, y).  dof=0 means uniquely determined; dof>0 means
 *  the position was chosen canonically and the element remains underconstrained. */
export function setPoint(model: GeomModel, key: string, x: number, y: number, dof: number) {
  const wp = touchPoint(model, key)
  wp.resolved[0] = { x, y }
  wp.dof = dof
}

/** Set one or both axes of a point. Nullable per-axis — used for partial
 *  declarations like `point p = (5,)`. `dof` is the count of axes still null. */
export function setPointPartial(model: GeomModel, key: string, x: number | null, y: number | null) {
  const wp = touchPoint(model, key)
  wp.resolved[0] = { x, y }
  wp.dof = (x === null ? 1 : 0) + (y === null ? 1 : 0)
}

export function getPoint(model: GeomModel, key: string): WorkingPoint | null {
  return model.points.get(key) ?? null
}

/** Synthesise an axis-aligned line that captures a partial point declaration
 *  like `point p = (5,)`. The point is added to the synthetic line's on-line
 *  list so propagate's existing line∩line / circle∩line / line-completion
 *  rules pick it up — no partial-point-specific propagate rules needed.
 *
 *  Underscore-prefixed names are filtered from the rendered scene. */
export function synthesizeAxisLine(
  model: GeomModel,
  pointKey: string,
  axis: 'x' | 'y',
  value: number,
): void {
  const name = `_axis_${pointKey}_${axis}`
  if (!model.lines.has(name)) {
    // x = value  ⇒  1·x + 0·y − value = 0  → (a, b, c) = (1, 0, −value)
    // y = value  ⇒  0·x + 1·y − value = 0  → (a, b, c) = (0, 1, −value)
    const a = axis === 'x' ? 1 : 0
    const b = axis === 'x' ? 0 : 1
    const c = -value
    model.lines.set(name, makeWorkingLine(a, b, c))
  }
  const existing = model.onLine.get(pointKey) ?? []
  if (!existing.includes(name)) {
    model.onLine.set(pointKey, [...existing, name])
  }
}

// ─── Segment helpers ──────────────────────────────────────────────────────────

export function segKey(v1: string, v2: string): string {
  return v1 < v2 ? `${v1}:${v2}` : `${v2}:${v1}`
}

export function setLength(model: GeomModel, v1: string, v2: string, len: number) {
  model.lengths.set(segKey(v1, v2), len)
}

export function getLength(model: GeomModel, v1: string, v2: string): number | null {
  return model.lengths.get(segKey(v1, v2)) ?? null
}

// ─── Angle helpers ────────────────────────────────────────────────────────────

export function angleKey(v1: string, vertex: string, v3: string): string {
  const a = v1 < v3 ? v1 : v3
  const b = v1 < v3 ? v3 : v1
  return `${a}:${vertex}:${b}`
}

export function setAngle(model: GeomModel, v1: string, vertex: string, v3: string, deg: number) {
  model.angles.set(angleKey(v1, vertex, v3), deg)
}

export function getAngle(model: GeomModel, v1: string, vertex: string, v3: string): number | null {
  return model.angles.get(angleKey(v1, vertex, v3)) ?? null
}

