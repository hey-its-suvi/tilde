// ─── Tilde Solver Entry Point ─────────────────────────────────────────────────
// Pipeline: .til source → definitions → ConstraintSet → solve → scene graph.
//
// The solver is a ShellSolver: it merges direct facts about the same name,
// never derives one element from another. There's no pick strategy to choose
// between any more — that was a policy for the real solver's gauge-fixing,
// and a pass-through solver has nothing to pick between. See
// plans/interval-backend.md.

import { ShellSolver } from './shell.js'
import type { SolveResult, Point, Line, Circle } from './interface.js'
import { isEmpty, singleValue, type Scalar } from '../values/scalar.js'
import { buildSceneGraph } from './output.js'
import { runSource, labelsOf, isScalarValue, isText, SETTINGS, type Value } from '../defs/eval.js'
import { PRELUDE } from '../prelude/index.js'
import { SceneGraph, RenderConfig, DEFAULT_CONFIG } from '../../renderer/interface.js'

const solver = new ShellSolver()

// ─── From source ─────────────────────────────────────────────────────────────
// .til source → definitions → ConstraintSet, handed to the Solver; the scene
// graph is built from what it solves.
//
// Config starts from the default and takes whatever `set` lines chose. Each
// on/off setting in the prelude is named after the RenderConfig field it sets.

export function solveSource(
  source: string,
): { scene: SceneGraph; config: RenderConfig; printed: string[] } {
  const program = runSource(source, PRELUDE)
  const { constraints, prints, settings } = program
  const result = solver.solve(constraints)

  // The solver works in keys (`Point#1`); a drawing says what the program wrote.
  // Something with no label is not drawn.
  const labels = new Map<string, string>(labelsOf(program))

  const printed = prints.map(value => describe(value, result, labels))
  const config: RenderConfig = { ...DEFAULT_CONFIG }
  for (const key of SETTINGS) {
    if (settings.has(key)) (config as Record<string, boolean>)[key] = settings.get(key) === true
  }
  return { scene: buildSceneGraph(result, labels), config, printed }
}

/** `fields` all singleton → `show` of their values; any of them empty → no
 *  possible value; otherwise not known yet. */
function describeFields(
  name: string, sep: string, fields: Scalar[], show: (values: number[]) => string,
): string {
  if (fields.some(isEmpty)) return `${name} = no possible value`
  const values = fields.map(singleValue)
  if (values.some(v => v === undefined)) return `${name} = not known — nothing pins it down`
  return `${name}${sep} ${show(values as number[])}`
}

/** One `print`, in words. A number written out prints as itself; anything named
 *  prints as `name = …` with its value, or that it's not yet known or not
 *  possible — a multi-valued or ranged result reads the same as not known,
 *  since drawing one answer out of several would need each kept as a whole,
 *  correlated element (not built yet; see plans/interval-backend.md). */
function describe(value: Value, result: SolveResult, labels: Map<string, string>): string {
  if (value === null) return '(nothing)'
  if (typeof value === 'number') return num(value)
  if (isText(value)) return value.text
  if (isScalarValue(value)) return 'a scalar'

  const name = labels.get(value) ?? value
  const found: Point | Line | Circle | Scalar | undefined =
    result.scalars.get(value) ?? result.points.get(value) ??
    result.lines.get(value) ?? result.circles.get(value)
  if (found === undefined) return `${name} is not a shape or a number`

  if (Array.isArray(found)) {
    if (isEmpty(found)) return `${name} = no possible value`
    const v = singleValue(found)
    return v === undefined ? `${name} = not known — nothing pins it down` : `${name} = ${num(v)}`
  }
  if ('x' in found) {
    return describeFields(name, ' =', [found.x, found.y], vs => `(${num(vs[0]!)}, ${num(vs[1]!)})`)
  }
  if ('a' in found) {
    return describeFields(name, ':', [found.a, found.b, found.c], vs => equation(vs[0]!, vs[1]!, vs[2]!))
  }
  // Circle.
  if (found.center === null) return `${name} = not known — nothing pins it down`
  const centerLabel = labels.get(found.center) ?? found.center
  return describeFields(name, ' =', [found.r], vs => `centre ${centerLabel}, radius ${num(vs[0]!)}`)
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
