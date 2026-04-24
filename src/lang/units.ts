import { MeasureValue, LengthUnit } from './ast.js'

// Conversion factors to centimetres (the internal base for physical units).
// 'unit' is the abstract tilde unit — no physical meaning, treated as 1:1 with cm
// so that mixing unit-less and unit-ful programs doesn't break anything.
export const TO_CM: Record<LengthUnit, number> = {
  unit:   1,
  cm:     1,
  mm:     0.1,
  m:      100,
  in:     2.54,
  inches: 2.54,
}

/**
 * Convert a parsed MeasureValue to the solver's internal unit.
 *
 * Rules:
 *  - No unit on value, no active unit  → return as-is (pure abstract numbers)
 *  - Unit on value, no active unit     → treat value unit as the active unit (1:1)
 *  - No unit on value, active unit set → treat as being in the active unit (1:1)
 *  - Both present                      → convert: value_unit → cm → active_unit
 */
export function resolveLength(mv: MeasureValue, activeUnit: LengthUnit | null): number {
  const src = (mv.unit as LengthUnit | null) ?? activeUnit
  const dst = activeUnit ?? (mv.unit as LengthUnit | null)

  // No physical units anywhere — pure abstract
  if (src === null || dst === null) return mv.value

  return mv.value * (TO_CM[src] / TO_CM[dst])
}
