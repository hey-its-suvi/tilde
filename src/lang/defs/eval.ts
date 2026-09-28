// ─── Evaluation ──────────────────────────────────────────────────────────────
// Runs a resolved program and produces a ConstraintSet — the seam the solver
// already consumes. This is where definitions stop being descriptions and start
// meaning something.
//
// Two body kinds, one rule each:
//
//   • A composed body is a list of Tilde statements. Substitute the slot values
//     into each line, then evaluate it like any other statement. The body's
//     value is its last line's value.
//   • A tsx body is TypeScript, run with the slots bound as parameters and a
//     small helper API in scope. Its return value is the definition's value.
//
// Evaluation and resolution interleave rather than running as separate passes.
// A statement's declarations come from its *body*, not its signature:
// `triangle t with a b c` declares four names, and nothing short of running
// `point a` / `point b` / `point c` / `t holds a b c` reveals that. So the
// symbol table is filled as the program runs, and each statement is resolved
// against the table as it stands at that point. This is what makes
// declaration-before-use the natural rule rather than an imposed one.

import { Scope, type Key } from './scope.js'
import { DataStore } from './data.js'
import { lexHeader, type Token } from './lexer.js'
import { groupTokens, render, type Node } from './tree.js'
import { resolveStatement, resolvePath, keyOf, NAME, form, type Frame, type Store } from './resolve.js'
import type { Match } from './match.js'
import { loadModule, type HomeMap, type Loaded, type Registry, type TypeMap } from './modules.js'
import type { Definition, Statement } from './types.js'
import { segKey } from '../solver/model.js'
import type { ConstraintSet, ResolvedConstraint } from '../solver/interface.js'

export class EvalError extends Error {
  constructor(message: string) {
    super(`[Eval] ${message}`)
  }
}

/** A runtime value. Elements are their key in the ConstraintSet; literals are
 *  numbers. Definitions with no return type produce `null`. */
export type Value = string | number | Text | null

/** What a slot is bound to while its definition runs: a value, or for a Name
 *  slot the word and where it was written. */
type Bound = Value | NameArg

/** What a Name slot holds: a word, and the frame it was written in. Declaring it
 *  labels that frame, not the one doing the declaring — `dot d at 3 4` runs
 *  `point n` inside `dot`, and the label `d` belongs to whoever wrote `d`.
 *  Written into a body line as `d@0`; `@` is refused in anything a program
 *  writes, so the mark cannot be forged. Reads as its word in a tsx body. */
export class NameArg {
  constructor(readonly name: string, readonly frame: number) {}
  toString(): string {
    return this.name
  }
}

/** A piece of text. Wrapped rather than a bare string, because a bare string is
 *  already how a value names an element — `"p"` the text and `p` the point have
 *  to stay different things. */
export type Text = { text: string }
export const isText = (v: unknown): v is Text =>
  typeof v === 'object' && v !== null && 'text' in v

/** How a value is written back into a statement: an element by its key, a
 *  number as itself, text quoted — so substituting it and re-reading the line
 *  gives back the same value. */
const valueSource = (v: Bound): string =>
  isText(v) ? JSON.stringify(v.text) : v instanceof NameArg ? `${v.name}@${v.frame}` : String(v)

/** A string token's value, quotes and escapes removed. */
const textOf = (token: Token): Text => ({ text: JSON.parse(token.value) as string })

export type Program = {
  constraints: ConstraintSet
  /** Every element made, with its type and fields, by key. */
  data: DataStore
  /** Every name the program gave something, pointing at its key. */
  globals: Scope
  /** What `print` asked for, in order. Filled in only after solving, since a
   *  named number has no value until then. */
  prints: Value[]
  /** What `set` lines chose, by setting name. How the result is shown, not what
   *  it is, so these are read after solving and never reach the solver. */
  settings: Settings
}

export type Settings = Map<string, unknown>

/** Types the solver stores as elements. Anything else (Triangle) is a purely
 *  language-level tag: it types names for dispatch, and its body emits the
 *  primitives the solver actually sees. */
const SOLVER_SETS = {
  Point: 'points',
  Line: 'lines',
  Circle: 'circles',
  Scalar: 'scalars',
} as const satisfies Record<string, keyof ConstraintSet>

/** Guards against a definition whose body reaches itself. */
const MAX_DEPTH = 64

/** What a program needs to run: the entry module's scope, and the map telling
 *  evaluation which scope each definition's body belongs to. */
export type Scoped = {
  scope: readonly Definition[]
  homeOf: HomeMap
  types: TypeMap
}

