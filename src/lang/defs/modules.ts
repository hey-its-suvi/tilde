// ─── Module loading and scoping ──────────────────────────────────────────────
// Turns a module name into the definition table statements dispatch against.
//
// Imports are file-scoped and do not transit, the way they work in Python, ES
// modules, Rust and Java. If A defines p and q, B imports A and defines r, then
// C importing B sees r — and calling r may reach p and q — but C cannot write
// `q` itself without importing A.
//
// Tilde has no name lookup, so "scope" means *which table a statement is matched
// against*. Three sets per module:
//
//   own      — definitions declared in the file
//   exports  — what files importing this one receive: own + re-exports
//   scope    — what statements in this file are matched against: own + the
//              exports of everything it imports
//
// The key to non-transitivity is that a composed body expands in its *defining*
// module's scope, not the caller's. That is what lets r's body use q while C
// still cannot. `homeOf` carries that mapping to evaluation.
//
// `import x` is private; `export import x` also passes x on. Without the second
// form a barrel module like `prelude` — which has no definitions of its own —
// would export nothing. Rust spells this `pub use`, JS `export * from`.

import { lexHeader } from './lexer.js'
import { parseFile } from './parser.js'
import { DefinitionError, signature, type Definition, type Statement, type TypeDecl } from './types.js'

/** Module name → source text. Supplied by the caller so the prelude, a test
 *  fixture and (later) a user's own files all load the same way. */
export type Registry = Readonly<Record<string, string>>

export type Module = {
  name: string
  own: Definition[]
  exports: Definition[]
  scope: Definition[]
  /** Program lines in this file. Any module may have them, entry or not. */
  statements: Statement[]
}

export type Loaded = {
  /** The entry module's scope — what its statements resolve against. */
  scope: Definition[]
  /** Modules in load order: every dependency before whatever imports it, with
   *  the entry last. Statements run in this order, like Python's module-level
   *  code, so a module is fully loaded before anything can depend on it. */
  order: Module[]
  /** Definition → the scope its body expands in. Composed bodies from an
   *  imported module must resolve against that module, not the importer. */
  homeOf: HomeMap
  /** Definition → the names its body introduces on its own account. */
  locals: LocalsMap
  /** Every `define type` in every module loaded. */
  types: TypeMap
  modules: Map<string, Module>
}

export type HomeMap = Map<Definition, Definition[]>

/** Type name → its declaration. Global rather than per-module: a type name is
 *  already a global tag (decision 10 — any definition may write `=> Triangle`
 *  with nothing declared anywhere), so scoping the *declaration* while the tag
 *  itself is global would be a distinction without a difference. */
export type TypeMap = Map<string, TypeDecl>

/** Definition → the names its body introduces that did not come from a slot.
 *  These are the definition's own working parts, and each call needs its own
 *  copy of them. Computed once the scope is known, since telling a local from a
 *  pattern word means knowing every pattern word in scope. */
export type LocalsMap = Map<Definition, string[]>

/** Words a body writes that are neither its slots nor anyone's pattern word. */
function localsOf(def: Definition, scope: readonly Definition[]): string[] {
  if (def.body.body !== 'tilde') return [] // a tsx body names things in TypeScript

  const slots = new Set(def.pattern.flatMap(p => (p.part === 'slot' ? [p.name] : [])))
  const words = new Set(
    scope.flatMap(d => d.pattern.flatMap(p => (p.part === 'keyword' ? [p.word] : []))),
  )

  const lines = [...def.body.lines, ...(def.body.result === null ? [] : [def.body.result])]
  const locals = new Set<string>()
  for (const line of lines) {
    let tokens
    try {
      tokens = lexHeader(line, def.line)
    } catch {
      continue // the statement will report its own problem when it runs
    }
    for (const t of tokens) {
      if (t.kind === 'WORD' && !slots.has(t.value) && !words.has(t.value)) locals.add(t.value)
    }
  }
  return [...locals]
}

export class ModuleError extends Error {
  constructor(message: string) {
    super(`[Module] ${message}`)
  }
}

export function loadModule(entry: string, registry: Registry): Loaded {
  const modules = new Map<string, Module>()
  const homeOf: HomeMap = new Map()
  const locals: LocalsMap = new Map()
  const types: TypeMap = new Map()
  const order: Module[] = []
  const module = load(entry, registry, modules, homeOf, locals, types, order, [])
  return { scope: module.scope, order, homeOf, locals, types, modules }
}

function load(
  name: string,
  registry: Registry,
  modules: Map<string, Module>,
  homeOf: HomeMap,
  locals: LocalsMap,
  types: TypeMap,
  order: Module[],
  stack: string[],
): Module {
  const done = modules.get(name)
  if (done) return done

  if (stack.includes(name)) {
    throw new ModuleError(`import cycle: ${[...stack, name].join(' → ')}`)
  }

  const src = registry[name]
  if (src === undefined) {
    const known = Object.keys(registry).sort().join(', ')
    throw new ModuleError(`no module named "${name}" (known: ${known || 'none'})`)
  }

  const parsed = parseFile(src)
  const own = parsed.definitions

  for (const decl of parsed.types) {
    const clash = types.get(decl.name)
    if (clash !== undefined) {
      throw new DefinitionError(`type ${decl.name} is already declared`, decl.line)
    }
    types.set(decl.name, decl)
  }

  const seen = new Set<string>()
  for (const def of own) {
    const sig = signature(def.pattern)
    if (seen.has(sig)) {
      throw new DefinitionError(`${name} defines \`${sig}\` twice`, def.line)
    }
    seen.add(sig)
  }

  const exports = [...own]
  const scope = [...own]

  for (const imp of parsed.imports) {
    const dep = load(imp.name, registry, modules, homeOf, locals, types, order, [...stack, name])
    // Own definitions shadow imported ones: a file may redefine `parallel`.
    // Two *imports* colliding stays an error, surfaced at dispatch as an
    // ambiguity — there is no principled winner between them.
    for (const def of dep.exports) {
      if (!seen.has(signature(def.pattern))) scope.push(def)
    }
    if (imp.reexport) exports.push(...dep.exports)
  }

  const module: Module = { name, own, exports, scope, statements: parsed.statements }
  modules.set(name, module)
  order.push(module)
  for (const def of own) {
    homeOf.set(def, scope)
    locals.set(def, localsOf(def, scope))
  }
  return module
}
