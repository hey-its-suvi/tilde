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

import { lexHeader } from './lexer.js'
import { matchStatement, type Match } from './match.js'
import type { TypeMap } from './modules.js'
import type { Definition } from './types.js'

export class ResolutionError extends Error {
  constructor(message: string) {
    super(`[Resolution] ${message}`)
  }
}

/** A name's declared type, by name. Owned and mutated by evaluation. */
export type SymbolTable = Map<string, string>

/** Element key → its fields → the key each references. A field always points at
 *  a whole element, so following one hands back something the rest of the
 *  language already knows how to use. */
export type Parts = Map<string, Map<string, string>>

/** Name → the element key it stands for. Almost always identity: a name *is*
 *  its key until something gives a second name to the same element. `is` is what
 *  makes them differ, so `a` and `t.a` can be one box under two names. */
export type Aliases = Map<string, string>

/** Everything resolution needs to know about what exists. */
export type Store = {
  types: SymbolTable
  parts: Parts
  decls: TypeMap
  aliases: Aliases
}

/** The element key a name stands for. */
export const keyOf = (name: string, store: Store): string => store.aliases.get(name) ?? name

/** Follow a possibly-dotted name to the element it names. `t.a` looks up `t`,
 *  finds its type's field `a`, and hands back the key that field references —
 *  so from there on it is an ordinary element like any other. */
export function resolvePath(name: string, store: Store): { key: string; type: string } | null {
  const [head, ...fields] = name.split('.')
  let key = keyOf(head!, store)
  let type = store.types.get(key)
  if (type === undefined) return null

  for (const field of fields) {
    const decl = store.decls.get(type)
    if (decl === undefined) return null
    if (!decl.fields.some(f => f.name === field)) return null
    const next = store.parts.get(key)?.get(field)
    if (next === undefined) return null
    const nextType = store.types.get(next)
    if (nextType === undefined) return null
    key = next
    type = nextType
  }
  return { key, type }
}

/** Why a dotted name did not resolve. Only called once something has failed, so
 *  it can afford to re-walk the path and report the first thing that broke. */
function pathProblem(name: string, store: Store): string | null {
  const [head, ...fields] = name.split('.')
  if (fields.length === 0) return null // not a path; ordinary "not declared"

  let key = keyOf(head!, store)
  let type = store.types.get(key)
  if (type === undefined) return `"${head}" is not declared`

  for (const field of fields) {
    const decl = store.decls.get(type)
    if (decl === undefined) return `${type} has no fields, so "${key}.${field}" means nothing`
    const declared = decl.fields.find(f => f.name === field)
    if (declared === undefined) {
      const known = decl.fields.map(f => f.name).join(', ')
      return `${type} has no field "${field}" (it has ${known})`
    }
    const next = store.parts.get(key)?.get(field)
    if (next === undefined) return `"${key}" was made without setting its "${field}"`
    key = next
    type = store.types.get(next) ?? type
  }
  return null
}

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
  store: Store,
  defs: readonly Definition[],
): Match {
  // A broken path deserves to say so, rather than surfacing as "nothing fits".
  for (const token of lexHeader(statement, 0)) {
    if (token.kind !== 'WORD' || !token.value.includes('.')) continue
    const problem = pathProblem(token.value, store)
    if (problem !== null) throw new ResolutionError(problem)
  }

  const candidates = matchStatement(statement, defs)
  if (candidates.length === 0) {
    throw new ResolutionError(`no definition matches "${statement}"`)
  }

  const viable = candidates.filter(c => typesFit(c, store))
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
function typesFit(m: Match, store: Store): boolean {
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
    const found = resolvePath(b.token.value, store)
    if (found === null) return false
    if (!compatible(found.type, b.type.name)) return false
  }
  return true
}

/** The top type: a slot written `(x: Any)` takes an element of any kind. Needed
 *  by definitions that operate on a thing without caring what it is — `call`
 *  gives a second name to anything. Use sparingly: an `Any` slot matches every
 *  candidate, so it makes ambiguity easier to reach. */
export const ANY = 'Any'

/** Type compatibility. Exact-match apart from `Any` — real subtyping
 *  (`Square <: Polygon`) is deferred until there is a hierarchy to model. */
function compatible(actual: string, expected: string): boolean {
  return expected === ANY || actual === expected
}
