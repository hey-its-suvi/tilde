// ─── Tilde Solver ─────────────────────────────────────────────────────────────
// Walks the AST, builds a GeomModel, places all points, outputs a SceneGraph.

import { Program, LengthUnit } from '../ast.js'
import { makeModel } from './model.js'
import { registerShape, registerLine, registerPoint, applyConstraint, resolveVertexName } from './register.js'
import { applyAnchor } from './anchor.js'
import { resolve } from './resolve.js'
import { buildSceneGraph } from './output.js'
import { SceneGraph, RenderConfig, DEFAULT_CONFIG } from '../../renderer/interface.js'

export function solve(program: Program): { scene: SceneGraph; config: RenderConfig } {
  const model = makeModel()
  const config: RenderConfig = { ...DEFAULT_CONFIG }

  // Pass 0: determine active unit.
  // `set unit` must appear before any geometry — validate and extract it.
  // If absent, infer the active unit from the first length that carries a unit suffix.
  {
    let seenGeometry = false
    for (const stmt of program.statements) {
      const isGeometry = stmt.kind === 'ShapeDecl' || stmt.kind === 'LineDecl' ||
                         stmt.kind === 'PointDecl'  || stmt.kind === 'ConstraintStmt'
      if (isGeometry) { seenGeometry = true; continue }

      const isSetting = stmt.kind === 'SetUnitLength' || stmt.kind === 'SetUnitAngle' ||
                        stmt.kind === 'SetWinding'   || stmt.kind === 'SetGrid'
      if (isSetting && seenGeometry) {
        throw new Error('[Constraint] `set` statements must appear before any geometry declarations')
      }
      if (stmt.kind === 'SetUnitLength') {
        model.activeUnit = stmt.unit
        break
      }
    }

    // No explicit set unit — infer from first length that carries a unit suffix
    if (model.activeUnit === null) {
      outer: for (const stmt of program.statements) {
        const constraints =
          stmt.kind === 'ShapeDecl'      ? stmt.constraints :
          stmt.kind === 'ConstraintStmt' ? [stmt.constraint] : []
        for (const c of constraints) {
          if ((c.kind === 'LengthConstraint' || c.kind === 'AngleConstraint') && c.value.unit !== null) {
            model.activeUnit = c.value.unit as LengthUnit
            break outer
          }
        }
      }
    }
  }

  // Pass 1: register all shapes + apply explicit constraints + read settings
  for (const stmt of program.statements) {
    if (stmt.kind === 'ShapeDecl')      registerShape(model, stmt)
    else if (stmt.kind === 'LineDecl')  registerLine(model, stmt)
    else if (stmt.kind === 'PointDecl') registerPoint(model, stmt)
    else if (stmt.kind === 'ConstraintStmt') applyConstraint(model, stmt.constraint)
    else if (stmt.kind === 'SetGrid')   config.grid = stmt.on
    else if (stmt.kind === 'PickStmt')  model.solutionPicks.set(resolveVertexName(stmt.vertex), stmt.index)
  }

  // Pass 2: anchor selection — detect free DOFs, apply canonical fixers
  applyAnchor(model)

  // Pass 3: resolve all geometry via constraint propagation
  resolve(model)

  return { scene: buildSceneGraph(model), config }
}
