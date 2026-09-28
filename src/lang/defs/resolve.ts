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
import type { Key, Scope } from './scope.js'
import type { DataStore } from './data.js'

export class ResolutionError extends Error {
  constructor(message: string) {
    super(`[Resolution] ${message}`)
  }
}

/** Which call a local belongs to, and what it was called there — so a local used
 *  after its call has returned can be refused with a useful message. */
export type Owned = { call: number; local: string; def: string }

/** Everything resolution needs to know about what exists. */
export type Store = {
  /** Every element made so far, with its type and fields. */
  data: DataStore
  decls: TypeMap
  /** The program's labels: every name a program has given something. */
  globals: Scope
  /** Locals, by the name their call gave them, with the call that owns them.
   *  One leaves this map when its call returns it — returning is how a local
   *  escapes. */
  owned: Map<string, Owned>
  /** Calls currently running, innermost last. A local is usable only while its
   *  call is among them. */
  frames: number[]
}

/** The key a word stands for: the element a label points at, or — when a key
 *  was written into a statement, as a slot's value or a bracket's result — that
 *  key itself. Undefined when it is neither. */
export const keyOf = (word: string, store: Store): Key | undefined =>
  store.globals.get(word) ?? store.data.key(word)

/** Follow a possibly-dotted name to the element it names: look the first part up,
 *  then each next part in the scope of what was found. `t.point1` is `t`, then
 *  `point1` among `t`'s fields — from there on an ordinary element like any other. */
export function resolvePath(name: string, store: Store): { key: Key; type: string } | null {
  const [head, ...fields] = name.split('.')
  const root = keyOf(head!, store)
  if (root === undefined) return null
  let key: Key = root
  let type = store.data.typeOf(key)
  if (type === undefined) return null

  for (const field of fields) {
    const next = store.data.get(key)?.scope.get(field)
    if (next === undefined) return null
    const nextType = store.data.typeOf(next)
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

  const root = keyOf(head!, store)
  if (root === undefined) return `"${head}" is not declared`
  let key: Key = root
  let type = store.data.typeOf(key)!
  let path = head!

  for (const field of fields) {
    const decl = store.decls.get(type)
    if (decl === undefined) return `${type} has no fields, so "${path}.${field}" means nothing`
    const next = store.data.get(key)?.scope.get(field)
    if (next === undefined) {
      const known = decl.fields.map(f => f.name).join(', ')
      return `${type} has no field "${field}" (it has ${known})`
    }
    key = next
    type = store.data.typeOf(next)!
    path = `${path}.${field}`
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
  for (const token of lexHeader(statement, 0)) {
    if (token.kind !== 'WORD') continue

    // A definition's local names end when it returns. Its shapes live on — the
    // drawing may depend on them — but nothing outside can name them again.
    const head = token.value.split('.')[0]!
    const owner = store.owned.get(head)
    if (owner !== undefined && !store.frames.includes(owner.call)) {
      throw new ResolutionError(
        `"${owner.local}" was local to \`${owner.def}\` and ended when it returned` +
          ` — to reach it from outside, return it or make it a field`,
      )
    }

    // A broken path deserves to say so, rather than surfacing as "nothing fits".
    if (!token.value.includes('.')) continue
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
      // A numeric literal is a Scalar, so it fills a Scalar slot or an Any one.
      if (b.type.name !== 'Scalar' && b.type.name !== ANY) return false
      continue
    }
    if (b.token.kind === 'STRING') {
      if (b.type.name !== 'Text' && b.type.name !== ANY) return false
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
