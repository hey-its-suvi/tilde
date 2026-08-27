// ─── NonePick ─────────────────────────────────────────────────────────────────
// Picks nothing, ever. Propagation still runs, so everything the constraints
// actually force is placed — and nothing else is.
//
// This is a diagnostic rather than a way to solve. The other strategies do two
// jobs at once: consuming a free gauge (a drawing with no fixed origin has to
// start somewhere) and choosing a representative when a shape is genuinely
// underdetermined. Both are choices the program did not make. Turning them off
// answers the question "what do my constraints actually pin down?" — anything
// left unplaced was being chosen for you.

import type { GeomModel } from '../../model.js'
import type { PickStrategy } from '../interface.js'

export class NonePick implements PickStrategy {
  step(_model: GeomModel): GeomModel | null {
    return null
  }
}