export function runProgram(statements: readonly string[], program: Scoped): Program {
  return run(
    [{ statements: statements.map(text => ({ text, line: 0 })), scope: program.scope }],
    program.homeOf,
    program.types,
  )
}

/** Run a loaded module tree: every file's statements, in load order, each
 *  against its own scope. Dependencies run before whatever imports them, so a
 *  module is fully loaded before anything can depend on it — the same rule
 *  Python uses for module-level code. */
export function runModules(loaded: Loaded): Program {
  return run(
    loaded.order.map(m => ({ statements: m.statements, scope: m.scope, module: m.name })),
    loaded.homeOf,
    loaded.types,
  )
}

type Unit = {
  statements: readonly Statement[]
  scope: readonly Definition[]
  module?: string
}

function run(units: readonly Unit[], homeOf: HomeMap, decls: TypeMap): Program {
  const data = new DataStore()
  const constraints: ConstraintSet = {
    points: new Set(),
    segments: new Set(),
    lines: new Set(),
    circles: new Set(),
    scalars: new Set(),
    constraints: [],
    picks: new Map(),
  }

  // The program's own frame: its labels are the globals.
  const globals = new Scope()
  const program: Frame = { id: 0, labels: globals, form: 'the program' }
  const ctx: Context = {
    store: { data, decls, globals, frames: new Map([[0, program]]), current: program, ended: [] },
    constraints, homeOf, frameCount: 0, prints: [], settings: new Map(),
  }
  for (const unit of units) {
    for (const statement of unit.statements) {
      try {
        evalStatement(statement.text, unit.scope, ctx, 0)
      } catch (e) {
        throw located(e, unit.module, statement.line)
      }
    }
  }
  return { constraints, data, globals, prints: ctx.prints, settings: ctx.settings }
}

/** Prefix an error with where the statement was, when we know. Statements
 *  handed in directly (line 0) have no source position to report. */
function located(e: unknown, module: string | undefined, line: number): unknown {
  if (line === 0 || !(e instanceof Error)) return e
  const where = module === undefined ? `line ${line}` : `${module}:${line}`
  e.message = `[${where}] ${e.message}`
  return e
}

type Context = {
  store: Store
  constraints: ConstraintSet
  homeOf: HomeMap
  /** How many frames have been made — each call's gets the next number. */
  frameCount: number
  /** Values `print` was given, reported after solving. */
  prints: Value[]
  settings: Settings
}

function evalStatement(
  statement: string,
  scope: readonly Definition[],
  ctx: Context,
  depth: number,
): Value {
  if (depth > MAX_DEPTH) {
    throw new EvalError(`"${statement}" expanded more than ${MAX_DEPTH} levels deep — recursive definition?`)
  }

  const tokens = lexHeader(statement, 0)
  if (tokens.some(t => t.kind === 'LPAREN' || t.kind === 'RPAREN')) {
    statement = render(settleGroups(groupTokens(tokens), statement, scope, ctx, depth))
  }
  return evalMatch(resolveStatement(statement, ctx.store, scope), scope, ctx, depth)
}

/** Replace every bracketed group with the value it produces, innermost first.
 *
 *  For now a group is worked out from the inside alone, so it must mean exactly
 *  one thing — the ordinary rule for any statement. Later the slot a group sits
 *  in will be allowed to decide between readings; that walks this same tree,
 *  carrying the expected type down before a group is settled rather than after. */
function settleGroups(
  nodes: readonly Node[],
  whole: string,
  scope: readonly Definition[],
  ctx: Context,
  depth: number,
): Node[] {
  return nodes.map(node => {
    if (node.kind === 'token') return node

    const settled = settleGroups(node.children, whole, scope, ctx, depth)
    // Brackets only group: around a single name or number they change nothing.
    if (settled.length === 1) return settled[0]!

    const inner = render(settled)
    const value = evalStatement(inner, scope, ctx, depth + 1)
    if (value === null) {
      throw new EvalError(
        `\`(${inner})\` in "${whole}" produces nothing, so it cannot stand where a value is expected`,
      )
    }
    const token: Token = typeof value === 'number'
      ? { kind: 'NUMBER', value: String(value), col: node.col }
      : isText(value)
      ? { kind: 'STRING', value: JSON.stringify(value.text), col: node.col }
      : { kind: 'WORD', value, col: node.col }
    return { kind: 'token', token }
  })
}

