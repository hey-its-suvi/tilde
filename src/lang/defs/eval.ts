// ─── Evaluation ──────────────────────────────────────────────────────────────
// Runs a resolved program and produces a ConstraintSet — the seam the solver
// already consumes. This is where definitions stop being descriptions and start
// meaning something.
//
// Two body kinds, one rule each:
//
//   • A composed body is a list of Tilde statements, run in a frame of its own
//     that holds the slots: elements as labels, numbers, text and words as
//     params. Each line is evaluated like any other statement; `return` says
//     what the body's value is.
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
import { groupTokens, type Node } from './tree.js'
import { resolveStatement, resolvePath, keyOf, ResolutionError, NAME, TYPE, ANY, BUILT_IN_TYPES, form, type Frame, type Param, type Store } from './resolve.js'
import { readLine, foldFromStart, type Call } from './read.js'
import { piecesOf, showPieces, type Match, type Piece } from './match.js'
import { isScalarValue, isText, type ScalarValue, type Text, type Value } from './values.js'
import { loadModule, type HomeMap, type Loaded, type Registry, type TypeMap } from './modules.js'
import { signature, type Definition, type Statement } from './types.js'
import { segKey, type ConstraintSet, type ResolvedConstraint } from '../constraints.js'

export class EvalError extends Error {
  constructor(message: string) {
    super(`[Eval] ${message}`)
  }
}

export { isScalarValue, isText, type ScalarValue, type Text, type Value }

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
  const program: Frame = { id: 0, labels: globals, form: 'the program', slots: new Set(), params: new Map() }
  const ctx: Context = {
    store: { data, decls, globals, current: program, ended: [] },
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
  const pieces = tokens.some(t => t.kind === 'LPAREN' || t.kind === 'RPAREN')
    ? settleGroups(groupTokens(tokens), statement, scope, ctx, depth)
    : piecesOf(statement)
  return evalPieces(pieces, scope, ctx, depth)
}

/** Resolve a line already broken into pieces, and run what it means. */
function evalPieces(
  pieces: readonly Piece[],
  scope: readonly Definition[],
  ctx: Context,
  depth: number,
): Value {
  const read = pieces.map(p => withParam(p, ctx.store.current.params))
  const call = readLine(read, ctx.store, scope)
  if (call === null) throw noReading(read, ctx.store, scope)
  settled(call)
  return runCall(call, scope, ctx, depth)
}

/** Why a line has no reading. First as a whole, as one pattern — the errors
 *  that always described a bad line. If no pattern spans it at all, then from as
 *  far as reading left to right got: in `point p on q` with `q` unknown, that is
 *  `(point p) on q`, where both `on`s match the words and neither fits `q`. */
function noReading(pieces: readonly Piece[], store: Store, scope: readonly Definition[]): unknown {
  try {
    resolveStatement(pieces, store, scope)
  } catch (whole) {
    const folded = foldFromStart(pieces, store, scope)
    const nothingSpans = whole instanceof ResolutionError && /no definition matches/.test(whole.message)
    if (!nothingSpans || folded === null || folded.length === pieces.length) return whole
    try {
      resolveStatement(folded, store, scope)
    } catch (stuck) {
      return stuck
    }
    return whole
  }
  // Cannot happen: a line one pattern spans is always read.
  return new EvalError(`"${showPieces(pieces)}" could not be read`)
}

/** Every call in a reading must mean one definition. Checked before anything
 *  runs, so an ambiguous line adds nothing to the drawing. */
function settled(call: Call, slot?: string): void {
  if (call.matches.length > 1) {
    if (differsOnlyByReturn(call.matches)) {
      // Sorted, so the message does not depend on which file defined what first.
      const types = call.matches.map(m => m.def.returns!.name).sort().join(' or a ')
      throw new ResolutionError(
        `"${call.text}" is ambiguous: it could give a ${types}, and nothing around it says which` +
          (slot === ANY ? ` — give it a name first` : ''),
      )
    }
    const list = call.matches.map(m => `\`${form(m)}\``).join(', ')
    throw new ResolutionError(`"${call.text}" is ambiguous: ${list}`)
  }
  for (const b of call.matches[0]!.bindings) if (b.piece.kind === 'call') settled(b.piece, b.type.name)
}

