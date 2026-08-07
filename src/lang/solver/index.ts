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
import { GeometricPropagate } from './propagate/geometric/index.js'
import { PickStrategy } from './pick/interface.js'
import { RuleBasedPick } from './pick/rule-based/index.js'
import { BudgetPick } from './pick/budget/index.js'
import { buildSceneGraph } from './output.js'
import { runSource } from '../defs/eval.js'
import { PRELUDE } from '../prelude/index.js'
import { SceneGraph, RenderConfig, DEFAULT_CONFIG } from '../../renderer/interface.js'

export type PickName = 'rule' | 'budget'

const pickFactories: Record<PickName, () => PickStrategy> = {
  'rule':   () => new RuleBasedPick(),
  'budget': () => new BudgetPick(),
}

export const PICK_NAMES: readonly PickName[] = ['rule', 'budget']

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
// Config is the default until `set grid` exists as a prelude definition —
// RenderConfig is one boolean, so there is nothing else to carry across.

export function solveSource(source: string): { scene: SceneGraph; config: RenderConfig } {
  const { constraints } = runSource(source, PRELUDE)
  const result = activeSolver.solve(constraints)
  return { scene: buildSceneGraph(result), config: { ...DEFAULT_CONFIG } }
}
