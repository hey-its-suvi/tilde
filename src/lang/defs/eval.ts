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

import { lexHeader } from './lexer.js'
import { resolveStatement, resolvePath, keyOf, NAME, form, type Aliases, type Parts, type Store, type SymbolTable } from './resolve.js'
import type { Match } from './match.js'
import { loadModule, type HomeMap, type Loaded, type LocalsMap, type Registry, type TypeMap } from './modules.js'
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
export type Value = string | number | null

export type Program = {
  constraints: ConstraintSet
  /** Element key → its type. Keyed by *element*, so a name given by `call` is
   *  not in here — look it up through `aliases` first. */
  types: SymbolTable
  /** Element key → its fields → the key each references. */
  parts: Parts
  /** Name → the element key it stands for, for names given by `call`. */
  aliases: Aliases
}

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
  locals: LocalsMap
  types: TypeMap
}

export function runProgram(statements: readonly string[], program: Scoped): Program {
  return run(
    [{ statements: statements.map(text => ({ text, line: 0 })), scope: program.scope }],
    program.homeOf,
    program.locals,
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
    loaded.locals,
    loaded.types,
  )
}

type Unit = {
  statements: readonly Statement[]
  scope: readonly Definition[]
  module?: string
}

function run(units: readonly Unit[], homeOf: HomeMap, locals: LocalsMap, decls: TypeMap): Program {
  const types: SymbolTable = new Map()
  const constraints: ConstraintSet = {
    points: new Set(),
    segments: new Set(),
    lines: new Set(),
    circles: new Set(),
    scalars: new Set(),
    constraints: [],
    picks: new Map(),
  }

  const parts: Parts = new Map()
  const aliases: Aliases = new Map()
  const ctx: Context = { store: { types, parts, decls, aliases }, constraints, homeOf, locals }
  for (const unit of units) {
    for (const statement of unit.statements) {
      try {
        evalStatement(statement.text, unit.scope, ctx, 0)
      } catch (e) {
        throw located(e, unit.module, statement.line)
      }
    }
  }
  return { constraints, types, parts, aliases }
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
  locals: LocalsMap
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
  return evalMatch(resolveStatement(statement, ctx.store, scope), scope, ctx, depth)
}

function evalMatch(m: Match, scope: readonly Definition[], ctx: Context, depth: number): Value {
  const env = new Map<string, Value>()
  for (const b of m.bindings) {
    // A Name slot's value is the name itself — it is being introduced, so there
    // is nothing to look up. Everything else is a key or a literal.
    if (b.token.kind === 'NUMBER') {
      env.set(b.slot, Number(b.token.value))
      continue
    }
    // A path binds the element it points at, so a body never sees the dots.
    const found = b.type.name === NAME ? null : resolvePath(b.token.value, ctx.store)
    env.set(b.slot, found === null ? b.token.value : found.key)
  }

  // A name the body writes on its own account belongs to this call, not to the
  // program. Rewriting it up front — before the body runs — is what keeps it
  // out of the caller's namespace and lets the same definition be used twice.
  for (const local of ctx.locals.get(m.def) ?? []) env.set(local, localKey(m, local, env))

  const value = m.def.body.body === 'tsx'
    ? runTsx(m, env, ctx)
    // A body expands in the scope of the module that *defined* it, not the one
    // that called it. This is what makes imports non-transitive: a definition
    // may use everything its own file imported, and nothing the caller did.
    : runComposed(m.def.body, env, ctx.homeOf.get(m.def) ?? scope, ctx, depth)

  checkReturn(m, value, ctx)
  return value
}

/** Key a body-local name to this particular call, so calling the definition
 *  twice makes two of them. The `Name` slot supplies the prefix, which keeps the
 *  key readable and tied to something the caller actually wrote: `dot d …` gives
 *  `d_c`.
 *
 *  A definition with locals and no `Name` slot has nothing to key them by. That
 *  wants a per-call counter, which is deliberately not built yet — it can be
 *  added without disturbing anything here, so until then it is an honest error
 *  rather than a silent collision. */
function localKey(m: Match, local: string, env: Map<string, Value>): string {
  const nameSlot = m.def.pattern.find(p => p.part === 'slot' && p.type.name === NAME)
  if (nameSlot === undefined || nameSlot.part !== 'slot') {
    throw new EvalError(
      `\`${form(m)}\` names \`${local}\` in its body but takes no ${NAME} slot to key it by,` +
        ` so two calls would collide — give it a ${NAME} slot for now`,
    )
  }
  return `${String(env.get(nameSlot.name))}_${local}`
}

/** Run every body line, then evaluate whatever `return` designates. Order in the
 *  body does not decide the result — `return c` may name something built three
 *  lines up. */
