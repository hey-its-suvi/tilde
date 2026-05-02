// ─── Tilde Geometry Primitives ────────────────────────────────────────────────


import { Line } from './types.js'

const EPS = 1e-10

export function isZero(x: number, eps = EPS): boolean {
  return Math.abs(x) < eps
}

export function isEqual(a: number, b: number, eps = EPS): boolean {
  return Math.abs(a - b) < eps
}

// Line-line intersection. Returns null if lines are parallel or identical.
// Solves a₁x + b₁y + c₁ = 0, a₂x + b₂y + c₂ = 0 via Cramer's rule.
export function lineIntersect(l1: Line, l2: Line): { x: number; y: number } | null {
  const det = l1.a * l2.b - l2.a * l1.b
  if (isZero(det)) return null
  return {
    x: (l1.b * l2.c - l2.b * l1.c) / det,
    y: (l2.a * l1.c - l1.a * l2.c) / det,
  }
}

// Two-circle intersection. Returns both solutions ordered CCW-first (solution 1
// is left-of-AB), then CW (solution 2). Returns [] if circles don't intersect.
export function circleIntersectBoth(
  a: { x: number; y: number; dist: number },
  b: { x: number; y: number; dist: number },
): Array<{ x: number; y: number }> {
  const dx = b.x - a.x, dy = b.y - a.y
  const d = Math.sqrt(dx * dx + dy * dy)
  if (isZero(d)) return []
  if (d > a.dist + b.dist + EPS) return []
  if (d < Math.abs(a.dist - b.dist) - EPS) return []

  const A  = (a.dist * a.dist - b.dist * b.dist + d * d) / (2 * d)
  const h  = Math.sqrt(Math.max(0, a.dist * a.dist - A * A))
  const mx = a.x + A * dx / d
  const my = a.y + A * dy / d

  const s1 = { x: mx - h * (dy / d), y: my + h * (dx / d) }  // CCW / left-of-AB
  const s2 = { x: mx + h * (dy / d), y: my - h * (dx / d) }  // CW  / right-of-AB

  if (isZero(h)) return [s1]  // tangent — one unique solution
  return [s1, s2]
}

// Circle-line intersection. Returns both solutions ordered higher-y-first
// (solution 1), or [] if circle doesn't reach the line.
export function circleLineIntersectBoth(
  cx: number, cy: number, r: number,
  line: Line,
): Array<{ x: number; y: number }> {
  const { a, b, c } = line
  const denom = a * a + b * b

  const fx = cx - a * (a * cx + b * cy + c) / denom
  const fy = cy - b * (a * cx + b * cy + c) / denom

  const dist = Math.sqrt((fx - cx) ** 2 + (fy - cy) ** 2)
  if (dist > r + EPS) return []  // circle doesn't reach line

  const h = Math.sqrt(Math.max(0, r * r - dist * dist))
  const len = Math.sqrt(denom)
  const tx = -b / len, ty = a / len

  const p1 = { x: fx + h * tx, y: fy + h * ty }
  const p2 = { x: fx - h * tx, y: fy - h * ty }

  if (isZero(h)) return [p1]  // tangent — one solution

  // Order: higher y first (solution 1); if equal, larger x first
  if (!isEqual(p1.y, p2.y)) return p1.y > p2.y ? [p1, p2] : [p2, p1]
  return p1.x > p2.x ? [p1, p2] : [p2, p1]
}