function evalMatch(m: Match, scope: readonly Definition[], ctx: Context, depth: number): Value {
  const caller = ctx.store.current

  // What each slot holds. A number or text is itself; a Name slot holds the word
  // together with the frame it was written in, since that is where declaring it
  // must put the label; anything else is the element it points at, by key.
  const env = new Map<string, Bound>()
  const elements = new Set<string>()
  for (const b of m.bindings) {
    if (b.token.kind === 'NUMBER') {
      env.set(b.slot, Number(b.token.value))
    } else if (b.token.kind === 'STRING') {
      env.set(b.slot, textOf(b.token))
    } else if (b.type.name === NAME) {
      env.set(b.slot, nameArg(b.token.value, caller))
    } else {
      // A path binds the element it points at, so a body never sees the dots.
      env.set(b.slot, resolvePath(b.token.value, ctx.store)!.key)
      elements.add(b.slot)
    }
  }

  if (m.def.body.body === 'tsx') {
    const value = runTsx(m, env, ctx)
    checkReturn(m, value, ctx)
    return value
  }

  // A composed body runs in a frame of its own. It sees its slots — the elements
  // as labels in the frame, the rest written into each line — and the names it
  // gives things itself, which land in the frame as it runs. Nothing else: not
  // the program's names, not the caller's. The frame ends when the call does;
  // what it made lives on in the data store, reachable only if it was returned
  // or is held by something that was.
  const frame: Frame = { id: ++ctx.frameCount, labels: new Scope(), form: form(m) }
  for (const slot of elements) frame.labels.add({ name: slot, key: env.get(slot) as Key })

  ctx.store.frames.set(frame.id, frame)
  ctx.store.current = frame
  let value: Value
  try {
    // A body expands in the scope of the module that *defined* it, not the one
    // that called it. This is what makes imports non-transitive: a definition
    // may use everything its own file imported, and nothing the caller did.
    value = runComposed(m.def.body, env, elements, ctx.homeOf.get(m.def) ?? scope, ctx, depth)
  } finally {
    ctx.store.current = caller
    ctx.store.frames.delete(frame.id)
    ctx.store.ended.push(frame)
  }

  checkReturn(m, value, ctx)
  return value
}

/** A Name slot's value: the word, and the frame it belongs to. A word that has
 *  already been handed down from further out keeps the frame it came with. */
function nameArg(word: string, current: Frame): NameArg {
  const at = word.indexOf('@')
  return at < 0 ? new NameArg(word, current.id) : new NameArg(word.slice(0, at), Number(word.slice(at + 1)))
}

/** Run every body line, then evaluate whatever `return` designates. Order in the
 *  body does not decide the result — `return c` may name something built three
 *  lines up. */
function runComposed(
  body: { lines: string[]; result: string | null },
  env: Map<string, Bound>,
  elements: ReadonlySet<string>,
  scope: readonly Definition[],
  ctx: Context,
  depth: number,
): Value {
  for (const line of body.lines) evalStatement(substitute(line, env, elements), scope, ctx, depth + 1)
  if (body.result === null) return null

  const result = substitute(body.result, env, elements)
  // A bare name or number is the value itself; anything longer is a statement
  // whose value comes back, so `return circle c with radius 2` works too. A name
  // goes back as the key it labels — the label itself ends with this frame.
  const tokens = lexHeader(result, 0).filter(t => t.kind !== 'EOF')
  if (tokens.length === 1) {
    const only = tokens[0]!
    if (only.kind === 'NUMBER') return Number(only.value)
    if (only.kind === 'STRING') return textOf(only)
    if (only.kind === 'WORD') return resolvePath(only.value, ctx.store)?.key ?? only.value
  }
  return evalStatement(result, scope, ctx, depth + 1)
}

/** What came back must be what was promised. Without this a body could be
 *  reordered — or a `return` pointed at the wrong name — and quietly hand back
 *  the wrong kind of thing. */
function checkReturn(m: Match, value: Value, ctx: Context): void {
  const declared = m.def.returns
  if (declared === null) return

  const actual =
    typeof value === 'number' ? 'Scalar'
    : isText(value) ? 'Text'
    : typeof value === 'string' ? typeOfWord(value, ctx.store)
    : undefined

  if (actual === undefined) {
    throw new EvalError(
      `\`${form(m)}\` promises ${declared.name} but its body returned nothing usable`,
    )
  }
  if (actual !== declared.name) {
    throw new EvalError(
      `\`${form(m)}\` promises ${declared.name} but returned ${actual}` +
        (typeof value === 'string' ? ` (\`${value}\`)` : ''),
    )
  }
}

