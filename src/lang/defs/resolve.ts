// ─── Resolution / dispatch ───────────────────────────────────────────────────
// Turns a program's statements into a single chosen definition each, using
// types to settle the candidate sets the matcher produces. This is the second
// half of decision 9.
//
// The language is declaration-before-use: a name's *type* must be known before
// the name is used. (Its *value* is a separate matter — that stays the solver's
// job; a line can be declared with unknown coefficients and used immediately.)
// So a single forward pass over the statements suffices: each declaration adds
// to the symbol table, and each use reads it.
//
// A name's type comes from the definition that declared it: the first `Name`
// slot of a definition is declared with the definition's return type
// (`point (n: Name) => Point` gives `n: Point`). Definitions with more than one
// `Name` slot (only `triangle` today) need their bodies expanded to type the
// extra names, which is the evaluation slice — flagged clearly until then.
//
// Resolution does *not* expand bodies or emit constraints. It dispatches, builds
// the symbol table, and type-checks. Producing constraints is evaluation.

import { matchStatement, type Binding, type Match } from './match.js'
import type { Definition } from './types.js'

export class ResolutionError extends Error {
  constructor(message: string) {
    super(`[Resolution] ${message}`)
  }
}

export type ResolvedStatement = {
  statement: string
  def: Definition
  bindings: Binding[]
}

export type ResolveResult = {
  statements: ResolvedStatement[]
  /** Final symbol table: name → type name. */
  types: Map<string, string>
}

const NAME = 'Name'

/** Render a candidate's surface form, for error messages. */
const form = (m: Match) =>
  m.def.pattern.map(p => (p.part === 'keyword' ? p.word : `(${p.name}: ${p.type.name})`)).join(' ')

export function resolveProgram(
  statements: readonly string[],
  defs: readonly Definition[],
): ResolveResult {
  const types = new Map<string, string>()
  const resolved: ResolvedStatement[] = []

  for (const statement of statements) {
    const candidates = matchStatement(statement, defs)
    if (candidates.length === 0) {
      throw new ResolutionError(`no definition matches "${statement}"`)
    }

    const viable = candidates.filter(c => typesFit(c, types))
    if (viable.length === 0) {
      throw new ResolutionError(
        `no definition of "${statement}" fits the argument types` +
          ` (tried ${candidates.map(form).map(f => `\`${f}\``).join(', ')})`,
      )
    }
    if (viable.length > 1) {
      throw new ResolutionError(
        `"${statement}" is ambiguous: ${viable.map(form).map(f => `\`${f}\``).join(', ')}`,
      )
    }

    const chosen = viable[0]!
    declare(chosen, types)
    resolved.push({ statement, def: chosen.def, bindings: chosen.bindings })
  }

  return { statements: resolved, types }
}

/** Every value slot must be filled by a known name of a compatible type, or by
 *  a literal the slot accepts. `Name` slots are declaration sites — checked at
 *  declare time, not here — but their token must be an identifier. */
function typesFit(m: Match, types: Map<string, string>): boolean {
  for (const b of m.bindings) {
    if (b.type.name === NAME) {
      if (b.token.kind !== 'WORD') return false
      continue
    }
    if (b.token.kind === 'NUMBER') {
      // A numeric literal fills only a Scalar slot.
      if (b.type.name !== 'Scalar') return false
      continue
    }
    // A name reference: must be declared, with a compatible type.
    const actual = types.get(b.token.value)
    if (actual === undefined) return false
    if (!compatible(actual, b.type.name)) return false
  }
  return true
}

/** Type compatibility. Exact-match for now — subtyping (`Square <: Polygon`) is
 *  deferred until there is a hierarchy to model. */
function compatible(actual: string, expected: string): boolean {
  return actual === expected
}

/** Apply a resolved statement's declarations to the symbol table. */
function declare(m: Match, types: Map<string, string>): void {
  const nameSlots = m.bindings.filter(b => b.type.name === NAME)
  if (nameSlots.length === 0) return

  if (nameSlots.length > 1) {
    throw new ResolutionError(
      `\`${form(m)}\` declares ${nameSlots.length} names; typing the extra ones` +
        ` needs body expansion (the evaluation slice), not yet implemented`,
    )
  }

  const subject = nameSlots[0]!
  const name = subject.token.value

  if (types.has(name)) {
    throw new ResolutionError(`"${name}" is already declared`)
  }
  if (m.def.returns === null) {
    throw new ResolutionError(`a declaring form must return a type, but \`${form(m)}\` returns nothing`)
  }

  types.set(name, m.def.returns.name)
}
