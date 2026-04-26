// ─── Tilde GeomModel ──────────────────────────────────────────────────────────
// Points always have coordinates — the solver picks a representative position
// for underconstrained things. `free` drives squiggle vs crisp rendering.

import { LengthUnit } from '../ast.js'

export type GeomPoint = {
  x: number
  y: number
  free: boolean          // true = underconstrained (infinite solutions)
  allSolutions?: Array<{ x: number; y: number }>  // set when multiple discrete solutions exist
}

export type GeomLine = { a: number; b: number; c: number }  // ax + by + c = 0

export type GeomModel = {
  points:     Map<string, GeomPoint>
  segments:   Set<string>                          // canonical keys of all declared segments
  lengths:    Map<string, number | null>           // null = unknown
  angles:     Map<string, number | null>           // degrees, null = unknown
  lines:      Map<string, GeomLine>                // named lines
  onLine:     Map<string, string[]>                // vertex name → line names (supports 2+ for intersection)
  onSegment:    Map<string, { v1: string; v2: string }>  // vertex name → segment endpoints
  solutionPicks: Map<string, number>                     // vertex name → 1-based solution index
  anchorKey: string | null
  activeUnit: LengthUnit | null                          // null = pure abstract (no units used)
}

export function makeModel(): GeomModel {
  return {
    points: new Map(), segments: new Set(),
    lengths: new Map(), angles: new Map(),
    lines: new Map(), onLine: new Map(), onSegment: new Map(),
    solutionPicks: new Map(),
    anchorKey: null,
    activeUnit: null,
  }
}

// ─── Point helpers ────────────────────────────────────────────────────────────

export function touchPoint(model: GeomModel, key: string): GeomPoint {
  if (!model.points.has(key)) {
    model.points.set(key, { x: 0, y: 0, free: true })
  }
  return model.points.get(key)!
}

export function setPoint(model: GeomModel, key: string, x: number, y: number, free: boolean) {
  const pt = touchPoint(model, key)
  pt.x = x; pt.y = y; pt.free = free
}

export function getPoint(model: GeomModel, key: string): GeomPoint | null {
  return model.points.get(key) ?? null
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

// ─── Solutions (for renderer) ─────────────────────────────────────────────────

export type Solutions = 'one' | 'multiple' | 'infinite'

export function segmentSolutions(model: GeomModel, v1: string, v2: string): Solutions {
  const p1 = model.points.get(v1)
  const p2 = model.points.get(v2)
  if (p1 && !p1.free && p2 && !p2.free) return 'one'
  return getLength(model, v1, v2) !== null ? 'one' : 'infinite'
}