/** Overloads that are the same words and slots, told apart only by what they
 *  give back — the ones a slot can choose between. */
function differsOnlyByReturn(matches: readonly Match[]): boolean {
  if (matches.some(m => m.def.returns === null)) return false
  const shape = (m: Match) => signature({ pattern: m.def.pattern, returns: null })
  return matches.every(m => shape(m) === shape(matches[0]!))
}

/** Run a call read from a line: the calls in its slots first, left to right,
 *  each handing its value on as a value piece; then the call itself. */
function runCall(call: Call, scope: readonly Definition[], ctx: Context, depth: number): Value {
  const m = call.matches[0]!
  const bindings = m.bindings.map(b => {
    if (b.piece.kind !== 'call') return b
    const value = runCall(b.piece, scope, ctx, depth + 1)
    return { ...b, piece: { kind: 'value' as const, value, text: b.piece.text, col: b.piece.col } }
  })
  return evalMatch({ def: m.def, bindings }, scope, ctx, depth)
}

/** A word naming one of the running call's parameters stands for what the
 *  caller passed: a number or text becomes that value, and a `Name` or `Type`
 *  word becomes the word the caller wrote — so `set s on` inside a definition
 *  called with `grid` sets `grid`. Anything else is left as written. */
function withParam(p: Piece, params: ReadonlyMap<string, Param>): Piece {
  if (p.kind !== 'word' || p.token.kind !== 'WORD') return p
  const param = params.get(p.token.value)
  if (param === undefined) return p
  return param.kind === 'value'
    ? { kind: 'value', value: param.value, text: p.token.value, col: p.token.col }
    : { kind: 'word', token: { ...p.token, value: param.word } }
}

