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
import { GeometricPropagate } from './propagate/geometric.js'
import { PickStrategy } from './pick/interface.js'
import { RuleBasedPick } from './pick/rule-based.js'
import { BudgetPick } from './pick/budget.js'
import { buildSceneGraph } from './output.js'
import { SceneGraph, RenderConfig } from '../../renderer/interface.js'

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