function runComposed(
  body: { lines: string[]; result: string | null },
  env: Map<string, Value>,
  scope: readonly Definition[],
  ctx: Context,
  depth: number,
): Value {
  for (const line of body.lines) evalStatement(substitute(line, env), scope, ctx, depth + 1)
  if (body.result === null) return null

  const result = substitute(body.result, env)
  // A bare name or number is the value itself; anything longer is a statement
  // whose value comes back, so `return circle c with radius 2` works too.
  const tokens = lexHeader(result, 0).filter(t => t.kind !== 'EOF')
  if (tokens.length === 1) {
    const only = tokens[0]!
    if (only.kind === 'NUMBER') return Number(only.value)
    if (only.kind === 'WORD') return only.value
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
    : typeof value === 'string' ? ctx.store.types.get(value)
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

/** Replace slot names in a body line with their bound values, token by token.
 *  Token-level rather than textual so a slot named `n` can never rewrite the
 *  `n` inside a longer word. Re-joining with single spaces is lossless: a
 *  statement is a sequence of atoms and keywords, and nothing reads its layout. */
function substitute(line: string, env: Map<string, Value>): string {
  return lexHeader(line, 0)
    .filter(t => t.kind !== 'EOF')
    .map(t => {
      if (t.kind !== 'WORD') return t.value
      const bound = env.get(t.value)
      return bound === undefined ? t.value : String(bound)
    })
    .join(' ')
}

// ─── The TypeScript hatch ────────────────────────────────────────────────────

/** The API a tsx body may use. Deliberately small: declare a name, add a
 *  constraint, record a segment. Everything the prelude needs, nothing that
 *  lets a body reach into evaluation itself. */
type Api = {
  declare: (name: string, type: string, parts?: Record<string, string>) => string
  constrain: (c: ResolvedConstraint) => void
  segment: (a: string, b: string) => void
  mint: (name: string, type: string) => string
  alias: (name: string, existing: string) => string
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

  const params = [...slots, 'declare', 'constrain', 'segment', 'mint', 'alias']
  const args = [
    ...slots.map(s => env.get(s)!),
    api.declare, api.constrain, api.segment, api.mint, api.alias,
  ]

  let body: (...a: unknown[]) => Value
  try {
    body = new Function(...params, m.def.body.body === 'tsx' ? m.def.body.code : '') as typeof body
  } catch (e) {
    throw new EvalError(`\`${form(m)}\` has a body that is not valid JavaScript: ${message(e)}`)
  }

  try {
    return body(...args) ?? null
  } catch (e) {
    if (e instanceof EvalError) throw e
    throw new EvalError(`\`${form(m)}\` failed while running: ${message(e)}`)
  }
}

const message = (e: unknown) => (e instanceof Error ? e.message : String(e))

/** Record what a new element's fields reference, checking them against the
 *  type's declaration. Fields are set once, when the element is made — nothing
 *  in Tilde mutates, so there is never an update to apply later. */
function setParts(name: string, type: string, parts: Record<string, string>, ctx: Context): void {
  const decl = ctx.store.decls.get(type)
  if (decl === undefined) {
    throw new EvalError(`${type} has no \`define type\`, so "${name}" cannot be given fields`)
  }

  const declared = new Set(decl.fields.map(f => f.name))
  for (const given of Object.keys(parts)) {
    if (!declared.has(given)) {
      throw new EvalError(`${type} has no field "${given}" (it has ${[...declared].join(', ')})`)
    }
  }

  const bound = new Map<string, string>()
  for (const field of decl.fields) {
    const target = parts[field.name]
    if (target === undefined) {
      throw new EvalError(`"${name}" is a ${type} but its field "${field.name}" was not set`)
    }
    const actual = ctx.store.types.get(target)
    if (actual === undefined) {
      throw new EvalError(`"${name}.${field.name}" was set to "${target}", which is not declared`)
    }
    if (actual !== field.type.name) {
      throw new EvalError(
        `"${name}.${field.name}" holds a ${field.type.name}, but "${target}" is a ${actual}`,
      )
    }
    bound.set(field.name, target)
  }
  ctx.store.parts.set(name, bound)
}

function makeApi(ctx: Context): Api {
  const api: Api = {
    declare(name, type, parts) {
      const existing = ctx.store.types.get(name)
      if (existing !== undefined) {
        throw new EvalError(`"${name}" is already declared as a ${existing}`)
      }
      if (ctx.store.aliases.has(name)) {
        throw new EvalError(`"${name}" is already declared`)
      }
      if (type === NAME) {
        throw new EvalError(`"${name}" cannot be declared as ${NAME} — that is a slot marker, not a type`)
      }
      ctx.store.types.set(name, type)

      const set = SOLVER_SETS[type as keyof typeof SOLVER_SETS]
      if (set !== undefined) (ctx.constraints[set] as Set<string>).add(name)

      if (parts !== undefined) setParts(name, type, parts, ctx)
      return name
    },

    constrain(c) {
      ctx.constraints.constraints.push(c)
    },

    segment(a, b) {
      ctx.constraints.segments.add(segKey(a, b))
    },

    /** Make an element of `type`, and — if that type declares fields — make each
     *  of those too, named `<name>.<field>`. The recursion stops at a type with
     *  no declaration, which is exactly where the solver's own primitives are:
     *  Point, Line, Circle, Scalar. So `new Triangle t` reaches down to three
     *  real points and no further. */
    mint(name, type) {
      const decl = ctx.store.decls.get(type)
      if (decl === undefined) return api.declare(name, type)

      const fields: Record<string, string> = {}
      for (const field of decl.fields) {
        if (field.type.list) {
          throw new EvalError(
            `${type}.${field.name} is a list, and how many to make is not yet expressible`,
          )
        }
        fields[field.name] = api.mint(`${name}.${field.name}`, field.type.name)
      }
      return api.declare(name, type, fields)
    },

    /** Give `name` to whatever `existing` already names. Two names, one element —
     *  not a copy — so constraining either constrains the same thing. */
    alias(name, existing) {
      if (ctx.store.types.has(name) || ctx.store.aliases.has(name)) {
        throw new EvalError(`"${name}" is already declared`)
      }
      const key = keyOf(existing, ctx.store)
      if (!ctx.store.types.has(key)) {
        throw new EvalError(`"${existing}" is not declared, so nothing can be called "${name}"`)
      }
      ctx.store.aliases.set(name, key)
      return key
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