/** Replace every bracketed group with the value it produces, innermost first.
 *  The value stays a value — it is never written back into the line as text —
 *  so the outer line is matched with it in place, as it is.
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
): Piece[] {
  return nodes.map((node): Piece => {
    if (node.kind === 'token') return { kind: 'word', token: node.token }

    const settled = settleGroups(node.children, whole, scope, ctx, depth)
    // Brackets only group: around a single name or number they change nothing.
    if (settled.length === 1) return settled[0]!

    const inner = showPieces(settled)
    if (depth + 1 > MAX_DEPTH) {
      throw new EvalError(`"${inner}" expanded more than ${MAX_DEPTH} levels deep — recursive definition?`)
    }

    // A group that could be several overloads, told apart only by what they give
    // back, is read but not run: the slot it lands in picks one (decision 19).
    // Any other group runs now, from the inside alone, as it always has.
    const read = settled.map(p => withParam(p, ctx.store.current.params))
    const call = readLine(read, ctx.store, scope)
    if (call !== null && call.matches.length > 1 && differsOnlyByReturn(call.matches)) {
      return { ...call, text: `(${inner})`, col: node.col, bracketed: true }
    }

    const value = evalPieces(settled, scope, ctx, depth + 1)
    if (value === null) {
      throw new EvalError(
        `\`(${inner})\` in "${whole}" produces nothing, so it cannot stand where a value is expected`,
      )
    }
    return { kind: 'value', value, text: `(${inner})`, col: node.col }
  })
}

function evalMatch(m: Match, scope: readonly Definition[], ctx: Context, depth: number): Value {
  const caller = ctx.store.current

  // What each slot holds. A number or text is itself, and so is the word in a
  // Name or Type slot; an output slot is a name the caller will get back; anything else is
  // the element it points at, by key.
  const env = new Map<string, Value>()
  const elements = new Set<string>()
  const params = new Map<string, Param>()
  const outputs: Output[] = []
  for (const b of m.bindings) {
    if (b.piece.kind === 'value') {
      // Worked out already: a number or text is itself, and an element is its key.
      const value = b.piece.value
      env.set(b.slot, value)
      if (typeof value === 'string') elements.add(b.slot)
      else if (value !== null) params.set(b.slot, { kind: 'value', value })
      continue
    }
    if (b.piece.kind === 'call') throw new EvalError(`"${b.piece.text}" was never run`)
    const token = b.piece.token
    if (token.kind === 'NUMBER') {
      env.set(b.slot, Number(token.value))
      params.set(b.slot, { kind: 'value', value: Number(token.value) })
    } else if (token.kind === 'STRING') {
      env.set(b.slot, textOf(token))
      params.set(b.slot, { kind: 'value', value: textOf(token) })
    } else if (b.type.output) {
      outputs.push(output(b.slot, token.value, b.type.name, caller, ctx))
      // Inside the body the output is just the slot's own name — a label it
      // gives in its own frame, handed back when it ends.
      env.set(b.slot, b.slot)
    } else if (b.type.name === NAME || b.type.name === TYPE) {
      env.set(b.slot, token.value)
      params.set(b.slot, { kind: 'word', word: token.value })
    } else {
      // A path binds the element it points at, so a body never sees the dots.
      env.set(b.slot, resolvePath(token.value, ctx.store)!.key)
      elements.add(b.slot)
    }
  }

  // A tsx body with nothing to hand back runs where it was called from: it only
  // adds facts about things that already exist.
  if (m.def.body.body === 'tsx' && outputs.length === 0) {
    const value = runTsx(m, env, ctx)
    checkReturn(m, value, ctx)
    return value
  }

  // Anything else runs in a frame of its own. It sees its slots — the elements
  // as labels in the frame, numbers, text and words as its params, outputs as
  // names it gives itself — and nothing else: not the program's names, not
  // the caller's. When it ends, its outputs are handed back to the caller under
  // the names the caller wrote, and the frame goes. What it made lives on in
  // the data store.
  const frame: Frame = {
    id: ++ctx.frameCount, labels: new Scope(), form: form(m),
    slots: new Set(m.bindings.map(b => b.slot)), params,
  }
  for (const slot of elements) frame.labels.add({ name: slot, key: env.get(slot) as Key })

  ctx.store.current = frame
  let value: Value
  try {
    // A body expands in the scope of the module that *defined* it, not the one
    // that called it. This is what makes imports non-transitive: a definition
    // may use everything its own file imported, and nothing the caller did.
    value = m.def.body.body === 'tsx'
      ? runTsx(m, env, ctx)
      : runComposed(m.def.body, frame, ctx.homeOf.get(m.def) ?? scope, ctx, depth)
    for (const out of outputs) handBack(out, frame, caller, ctx)
  } finally {
    ctx.store.current = caller
    ctx.store.ended.push(frame)
  }

  checkReturn(m, value, ctx)
  return value
}

/** An output slot as called: the slot, the name the caller wrote for it, and
 *  the type it promises. */
type Output = { slot: string; word: string; type: string; form: string }

/** Check an output's name before the body runs, so a clash is reported against
 *  the line that caused it. */
function output(slot: string, word: string, type: string, caller: Frame, ctx: Context): Output {
  if (word.includes('.')) {
    throw new EvalError(`"${word}" is a path to something that already exists, so it cannot be named again`)
  }
  const existing = caller.labels.get(word)
  if (existing !== undefined) {
    throw new EvalError(`"${word}" is already declared as a ${ctx.store.data.typeOf(existing)}`)
  }
  return { slot, word, type, form: caller.form }
}

/** Give the caller the name it wrote, for whatever the body's output slot
 *  labels — a fresh element of the promised type if the body left it unlabelled. */
