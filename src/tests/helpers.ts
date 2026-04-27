// ─── Tilde Test Helpers ───────────────────────────────────────────────────────

import { lex } from '@lang/lexer.js'
import { parse } from '@lang/parser.js'
import { solve } from '@lang/solver/index.js'
import { SceneGraph, Solutions } from '@renderer/interface.js'

export function run(source: string): SceneGraph {
  return solve(parse(lex(source))).scene
}

export function assertPointExists(scene: SceneGraph, label: string): void {
  const found = scene.points.some(p => p.label === label)
  if (!found) {
    throw new Error(`assertPointExists: point "${label}" not found\n  points: [${scene.points.map(p => p.label).join(', ')}]`)
  }
}

export function assertPoint(scene: SceneGraph, label: string, solutions: Solutions): void {
  const pt = scene.points.find(p => p.label === label)
  if (!pt) {
    throw new Error(`assertPoint: point "${label}" not found\n  points: [${scene.points.map(p => p.label).join(', ')}]`)
  }
  if (pt.solutions !== solutions) {
    throw new Error(`assertPoint: "${label}" has solutions "${pt.solutions}", expected "${solutions}"`)
  }
}

export function assertPointAt(scene: SceneGraph, label: string, x: number, y: number, epsilon = 1e-9): void {
  const pt = scene.points.find(p => p.label === label)
  if (!pt) {
    throw new Error(`assertPointAt: point "${label}" not found\n  points: [${scene.points.map(p => p.label).join(', ')}]`)
  }
  if (pt.solutions !== 'one') {
    throw new Error(`assertPointAt: "${label}" has solutions "${pt.solutions}", expected "one" (point must be placed)`)
  }
  const dx = Math.abs(pt.x - x)
  const dy = Math.abs(pt.y - y)
  if (dx > epsilon || dy > epsilon) {
    throw new Error(`assertPointAt: "${label}" is at (${pt.x}, ${pt.y}), expected (${x}, ${y})`)
  }
}

// Segment label in the SceneGraph is the sorted alphabetical join of the two vertex keys
// (matching how segKey sorts them before building the label).
export function assertSegment(scene: SceneGraph, v1: string, v2: string): void {
  const label = [v1, v2].sort().join('')
  const found = scene.segments.some(s => s.label === label)
  if (!found) {
    throw new Error(`assertSegment: segment "${label}" not found\n  segments: [${scene.segments.map(s => s.label).join(', ')}]`)
  }
}

export function assertSegmentLength(scene: SceneGraph, v1: string, v2: string, expected: number, epsilon = 1e-9): void {
  assertSegment(scene, v1, v2)
  const p1 = scene.points.find(p => p.label === v1)
  const p2 = scene.points.find(p => p.label === v2)
  if (!p1) throw new Error(`assertSegmentLength: endpoint "${v1}" not found`)
  if (!p2) throw new Error(`assertSegmentLength: endpoint "${v2}" not found`)
  const actual = Math.sqrt((p1.x - p2.x) ** 2 + (p1.y - p2.y) ** 2)
  if (Math.abs(actual - expected) > epsilon) {
    throw new Error(`assertSegmentLength: segment "${v1}${v2}" has length ${actual}, expected ${expected}`)
  }
}

export function assertThrows(source: string, expectedMessage?: string): void {
  let threw = false
  try {
    run(source)
  } catch (e) {
    threw = true
    if (expectedMessage !== undefined) {
      const msg = e instanceof Error ? e.message : String(e)
      if (!msg.includes(expectedMessage)) {
        throw new Error(`assertThrows: expected message to contain "${expectedMessage}"\n  got: "${msg}"`)
      }
    }
  }
  if (!threw) {
    throw new Error(`assertThrows: expected source to throw but it did not`)
  }
}
