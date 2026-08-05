// ─── Definition types ────────────────────────────────────────────────────────
// A definition is a surface pattern, an optional return type, and a body.
// The pattern is a flat sequence of keywords and typed slots — no optionals,
// no repetition. Variants that used to need those (`l parallel m at 3`) are
// written as separate definitions instead, and comma-lists are handled by the
// distribution rule at the statement level rather than inside a pattern.

/** A type as written in a signature: `Line`, `Name`, `[Point]`. */
export type TypeRef = {
  name: string
  /** true for `[Point]` — a slot taking a list rather than one value. */
  list: boolean
}

export type PatternPart =
  /** A fixed word the user types: `parallel`, `with`, `center`. */
  | { part: 'keyword'; word: string }
  /** Captures one value: `(a: Line)`. */
  | { part: 'slot'; name: string; type: TypeRef }

export type Pattern = PatternPart[]

/** A body is either TypeScript behind the `tsx` hatch, or Tilde statements
 *  composed from other definitions. Statements stay raw text for now — parsing
 *  them needs the definition table this pass is building. */
export type Body =
  | { body: 'tsx'; code: string }
  | { body: 'tilde'; lines: string[] }

export type Definition = {
  pattern: Pattern
  /** null when a definition returns nothing. */
  returns: TypeRef | null
  body: Body
  /** 1-based line of the `define` keyword, for error messages. */
  line: number
}

/** One `import x` / `export import x` line, unresolved. */
export type Import = {
  /** Module name as written. */
  name: string
  /** `export import x` — passed on to files that import this one. Plain
   *  `import` is private: it makes the module usable here and nowhere else. */
  reexport: boolean
  /** 1-based line, for error messages. */
  line: number
}

/** A statement at column 0 — a line of the program rather than a definition. */
export type Statement = {
  text: string
  /** 1-based line, for error messages. */
  line: number
}

/** A definition's surface signature: keywords and slot *types*, with slot names
 *  dropped. Two definitions with the same signature are the same definition as
 *  far as dispatch is concerned, whatever their slots are called. Used to let a
 *  file's own definitions shadow the ones it imports. */
export const signature = (pattern: Pattern): string =>
  pattern
    .map(p => (p.part === 'keyword' ? p.word : `«${p.type.name}${p.type.list ? '...' : ''}»`))
    .join(' ')

export class DefinitionError extends Error {
  constructor(message: string, readonly line: number) {
    super(`[line ${line}] ${message}`)
  }
}
