// ─── Tilde Solver Entry Point ─────────────────────────────────────────────────
// Pipeline: AST → elaborate → solve → scene graph.
//
// One Solver class powers everything. The only swappable bit is the
// PickStrategy — the policy for canonicalising gauges and choosing arbitrary
// placements. The PropagateStrategy is fixed (forced placements are forced
// regardless of policy).
//
// The pick is module-level state, swappable at runtime via `setPick`. This
// lets the playground (and tests) A/B-compare pick strategies.
//
//   'rule'   — RuleBasedPick: rule-pile gauge fixing + locus/fallback.
//   'budget' — BudgetPick: explicit per-axis gauge accounting (point-only;
//              line cases still defer to the rule-default fallback).

import { Program } from '../ast.js'
import { elaborate } from '../elaborate.js'
import { Solver } from './solver.js'
import type { SolveResult } from './interface.js'
import { GeometricPropagate } from './propagate/geometric/index.js'
import { PickStrategy } from './pick/interface.js'
import { RuleBasedPick } from './pick/rule-based/index.js'
import { BudgetPick } from './pick/budget/index.js'
import { NonePick } from './pick/none/index.js'
import { buildSceneGraph } from './output.js'
import { runSource, isText, SETTINGS, type Value } from '../defs/eval.js'
import { PRELUDE } from '../prelude/index.js'
import { SceneGraph, RenderConfig, DEFAULT_CONFIG } from '../../renderer/interface.js'

export type PickName = 'rule' | 'budget' | 'none'

const pickFactories: Record<PickName, () => PickStrategy> = {
  'rule':   () => new RuleBasedPick(),
  'budget': () => new BudgetPick(),
  // Diagnostic: shows only what the constraints force, leaving anything that
  // would have been chosen for you unplaced.
  'none':   () => new NonePick(),
}

export const PICK_NAMES: readonly PickName[] = ['rule', 'budget', 'none']

let activePick: PickName = 'rule'
let activeSolver = new Solver(new GeometricPropagate(), pickFactories[activePick]())

export function setPick(name: PickName): void {
  activePick = name
  activeSolver = new Solver(new GeometricPropagate(), pickFactories[name]())
}

export function getPick(): PickName {
  return activePick
}

export function solve(program: Program): { scene: SceneGraph; config: RenderConfig } {
  const { constraintSet, config } = elaborate(program)
  const result = activeSolver.solve(constraintSet)
  const scene = buildSceneGraph(result)
  return { scene, config }
}

// ─── The definition pipeline ─────────────────────────────────────────────────
// The other front end: .til source → definitions → ConstraintSet, bypassing
// `lexer`/`parser`/`elaborate` entirely. It meets this file at the same seam
// (a ConstraintSet handed to the same Solver), so the pick strategy applies
// identically and the scene graph is built the same way.
//
// Config starts from the default and takes whatever `set` lines chose. Each
// on/off setting in the prelude is named after the RenderConfig field it sets.

export function solveSource(
  source: string,
): { scene: SceneGraph; config: RenderConfig; printed: string[] } {
  const { constraints, aliases, prints, settings } = runSource(source, PRELUDE)
  const result = activeSolver.solve(constraints)

  // A drawing should say what the program wrote. `triangle t with a b c` keys
  // its vertices `t.point1`, but the user asked for `a`, so names given by `call`
  // become the labels. First one wins if something is named twice.
  const labels = new Map<string, string>()
  for (const [name, key] of aliases) if (!labels.has(key)) labels.set(key, name)

  const printed = prints.map(value => describe(value, result, labels))
  const config: RenderConfig = { ...DEFAULT_CONFIG }
  for (const key of SETTINGS) {
    if (settings.has(key)) (config as Record<string, boolean>)[key] = settings.get(key) === true
  }
  return { scene: buildSceneGraph(result, labels), config, printed }
}

/** One `print`, in words. A number written out prints as itself; anything named
 *  prints as `name = …` with every value it could take — several, none, or not
 *  yet known are all answers worth seeing. */
function describe(value: Value, result: SolveResult, labels: Map<string, string>): string {
  if (value === null) return '(nothing)'
  if (typeof value === 'number') return num(value)
  if (isText(value)) return value.text

  const name = labels.get(value) ?? value
  const found =
    result.scalars.get(value) ?? result.points.get(value) ??
    result.lines.get(value) ?? result.circles.get(value)
  if (found === undefined) return `${name} is not a shape or a number`

  const sols = found.solutions
  if (sols === undefined) return `${name} = not known — nothing pins it down`
  if (sols.length === 0) return `${name} = no possible value`

  const shown = sols.map(s => show(s, result, labels))
  // An equation already has an `=` in it, so a line is introduced with `:`.
  const sep = result.lines.has(value) ? ':' : ' ='
  return `${name}${sep} ${shown.join(' or ')}`
}

function show(s: unknown, result: SolveResult, labels: Map<string, string>): string {
  if (typeof s === 'number') return num(s)
  const v = s as Record<string, unknown>
  if ('x' in v) return `(${num(v.x as number)}, ${num(v.y as number)})`
  if ('a' in v) return equation(v.a as number, v.b as number, v.c as number)
  if ('center' in v) {
    const centre = String(v.center)
    return `centre ${labels.get(centre) ?? centre}, radius ${num(v.r as number)}`
  }
  return JSON.stringify(s)
}

/** `ax + by + c = 0` as a person would write it: zero terms dropped, a
 *  coefficient of 1 left off, and signs folded in — `-y = 0`, not `0x + -1y + 0`. */
function equation(a: number, b: number, c: number): string {
  // The same line either way up; lead with a positive term.
  const first = [a, b, c].find(n => Number(n.toFixed(9)) !== 0) ?? 0
  if (first < 0) { a = -a; b = -b; c = -c }
  const terms: string[] = []
  for (const [k, v] of [[a, 'x'], [b, 'y'], [c, '']] as const) {
    const n = Number(k.toFixed(9))
    if (n === 0) continue
    const mag = Math.abs(n) === 1 && v !== '' ? '' : num(Math.abs(n))
    const sign = n < 0 ? '-' : '+'
    terms.push(terms.length === 0 ? `${n < 0 ? '-' : ''}${mag}${v}` : `${sign} ${mag}${v}`)
  }
  return `${terms.length === 0 ? '0' : terms.join(' ')} = 0`
}

/** Round away floating-point noise — 0.1 + 0.2 prints as 0.3. */
const num = (n: number) => String(Number(n.toFixed(9)))
