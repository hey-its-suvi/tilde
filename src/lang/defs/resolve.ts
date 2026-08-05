// ─── Resolution / dispatch ───────────────────────────────────────────────────
// Picks one definition for one statement. Matching returns every definition
// whose surface shape fits (`p on l` yields both the Line and the Circle `on`);
// resolution settles the choice by consulting the types of the names involved.
// This is the second half of decision 9.
//
// Resolution is per-statement and stateless apart from the symbol table handed
// to it. Driving a whole program — and *filling* that table — belongs to
// evaluation, because what a statement declares is decided by its body, not by
// its signature. `triangle t with a b c` declares four names, and the only way
// to know that is to run `point a`, `point b`, `point c`, `t holds a b c`.

import { matchStatement, type Match } from './match.js'
import type { Definition } from './types.js'

export class ResolutionError extends Error {
  constructor(message: string) {
    super(`[Resolution] ${message}`)
  }
}

/** A name's declared type, by name. Owned and mutated by evaluation. */
export type SymbolTable = Map<string, string>

/** The magic type meaning "this slot is a declaration site" — the token here is
 *  a name being introduced, so it is not expected to be in the table yet. */
export const NAME = 'Name'

/** Render a candidate's surface form, for error messages. */
export const form = (m: Match) =>
  m.def.pattern.map(p => (p.part === 'keyword' ? p.word : `(${p.name}: ${p.type.name})`)).join(' ')

/** The single definition `statement` means, given what is currently declared.
 *  Throws if nothing matches, nothing fits, or more than one fits. */
export function resolveStatement(
  statement: string,
  types: SymbolTable,
  defs: readonly Definition[],
): Match {
  const candidates = matchStatement(statement, defs)
  if (candidates.length === 0) {
    throw new ResolutionError(`no definition matches "${statement}"`)
  }

  const viable = candidates.filter(c => typesFit(c, types))
  const list = (ms: Match[]) => ms.map(form).map(f => `\`${f}\``).join(', ')

  if (viable.length === 0) {
    throw new ResolutionError(
      `no definition of "${statement}" fits the argument types (tried ${list(candidates)})`,
    )
  }
  if (viable.length > 1) {
    throw new ResolutionError(`"${statement}" is ambiguous: ${list(viable)}`)
  }

  return viable[0]!
}

/** Every value slot must be filled by a declared name of a compatible type, or
 *  by a literal the slot accepts. `Name` slots are declaration sites, so their
 *  token need only be an identifier — whether introducing it is legal is
 *  evaluation's call, since only the body knows. */
function typesFit(m: Match, types: SymbolTable): boolean {
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
