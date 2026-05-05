// ─── Tilde Solver Entry Point ─────────────────────────────────────────────────
// Pipeline: AST → elaborate → solve → scene graph

import { Program } from '../ast.js'
import { elaborate } from '../elaborate.js'
import { GeometricSolver } from './geometric/index.js'
import { buildSceneGraph } from './output.js'
import { SceneGraph, RenderConfig } from '../../renderer/interface.js'

const solver = new GeometricSolver()

export function solve(program: Program): { scene: SceneGraph; config: RenderConfig } {
  const { constraintSet, config } = elaborate(program)
  const result = solver.solve(constraintSet)
  const scene = buildSceneGraph(result)
  return { scene, config }
}
