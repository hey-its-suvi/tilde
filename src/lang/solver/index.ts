// ─── Tilde Solver Entry Point ─────────────────────────────────────────────────
// Pipeline: AST → elaborate → solve → scene graph
//
// The active anchor strategy is module-level state, swappable at runtime via
// `setAnchor`. This lets the playground (and tests, eventually) switch between
// anchor implementations to A/B compare behaviour.

import { Program } from '../ast.js'
import { elaborate } from '../elaborate.js'
import { GeometricSolver } from './geometric/index.js'
import { AnchorStrategy, RuleBasedAnchor } from './geometric/anchor.js'
import { BudgetAnchor } from './geometric/budget-anchor.js'
import { buildSceneGraph } from './output.js'
import { SceneGraph, RenderConfig } from '../../renderer/interface.js'

export type AnchorName = 'rule' | 'budget'

const anchorFactories: Record<AnchorName, () => AnchorStrategy> = {
  'rule':   () => new RuleBasedAnchor(),
  'budget': () => new BudgetAnchor(),
}

export const ANCHOR_NAMES: readonly AnchorName[] = ['rule', 'budget']

let activeAnchor: AnchorName = 'rule'
let activeSolver = new GeometricSolver(anchorFactories[activeAnchor]())

export function setAnchor(name: AnchorName): void {
  activeAnchor = name
  activeSolver = new GeometricSolver(anchorFactories[name]())
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