/** Write a body line's slot values into it, token by token. Elements are not
 *  written in — they are labels in the call's frame — so this is numbers, text
 *  and Name-slot words. Token-level rather than textual so a slot named `n` can
 *  never rewrite the `n` inside a longer word. Re-joining with single spaces is
 *  lossless: a statement is a sequence of atoms and keywords, and nothing reads
 *  its layout. */
function substitute(line: string, env: Map<string, Bound>, elements: ReadonlySet<string>): string {
  const written = (slot: string) => (elements.has(slot) ? undefined : env.get(slot))
  return lexHeader(line, 0)
    .filter(t => t.kind !== 'EOF')
    .map(t => {
      if (t.kind !== 'WORD') return t.value

      const bound = written(t.value)
      if (bound !== undefined) return valueSource(bound)

      // A path rooted at a Name slot — `n.from` — writes in its root and keeps
      // the rest, so it reaches a field of whatever the caller named.
      const dot = t.value.indexOf('.')
      if (dot > 0) {
        const root = written(t.value.slice(0, dot))
        if (root !== undefined) return valueSource(root) + t.value.slice(dot)
      }

      return t.value
    })
    .join(' ')
}

// ─── The TypeScript hatch ────────────────────────────────────────────────────

/** The API a tsx body may use. Deliberately small: declare a name, add a
 *  constraint, record a segment. Everything the prelude needs, nothing that
 *  lets a body reach into evaluation itself. */
type Api = {
  declare: (name: string | NameArg, type: string | NameArg) => string
  constrain: (c: ResolvedConstraint) => void
  segment: (a: string, b: string) => void
  alias: (name: string | NameArg, existing: string) => string
  print: (value: Value) => void
  setting: (name: string, value: unknown) => void
}

const isIdentifier = (s: string) => /^[A-Za-z_$][A-Za-z0-9_$]*$/.test(s)

function runTsx(m: Match, env: Map<string, Bound>, ctx: Context): Value {
  const api = makeApi(ctx)
  const slots = [...env.keys()]

  for (const slot of slots) {
    if (!isIdentifier(slot)) {
      throw new EvalError(
        `\`${form(m)}\` has a slot named '${slot}', which is not usable as a TypeScript identifier`,
      )
    }
  }

  const params = [...slots, 'declare', 'constrain', 'segment', 'alias', 'print', 'setting']
  const args = [
    // Text reaches a body as a String object: it joins and compares like a
    // string, so `a + b` just concatenates, yet stays distinguishable from a
    // bare string, which is how an element's key arrives.
    ...slots.map(s => { const v = env.get(s)!; return isText(v) ? new String(v.text) : v }),
    api.declare, api.constrain, api.segment, api.alias, api.print, api.setting,
  ]

  let body: (...a: unknown[]) => Value
  try {
    body = new Function(...params, m.def.body.body === 'tsx' ? m.def.body.code : '') as typeof body
  } catch (e) {
    throw new EvalError(`\`${form(m)}\` has a body that is not valid JavaScript: ${message(e)}`)
  }

  try {
    const result = (body(...args) as unknown) ?? null
    // Text handed straight back is still a String object.
    if (result instanceof String) return { text: String(result) }
    // Otherwise a body returns a plain string either way; the definition's
    // declared type says whether it is text or the key of an element.
    if (typeof result === 'string' && m.def.returns?.name === 'Text') return { text: result }
    return result as Value
  } catch (e) {
    if (e instanceof EvalError) throw e
    throw new EvalError(`\`${form(m)}\` failed while running: ${message(e)}`)
  }
}

/** Every setting there is. Each is on or off, and named after the field of the
 *  render config it sets. */
export const SETTINGS: readonly string[] = ['grid', 'axes', 'origin', 'subscripts']

const show = (v: unknown) => (v === true ? 'on' : v === false ? 'off' : String(v))

const message = (e: unknown) => (e instanceof Error ? e.message : String(e))

/** Make an element of `type`, with a new key. Its fields come from the type: if
 *  it has a `define type`, each field is made too, and so on down to the solver's
 *  own primitives — Point, Line, Circle, Scalar — which have none. So a Triangle
 *  reaches three real points and no further. A field is labelled only in its
 *  owner's scope: `t.point1` is reachable through `t`, and by no name of its own
 *  until something gives it one (`call t.point1 a`). */
