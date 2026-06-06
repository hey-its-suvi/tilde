// ─── Tilde Solver Entry Point ─────────────────────────────────────────────────
// Pipeline: AST → elaborate → solve → scene graph
//
// The active solver is module-level state, swappable at runtime via
// `setAnchor`. This lets the playground (and tests) switch between
// implementations to A/B compare behaviour.
//
// During the path-b migration we have three options:
//   'rule'       — legacy GeometricSolver + RuleBasedAnchor (current default)
//   'budget'     — legacy GeometricSolver + BudgetAnchor (WIP, 82/88)
//   'loop-rule'  — new Solver + GeometricPropagate + RuleBasedPick
//                  (scaffolding for the migration; will be deleted in step 6)

import { Program } from '../ast.js'
import { elaborate } from '../elaborate.js'
import { SolverInterface } from './interface.js'
import { GeometricSolver } from './geometric/index.js'
import { RuleBasedAnchor } from './geometric/anchor.js'
import { BudgetAnchor } from './geometric/budget-anchor.js'
import { Solver } from './solver.js'
import { GeometricPropagate } from './propagate/geometric.js'
import { RuleBasedPick } from './pick/rule-based.js'
import { buildSceneGraph } from './output.js'
import { SceneGraph, RenderConfig } from '../../renderer/interface.js'

export type AnchorName = 'rule' | 'budget' | 'loop-rule'

const solverFactories: Record<AnchorName, () => SolverInterface> = {
  'rule':      () => new GeometricSolver(new RuleBasedAnchor()),
  'budget':    () => new GeometricSolver(new BudgetAnchor()),
  'loop-rule': () => new Solver(new GeometricPropagate(), new RuleBasedPick()),
}

export const ANCHOR_NAMES: readonly AnchorName[] = ['rule', 'budget', 'loop-rule']

let activeAnchor: AnchorName = 'rule'
let activeSolver = solverFactories[activeAnchor]()

export function setAnchor(name: AnchorName): void {
  activeAnchor = name
  activeSolver = solverFactories[name]()
}

export function getAnchor(): AnchorName {
  return activeAnchor
}

export function solve(program: Program): { scene: SceneGraph; config: RenderConfig } {
  const { constraintSet, config } = elaborate(program)
  const result = activeSolver.solve(constraintSet)
  const scene = buildSceneGraph(result)
  return { scene, config }
}
