// ─── Values ──────────────────────────────────────────────────────────────────
// What a statement can produce, and what can stand in a slot once worked out.
// Kept apart from evaluation so matching and resolution can talk about values
// without importing the evaluator.

import type { Scalar } from '../values/scalar.js'

/** A runtime value. Elements are their key in the store; literals are numbers
 *  or text; a scalar is a set of values. Definitions with no return type produce
 *  `null`. */
export type Value = string | number | Text | ScalarValue | null

/** A set of possible values, from the value layer. Wrapped for the same reason
 *  as text: a bare array is not a value this language has. */
export type ScalarValue = { scalar: Scalar }
export const isScalarValue = (v: unknown): v is ScalarValue =>
  typeof v === 'object' && v !== null && 'scalar' in v

/** A piece of text. Wrapped rather than a bare string, because a bare string is
 *  already how a value names an element — `"p"` the text and `p` the point have
 *  to stay different things. */
export type Text = { text: string }
export const isText = (v: unknown): v is Text =>
  typeof v === 'object' && v !== null && 'text' in v
