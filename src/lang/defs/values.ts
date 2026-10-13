// ─── Values ──────────────────────────────────────────────────────────────────
// What a statement can produce, and what can stand in a slot once worked out.
// Kept apart from evaluation so matching and resolution can talk about values
// without importing the evaluator.

/** A runtime value. Elements are their key in the store; literals are numbers
 *  or text. Definitions with no return type produce `null`. */
export type Value = string | number | Text | null

/** A piece of text. Wrapped rather than a bare string, because a bare string is
 *  already how a value names an element — `"p"` the text and `p` the point have
 *  to stay different things. */
export type Text = { text: string }
export const isText = (v: unknown): v is Text =>
  typeof v === 'object' && v !== null && 'text' in v
