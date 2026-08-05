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

import { parseFile } from './parser.js'
import { DefinitionError, signature, type Definition } from './types.js'

/** Module name → source text. Supplied by the caller so the prelude, a test
 *  fixture and (later) a user's own files all load the same way. */
export type Registry = Readonly<Record<string, string>>

export type Module = {
  name: string
  own: Definition[]
  exports: Definition[]
  scope: Definition[]
}

export type Loaded = {
  /** The entry module's scope — what its statements resolve against. */
  scope: Definition[]
  /** Definition → the scope its body expands in. Composed bodies from an
   *  imported module must resolve against that module, not the importer. */
  homeOf: HomeMap
  modules: Map<string, Module>
}

export type HomeMap = Map<Definition, Definition[]>

export class ModuleError extends Error {
  constructor(message: string) {
    super(`[Module] ${message}`)
  }
}

export function loadModule(entry: string, registry: Registry): Loaded {
  const modules = new Map<string, Module>()
  const homeOf: HomeMap = new Map()
  const module = load(entry, registry, modules, homeOf, [])
  return { scope: module.scope, homeOf, modules }
}

function load(
  name: string,
  registry: Registry,
  modules: Map<string, Module>,
  homeOf: HomeMap,
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
    const dep = load(imp.name, registry, modules, homeOf, [...stack, name])
    // Own definitions shadow imported ones: a file may redefine `parallel`.
    // Two *imports* colliding stays an error, surfaced at dispatch as an
    // ambiguity — there is no principled winner between them.
    for (const def of dep.exports) {
      if (!seen.has(signature(def.pattern))) scope.push(def)
    }
    if (imp.reexport) exports.push(...dep.exports)
  }

  const module: Module = { name, own, exports, scope }
  modules.set(name, module)
  for (const def of own) homeOf.set(def, scope)
  return module
}
