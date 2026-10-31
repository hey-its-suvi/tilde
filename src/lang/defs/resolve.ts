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

import { matchStatement, piecesOf, showPieces, literalType, callTypes, type Match, type Piece } from './match.js'
import type { ScalarValue, Text, Value } from './values.js'
import type { TypeMap } from './modules.js'
import { typeText, type Definition } from './types.js'
import type { Key, Scope } from './scope.js'
import type { DataStore } from './data.js'

export class ResolutionError extends Error {
  constructor(message: string) {
    super(`[Resolution] ${message}`)
  }
}

/** Where names are looked up while something runs: the program's own frame, or
 *  one call's. A call's frame starts with its element slots and gains whatever
 *  names its body gives things; it ends when the call returns. */
export type Frame = {
  id: number
  labels: Scope
  form: string
  /** The definition's slot names. Labels with these names are its parameters,
   *  not names its body made, so they never count as locals that ended. */
  slots: ReadonlySet<string>
  /** Parameters that are not elements, by slot name: a number or text the
   *  caller passed, or the word it wrote in a `Name` or `Type` slot. A body line
   *  is read with these in place of the slot's name — never written into it. */
  params: ReadonlyMap<string, Param>
}

/** A parameter that is not an element. */
export type Param =
  | { kind: 'value'; value: number | Text | ScalarValue }
  | { kind: 'word'; word: string }

/** Everything resolution needs to know about what exists. */
export type Store = {
  /** Every element made so far, with its type and fields. */
  data: DataStore
  decls: TypeMap
  /** The program's labels — frame 0's. */
  globals: Scope
  /** The frame names are looked up in now. */
  current: Frame
  /** Frames that have ended, kept only to say so when one of their names is
   *  used from outside. */
  ended: Frame[]
}

/** The key a word stands for, in the frame running now. */
export function keyOf(word: string, store: Store): Key | undefined {
  return store.current.labels.get(word)
}

/** The words written in a line, skipping values. */
const wordsOf = (pieces: readonly Piece[]) =>
  pieces.flatMap(p => (p.kind === 'word' && p.token.kind === 'WORD' ? [p.token.value] : []))

/** If `word` was a name in a call that has returned, say so: that is almost
 *  certainly what went wrong, and "nothing fits" would not say it. */
function endedProblem(pieces: readonly Piece[], store: Store): string | null {
  for (const word of wordsOf(pieces)) {
    const head = word.split('.')[0]!
    if (keyOf(head, store) !== undefined) continue
    const frame = [...store.ended].reverse().find(f => f.labels.has(head) && !f.slots.has(head))
    if (frame !== undefined) {
      return `"${head}" was local to \`${frame.form}\` and ended when it returned` +
        ` — to reach it from outside, return it or make it a field`
    }
  }
  return null
}

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

/** A slot that takes just a word — a setting's name, say — and passes it on as
 *  itself. It names nothing: a name being given is an output (`new Point`). */
export const NAME = 'Name'

/** A slot that takes the name of a type: one of the built-ins, or anything a
 *  `define type` declared. Like `Name` it passes the word on as itself, but only
 *  a known type fits — so `new Triangel t` is caught where it is written. */
export const TYPE = 'Type'

/** The types the solver itself knows. Everything else comes from `define type`. */
export const BUILT_IN_TYPES: readonly string[] = ['Point', 'Line', 'Circle', 'Scalar']

const isType = (word: string, store: Store) => BUILT_IN_TYPES.includes(word) || store.decls.has(word)

/** A word in a Type slot that is not a type, if that is why nothing fits. */
function unknownType(candidates: readonly Match[], store: Store): string | null {
  for (const c of candidates) {
    for (const b of c.bindings) {
      const p = b.piece
      if (b.type.name === TYPE && p.kind === 'word' && p.token.kind === 'WORD' && !isType(p.token.value, store)) {
        return `there is no type called "${p.token.value}"`
      }
    }
  }
  return null
}

/** Render a candidate's surface form, for error messages. */
export const form = (m: Match) =>
  m.def.pattern.map(p => (p.part === 'keyword' ? p.word : `(${p.name}: ${typeText(p.type)})`)).join(' ')

/** The single definition `statement` means, given what is currently declared.
 *  Throws if nothing matches, nothing fits, or more than one fits. */
