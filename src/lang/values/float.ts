// ─── Float arithmetic ─────────────────────────────────────────────────────────
// The first Arith backend: IEEE doubles. Each operation rounds to the nearest
// double, and `below` and `above` step to the neighbouring doubles, so interval
// code can widen a result by one step on each side and still contain the true
// answer.

import type { Arith } from './arith.js'

/** The next double toward minus infinity. Infinity and NaN are returned as they are. */
export function nextDown(x: number): number {
  if (Number.isNaN(x) || x === -Infinity) return x
  if (x === 0) return -Number.MIN_VALUE
  return stepBits(x, x > 0 ? -1n : 1n)
}

/** The next double toward plus infinity. Infinity and NaN are returned as they are. */
export function nextUp(x: number): number {
  if (Number.isNaN(x) || x === Infinity) return x
  if (x === 0) return Number.MIN_VALUE
  return stepBits(x, x > 0 ? 1n : -1n)
}

// Adjacent doubles differ by one in their bit pattern, so stepping the bits
// steps the value (for magnitudes, away from or toward zero depending on sign).
function stepBits(x: number, step: bigint): number {
  const view = new DataView(new ArrayBuffer(8))
  view.setFloat64(0, x)
  view.setBigUint64(0, view.getBigUint64(0) + step)
  return view.getFloat64(0)
}

export const floatArith: Arith<number> = {
  fromNumber: n => n,
  add: (a, b) => a + b,
  sub: (a, b) => a - b,
  mul: (a, b) => a * b,
  div: (a, b) => a / b,
  sqrt: a => Math.sqrt(a),
  compare: (a, b) => (a < b ? -1 : a > b ? 1 : 0),
  below: nextDown,
  above: nextUp,
}
