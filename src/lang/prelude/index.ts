// ─── The prelude, as a module registry ───────────────────────────────────────
// Sources load through Vite's `?raw` rather than the filesystem, so they bundle
// into the browser playground. Nothing here is privileged: a program reaches
// these modules by writing `import prelude`, and could import a different set
// just as easily.

import type { Registry } from '../defs/modules.js'

import preludeSrc from './prelude.til?raw'
import coreSrc from './core.til?raw'
import shapesSrc from './shapes.til?raw'
import constraintsSrc from './constraints.til?raw'

export const PRELUDE: Registry = {
  prelude: preludeSrc,
  core: coreSrc,
  shapes: shapesSrc,
  constraints: constraintsSrc,
}