export function resolveStatement(
  statement: string | readonly Piece[],
  store: Store,
  defs: readonly Definition[],
): Match {
  const pieces = typeof statement === 'string' ? piecesOf(statement) : statement
  const shown = showPieces(pieces)

  // A definition's local names end when it returns. Its shapes live on — the
  // drawing may depend on them — but nothing outside can name them again.
  const ended = () => {
    const problem = endedProblem(pieces, store)
    if (problem !== null) throw new ResolutionError(problem)
  }

  for (const word of wordsOf(pieces)) {
    // A broken path deserves to say so, rather than surfacing as "nothing fits".
    if (!word.includes('.')) continue
    const problem = pathProblem(word, store)
    if (problem !== null) {
      ended()
      throw new ResolutionError(problem)
    }
  }

  const candidates = matchStatement(pieces, defs)
  if (candidates.length === 0) {
    throw new ResolutionError(`no definition matches "${shown}"`)
  }

  const viable = candidates.filter(c => typesFit(c, store))
  const list = (ms: Match[]) => ms.map(form).map(f => `\`${f}\``).join(', ')

  if (viable.length === 0) {
    ended()
    const typo = unknownType(candidates, store)
    if (typo !== null) throw new ResolutionError(typo)
    throw new ResolutionError(
      `no definition of "${shown}" fits the argument types (tried ${list(candidates)})`,
    )
  }
  if (viable.length > 1) {
    throw new ResolutionError(`"${shown}" is ambiguous: ${list(viable)}`)
  }

  return viable[0]!
}

/** Every value slot must be filled by a declared name of a compatible type, or
 *  by a literal the slot accepts. An output or a `Name` slot takes any word —
 *  whether giving that name is legal is evaluation's call. A `Type` slot takes a
 *  word that is a known type.
 *
 *  `given` holds names an earlier call on the same line will give, with the
 *  type it promises. Nothing has run yet while a line is being read, so they
 *  are not in the store; by the time this call runs, they will be. */
export function typesFit(m: Match, store: Store, given: ReadonlyMap<string, string> = new Map()): boolean {
  for (const b of m.bindings) {
    // A call already read fits by what it promises to return. Like a value, it
    // is never a word.
    if (b.piece.kind === 'call') {
      if (b.type.output || b.type.name === NAME || b.type.name === TYPE) return false
      if (!callTypes(b.piece).some(t => compatible(t, b.type.name))) return false
      continue
    }
    // A value already worked out fits by its own type. It is never a word, so it
    // cannot be a name being given, a plain word, or a type's name.
    if (b.piece.kind === 'value') {
      if (b.type.output || b.type.name === NAME || b.type.name === TYPE) return false
      const actual = valueType(b.piece.value, store)
      if (actual === undefined || !compatible(actual, b.type.name)) return false
      continue
    }
    const token = b.piece.token

    // An output or a Name slot takes a word: a name being given, or just a word.
    if (b.type.output || b.type.name === NAME) {
      if (token.kind !== 'WORD') return false
      continue
    }
    if (b.type.name === TYPE) {
      if (token.kind !== 'WORD' || !isType(token.value, store)) return false
      continue
    }
    if (token.kind === 'NUMBER') {
      // A numeric literal is a Scalar, so it fills a Scalar slot or an Any one.
      if (b.type.name !== 'Scalar' && b.type.name !== ANY) return false
      continue
    }
    if (token.kind === 'STRING') {
      if (b.type.name !== 'Text' && b.type.name !== ANY) return false
      continue
    }
    const found = resolvePath(token.value, store)
    const type = found?.type ?? given.get(token.value)
    if (type === undefined) return false
    if (!compatible(type, b.type.name)) return false
  }
  return true
}

/** The type of a value: a literal's by its shape, an element's from the store. */
export function valueType(v: Value, store: Store): string | undefined {
  if (typeof v === 'string') return store.data.typeOf(v as Key)
  return v === null ? undefined : literalType(v)
}

/** The top type: a slot written `(x: Any)` takes an element of any kind. Needed
 *  by definitions that operate on a thing without caring what it is — `call`
 *  gives a second name to anything. Use sparingly: an `Any` slot matches every
 *  candidate, so it makes ambiguity easier to reach. */
export const ANY = 'Any'

/** Type compatibility. Exact-match apart from `Any` — real subtyping
 *  (`Square <: Polygon`) is deferred until there is a hierarchy to model. */
export function compatible(actual: string, expected: string): boolean {
  return expected === ANY || actual === expected
}
