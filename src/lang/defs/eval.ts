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
import { resolveStatement, NAME, form, type SymbolTable } from './resolve.js'
import type { Match } from './match.js'
import type { Definition } from './types.js'
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
  types: SymbolTable
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

export function runProgram(statements: readonly string[], defs: readonly Definition[]): Program {
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

  const ctx: Context = { types, constraints, defs }
  for (const statement of statements) evalStatement(statement, ctx, 0)
  return { constraints, types }
}

type Context = {
  types: SymbolTable
  constraints: ConstraintSet
  defs: readonly Definition[]
}

function evalStatement(statement: string, ctx: Context, depth: number): Value {
  if (depth > MAX_DEPTH) {
    throw new EvalError(`"${statement}" expanded more than ${MAX_DEPTH} levels deep — recursive definition?`)
  }
  return evalMatch(resolveStatement(statement, ctx.types, ctx.defs), ctx, depth)
}

function evalMatch(m: Match, ctx: Context, depth: number): Value {
  const env = new Map<string, Value>()
  for (const b of m.bindings) {
    // A Name slot's value is the name itself — it is being introduced, so there
    // is nothing to look up. Everything else is a key or a literal.
    env.set(b.slot, b.token.kind === 'NUMBER' ? Number(b.token.value) : b.token.value)
  }

  return m.def.body.body === 'tsx'
    ? runTsx(m, env, ctx)
    : runComposed(m.def.body.lines, env, ctx, depth)
}

/** Evaluate each body line with the slots substituted in. The body's value is
 *  the last line's, which is how a composed definition returns its subject:
 *  `point n at x y` ends with `n at x y`, whose value is the point. */
function runComposed(
  lines: readonly string[],
  env: Map<string, Value>,
  ctx: Context,
  depth: number,
): Value {
  let last: Value = null
  for (const line of lines) last = evalStatement(substitute(line, env), ctx, depth + 1)
  return last
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
  declare: (name: string, type: string) => string
  constrain: (c: ResolvedConstraint) => void
  segment: (a: string, b: string) => void
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

  const params = [...slots, 'declare', 'constrain', 'segment']
  const args = [...slots.map(s => env.get(s)!), api.declare, api.constrain, api.segment]

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

function makeApi(ctx: Context): Api {
  return {
    declare(name, type) {
      const existing = ctx.types.get(name)
      if (existing !== undefined) {
        throw new EvalError(`"${name}" is already declared as a ${existing}`)
      }
      if (type === NAME) {
        throw new EvalError(`"${name}" cannot be declared as ${NAME} — that is a slot marker, not a type`)
      }
      ctx.types.set(name, type)

      const set = SOLVER_SETS[type as keyof typeof SOLVER_SETS]
      if (set !== undefined) (ctx.constraints[set] as Set<string>).add(name)
      return name
    },

    constrain(c) {
      ctx.constraints.constraints.push(c)
    },

    segment(a, b) {
      ctx.constraints.segments.add(segKey(a, b))
    },
  }
}