function make(type: string, ctx: Context): Key {
  const scope = new Scope()
  for (const field of ctx.store.decls.get(type)?.fields ?? []) {
    if (field.type.list) {
      throw new EvalError(`${type}.${field.name} is a list, and how many to make is not yet expressible`)
    }
    scope.add({ name: field.name, key: make(field.type.name, ctx) })
  }
  const { key } = ctx.store.data.make(type, scope)

  const set = SOLVER_SETS[type as keyof typeof SOLVER_SETS]
  if (set !== undefined) (ctx.constraints[set] as Set<string>).add(key)
  return key
}

/** Where a label goes: the frame a Name-slot word was written in, or — for a
 *  plain string handed to the API — the frame running now. */
function labelTarget(target: string | NameArg, ctx: Context): { name: string; frame: Frame } {
  const arg = target instanceof NameArg ? target : nameArg(String(target), ctx.store.current)
  const frame = ctx.store.frames.get(arg.frame)
  if (frame === undefined) {
    throw new EvalError(`"${arg.name}" belongs to a call that has already returned`)
  }
  return { name: arg.name, frame }
}

const typeOfWord = (word: string, store: Store): string | undefined => {
  const key = keyOf(word, store)
  return key === undefined ? undefined : store.data.typeOf(key)
}

/** What to call each element when showing it: the name the program gave it, or
 *  failing that a path through a named thing's fields (`t.point1`). Names the
 *  program wrote come first, so `a` beats `t.point1` for the same point. An
 *  element with no label at all — a definition's own, or one made by brackets —
 *  is not in the map. */
export function labelsOf(program: Pick<Program, 'globals' | 'data'>): Map<Key, string> {
  const labels = new Map<Key, string>()
  const give = (key: Key, name: string) => { if (!labels.has(key)) labels.set(key, name) }
  const written = [...program.globals.labels()]

  for (const { name, key } of written) give(key, name)
  const walk = (key: Key, path: string) => {
    for (const field of program.data.get(key)?.scope.labels() ?? []) {
      give(field.key, `${path}.${field.name}`)
      walk(field.key, `${path}.${field.name}`)
    }
  }
  for (const { name, key } of written) walk(key, name)
  return labels
}

function makeApi(ctx: Context): Api {
  const api: Api = {
    /** Make an element of `type`, and label it `name` in the frame the name
     *  was written in. */
    declare(target, typeArg) {
      const { name, frame } = labelTarget(target, ctx)
      const type = String(typeArg)
      const existing = frame.labels.get(name)
      if (existing !== undefined) {
        throw new EvalError(`"${name}" is already declared as a ${ctx.store.data.typeOf(existing)}`)
      }
      if (name.includes('.')) {
        throw new EvalError(`"${name}" is a path to something that already exists, so it cannot be declared`)
      }
      if (type === NAME) {
        throw new EvalError(`"${name}" cannot be declared as ${NAME} — that is a slot marker, not a type`)
      }
      const key = make(type, ctx)
      frame.labels.add({ name, key })
      return key
    },

    constrain(c) {
      ctx.constraints.constraints.push(c)
    },

    segment(a, b) {
      ctx.constraints.segments.add(segKey(a, b))
    },

    /** Give `name` to whatever `existing` already names. Two names, one element —
     *  not a copy — so constraining either constrains the same thing. */
    alias(target, existing) {
      const { name, frame } = labelTarget(target, ctx)
      if (frame.labels.has(name)) {
        throw new EvalError(`"${name}" is already declared`)
      }
      const key = keyOf(String(existing), ctx.store)
      if (key === undefined) {
        throw new EvalError(`"${existing}" is not declared, so nothing can be called "${name}"`)
      }
      frame.labels.add({ name, key })
      return key
    },

    print(value) {
      ctx.prints.push((value as unknown) instanceof String ? { text: String(value) } : value)
    },

    /** A setting is a fact like any other: saying it twice is fine, saying two
     *  different things is a contradiction, not a change of mind. */
    setting(nameArg, value) {
      const name = String(nameArg)
      if (!SETTINGS.includes(name)) {
        throw new EvalError(`there is no setting called ${name} (there are ${SETTINGS.join(', ')})`)
      }
      const existing = ctx.settings.get(name)
      if (existing !== undefined && existing !== value) {
        throw new EvalError(`${name} is already set to ${show(existing)}, so it cannot also be ${show(value)}`)
      }
      ctx.settings.set(name, value)
    },
  }
  return api
}

// ─── Running a program from source ───────────────────────────────────────────

/** Run `source` as a program. It is loaded as a module named `main`, so it may
 *  import, define and state things in one file exactly like any other. */
export function runSource(source: string, registry: Registry, name = 'main'): Program {
  return runModules(loadModule(name, { ...registry, [name]: source }))
}