function handBack(out: Output, frame: Frame, caller: Frame, ctx: Context): void {
  let key = frame.labels.get(out.slot)
  if (key === undefined) {
    if (out.type === ANY) throw new EvalError(`\`${frame.form}\` never made its "${out.slot}"`)
    key = make(out.type, ctx)
  }
  const actual = ctx.store.data.typeOf(key)
  if (out.type !== ANY && actual !== out.type) {
    throw new EvalError(`\`${frame.form}\` promised a ${out.type} for "${out.slot}" but made a ${actual}`)
  }
  if (caller.labels.has(out.word)) {
    throw new EvalError(`"${out.word}" is already declared as a ${ctx.store.data.typeOf(caller.labels.get(out.word)!)}`)
  }
  caller.labels.add({ name: out.word, key })
}

/** Run every body line, then evaluate whatever `return` designates. Order in the
 *  body does not decide the result — `return c` may name something built three
 *  lines up. */
function runComposed(
  body: { lines: string[]; result: string | null },
  frame: Frame,
  scope: readonly Definition[],
  ctx: Context,
  depth: number,
): Value {
  for (const line of body.lines) evalStatement(line, scope, ctx, depth + 1)
  if (body.result === null) return null

  // A bare name or number is the value itself; anything longer is a statement
  // whose value comes back, so `return circle c with radius 2` works too. A name
  // goes back as the key it labels — the label itself ends with this frame — and
  // a parameter as what the caller passed.
  const tokens = lexHeader(body.result, 0).filter(t => t.kind !== 'EOF')
  if (tokens.length === 1) {
    const only = tokens[0]!
    if (only.kind === 'NUMBER') return Number(only.value)
    if (only.kind === 'STRING') return textOf(only)
    if (only.kind === 'WORD') {
      const param = frame.params.get(only.value)
      if (param !== undefined) return param.kind === 'value' ? param.value : param.word
      return resolvePath(only.value, ctx.store)?.key ?? only.value
    }
  }
  return evalStatement(body.result, scope, ctx, depth + 1)
}

/** What came back must be what was promised. Without this a body could be
 *  reordered — or a `return` pointed at the wrong name — and quietly hand back
 *  the wrong kind of thing. */
function checkReturn(m: Match, value: Value, ctx: Context): void {
  const declared = m.def.returns
  if (declared === null) return

  const actual =
    typeof value === 'number' || isScalarValue(value) ? 'Scalar'
    : isText(value) ? 'Text'
    : typeof value === 'string' ? ctx.store.data.typeOf(value as Key)
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

// ─── The TypeScript hatch ────────────────────────────────────────────────────

/** The API a tsx body may use. Deliberately small: declare a name, add a
 *  constraint, record a segment. Everything the prelude needs, nothing that
 *  lets a body reach into evaluation itself. */
type Api = {
  declare: (name: string, type: string) => string
  constrain: (c: ResolvedConstraint) => void
  segment: (a: string, b: string) => void
  alias: (name: string, existing: string) => string
  print: (value: Value) => void
  setting: (name: string, value: unknown) => void
}

const isIdentifier = (s: string) => /^[A-Za-z_$][A-Za-z0-9_$]*$/.test(s)

function runTsx(m: Match, env: Map<string, Value>, ctx: Context): Value {
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
    /** Make an element of `type`, and label it `name` in the frame running now. */
    declare(name, type) {
      const frame = ctx.store.current
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
      if (!BUILT_IN_TYPES.includes(type) && !ctx.store.decls.has(type)) {
        throw new EvalError(`there is no type called "${type}", so "${name}" cannot be one`)
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
    alias(name, existing) {
      const frame = ctx.store.current
      if (frame.labels.has(name)) {
        throw new EvalError(`"${name}" is already declared`)
      }
      // A slot hands a body the element's key; a name is looked up in the frame.
      const given = String(existing) as Key
      const key = ctx.store.data.get(given) !== undefined ? given : keyOf(given, ctx.store)
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
    setting(name, value) {
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
