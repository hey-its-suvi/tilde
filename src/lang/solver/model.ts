// ─── Tilde GeomModel ──────────────────────────────────────────────────────────

import { LengthUnit, ShapeKind } from '../ast.js'
import {
  WorkingPoint, WorkingLine,
  makeWorkingPoint,
} from './geom.js'

export type RegisteredShape = { kind: ShapeKind; vertexCount: number }

export type GeomModel = {
  points:       Map<string, WorkingPoint>
  segments:     Set<string>                              // canonical keys of all declared segments
  lengths:      Map<string, number | null>               // null = unknown
  angles:       Map<string, number | null>               // degrees, null = unknown
  lines:        Map<string, WorkingLine>                 // named lines
  shapes:       Map<string, RegisteredShape>             // named shapes (subscript mode)
  onLine:       Map<string, string[]>                    // vertex name → line names (supports 2+ for intersection)
  onSegment:    Map<string, { v1: string; v2: string }>  // vertex name → segment endpoints
  solutionPicks: Map<string, number>                     // vertex name → 1-based solution index
  anchorKey:    string | null
  activeUnit:   LengthUnit | null                        // null = pure abstract (no units used)
}

export function makeModel(): GeomModel {
  return {
    points: new Map(), segments: new Set(),
    lengths: new Map(), angles: new Map(),
    lines: new Map(), shapes: new Map(), onLine: new Map(), onSegment: new Map(),
    solutionPicks: new Map(),
    anchorKey: null,
    activeUnit: null,
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

export function getPoint(model: GeomModel, key: string): WorkingPoint | null {
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

