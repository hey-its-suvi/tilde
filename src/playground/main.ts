// ─── Tilde Playground ─────────────────────────────────────────────────────────

import { createEditor } from './editor.js'
import { solveSource } from '../lang/solver/index.js'
import { traceStatement, type Trace } from '../lang/defs/trace.js'
import type { Store } from '../lang/defs/resolve.js'
import type { Definition } from '../lang/defs/types.js'
import { Canvas2DRenderer } from '../renderer/canvas2d.js'
import { labelRuns } from '../renderer/label.js'
import { DEFAULT_CONFIG } from '../renderer/interface.js'

const canvas     = document.getElementById('canvas')    as HTMLCanvasElement
const consoleEl  = document.getElementById('console')   as HTMLDivElement
const editorEl   = document.getElementById('editor')    as HTMLDivElement
const tooltip    = document.getElementById('tooltip')   as HTMLDivElement
const editorPane = document.querySelector('.editor-pane') as HTMLDivElement
const resizeHandle = document.getElementById('resize-handle') as HTMLDivElement
const resetBtn   = document.getElementById('reset-btn') as HTMLButtonElement

const toolbox      = document.getElementById('toolbox')       as HTMLDivElement
const toolboxBtn   = document.getElementById('toolbox-btn')   as HTMLButtonElement
const toolboxClose = document.getElementById('toolbox-close') as HTMLButtonElement
const traceInput   = document.getElementById('trace-input')   as HTMLInputElement
const traceBtn     = document.getElementById('trace-btn')     as HTMLButtonElement
const traceOutput  = document.getElementById('trace-output')  as HTMLDivElement

// ─── Renderer ─────────────────────────────────────────────────────────────────

const renderer = new Canvas2DRenderer(canvas)

function resizeCanvas() {
  const pane = canvas.parentElement!
  renderer.resize(pane.clientWidth, pane.clientHeight)
}
resizeCanvas()
window.addEventListener('resize', resizeCanvas)

// ─── Console ──────────────────────────────────────────────────────────────────

/** Whether the last program shows subscripts — on unless it said otherwise. */
let subscripts = DEFAULT_CONFIG.subscripts

/** Put `text` in `el`, with the part of each name after `_` as a subscript when
 *  that is on. Built from text nodes, never markup, so nothing in a name or a
 *  printed string is ever read as HTML. */
function showText(el: HTMLElement, text: string) {
  if (!subscripts) { el.textContent = text; return }
  el.replaceChildren(...labelRuns(text).map(run => {
    if (!run.sub) return document.createTextNode(run.text)
    const sub = document.createElement('sub')
    sub.textContent = run.text
    return sub
  }))
}

function log(msg: string, kind: 'info' | 'error' = 'info') {
  const line = document.createElement('div')
  line.className = kind
  // Errors quote names exactly as written, underscores and all.
  if (kind === 'error') line.textContent = msg
  else showText(line, msg)
  consoleEl.appendChild(line)
  consoleEl.scrollTop = consoleEl.scrollHeight
}

function clearConsole() { consoleEl.innerHTML = '' }

// ─── Compile pipeline ─────────────────────────────────────────────────────────

/** What the match tracer traces a further statement against: the store and
 *  scope of the last program that compiled clean. Stale on a broken program
 *  — still the most recent thing that actually ran — rather than nothing. */
let liveStore: Store | undefined
let liveScope: readonly Definition[] | undefined

function compile(source: string) {
  clearConsole()
  subscripts = DEFAULT_CONFIG.subscripts
  try {
    const { scene, config, printed, store, scope } = solveSource(source)
    subscripts = config.subscripts
    liveStore = store
    liveScope = scope
    renderer.render(scene, config)
    for (const line of printed) log(line)
    log('OK')
  } catch (e) {
    log(e instanceof Error ? e.message : String(e), 'error')
  }
}

// ─── Editor ───────────────────────────────────────────────────────────────────

// The key is the one the definition syntax always used, so a program written in
// it before the classic syntax went is still there.
const STORAGE_KEY = 'tilde_playground_source_defs'

const DEFAULT_SOURCE = `-- Everything below is defined in the prelude, in this same syntax.
-- \`right triangle … with legs …\` is not built in: it is defined here.
import prelude

define right triangle (t: new Triangle) with legs (u: Scalar) (v: Scalar) => Triangle:
    triangle t with a b c
    a at 0 0
    b at u 0
    c at 0 v
    return t

right triangle t with legs 3 4
circle c with center t.point1 and radius 1
line l through t.point2 t.point3
line m parallel l through (0, 2)
print 2 + 3
`

const initialSource = localStorage.getItem(STORAGE_KEY) ?? DEFAULT_SOURCE

const editor = createEditor(editorEl, initialSource, (value) => {
  localStorage.setItem(STORAGE_KEY, value)
  compile(value)
})

compile(initialSource)

resetBtn.addEventListener('click', () => {
  localStorage.removeItem(STORAGE_KEY)
  editor.dispatch({ changes: { from: 0, to: editor.state.doc.length, insert: DEFAULT_SOURCE } })
})

// ─── Pan ──────────────────────────────────────────────────────────────────────

let isPanning = false
let panLastX = 0, panLastY = 0

canvas.style.cursor = 'grab'

canvas.addEventListener('mousedown', (e) => {
  if (e.button !== 0) return
  isPanning = true
  panLastX = e.clientX
  panLastY = e.clientY
  canvas.style.cursor = 'grabbing'
  tooltip.style.display = 'none'
  e.preventDefault()
})

// ─── Zoom ─────────────────────────────────────────────────────────────────────

canvas.addEventListener('wheel', (e) => {
  e.preventDefault()
  const rect   = canvas.getBoundingClientRect()
  const x      = (e.clientX - rect.left) * (canvas.width  / rect.width)
  const y      = (e.clientY - rect.top)  * (canvas.height / rect.height)
  const factor = e.deltaY > 0 ? 1 / 1.1 : 1.1
  renderer.applyZoom(factor, x, y)
}, { passive: false })

canvas.addEventListener('dblclick', () => renderer.resetView())

// ─── Resize handle ────────────────────────────────────────────────────────────

let isResizing = false
let resizeStartX = 0
let resizeStartWidth = 0

resizeHandle.addEventListener('mousedown', (e) => {
  isResizing = true
  resizeStartX = e.clientX
  resizeStartWidth = editorPane.offsetWidth
  document.body.style.cursor = 'col-resize'
  document.body.style.userSelect = 'none'
  e.preventDefault()
})

// ─── Shared document-level mouse handlers ────────────────────────────────────

document.addEventListener('mousemove', (e) => {
  if (isPanning) {
    const rect = canvas.getBoundingClientRect()
    const sx = canvas.width  / rect.width
    const sy = canvas.height / rect.height
    renderer.applyPanDelta((e.clientX - panLastX) * sx, (e.clientY - panLastY) * sy)
    panLastX = e.clientX
    panLastY = e.clientY
  }

  if (isResizing) {
    const delta    = resizeStartX - e.clientX
    const newWidth = Math.max(200, Math.min(800, resizeStartWidth + delta))
    editorPane.style.width = `${newWidth}px`
    resizeCanvas()
  }
})

document.addEventListener('mouseup', () => {
  if (isPanning) {
    isPanning = false
    canvas.style.cursor = 'grab'
  }
  if (isResizing) {
    isResizing = false
    document.body.style.cursor = ''
    document.body.style.userSelect = ''
  }
})

// ─── Hover tooltip ────────────────────────────────────────────────────────────

canvas.addEventListener('mousemove', (e) => {
  if (isPanning) return
  const rect = canvas.getBoundingClientRect()
  const x = (e.clientX - rect.left) * (canvas.width  / rect.width)
  const y = (e.clientY - rect.top)  * (canvas.height / rect.height)
  const info = renderer.hitTest(x, y)

  if (info) {
    tooltip.style.display = 'block'
    tooltip.style.left = `${e.clientX - rect.left + 12}px`
    tooltip.style.top  = `${e.clientY - rect.top  - 8}px`

    if (info.kind === 'segment') {
      showText(tooltip, `${info.solutions === 'infinite' ? '~' : ''}  [${info.label}]`)
    } else if (info.kind === 'point') {
      showText(tooltip, `${info.label}  (${info.x.toFixed(2)}, ${info.y.toFixed(2)})`)
    } else if (info.kind === 'line') {
      const prefix = info.solutions === 'infinite' ? '~' : info.solutions === 'multiple' ? '?' : ''
      showText(tooltip, `${prefix}  ${info.label}  ${formatLineEq(info.a, info.b, info.c)}`)
    } else if (info.kind === 'circle') {
      const prefix = info.solutions === 'infinite' ? '~' : info.solutions === 'multiple' ? '?' : ''
      showText(tooltip, `${prefix}  ${info.label}  center (${fmt(info.cx)}, ${fmt(info.cy)})  r=${fmt(info.r)}`)
    } else {
      // Unhandled kind — show whatever label we have so we don't leak the
      // previously-set tooltip text. Any new shape gets a placeholder until a
      // proper formatter is added above.
      const label = (info as { label?: string }).label
      showText(tooltip, label ? `${label}  (no format)` : '(no format)')
    }
  } else {
    tooltip.style.display = 'none'
  }
})

canvas.addEventListener('mouseleave', () => { tooltip.style.display = 'none' })

// ─── Toolbox: match trace ────────────────────────────────────────────────────

toolboxBtn.addEventListener('click', () => {
  toolbox.hidden = !toolbox.hidden
  if (!toolbox.hidden) traceInput.focus()
})
toolboxClose.addEventListener('click', () => { toolbox.hidden = true })

traceBtn.addEventListener('click', runTrace)
traceInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') runTrace() })

function runTrace() {
  const statement = traceInput.value.trim()
  traceOutput.innerHTML = ''
  if (statement === '') return
  if (liveStore === undefined || liveScope === undefined) {
    appendLine(traceOutput, 'nothing has compiled yet — fix the program on the left first', 'error')
    return
  }
  const trace = traceStatement(statement, liveStore, liveScope)
  for (const { text, cls } of linesOf(trace)) appendLine(traceOutput, text, cls)
}

function appendLine(el: HTMLElement, text: string, cls?: 'error') {
  const line = document.createElement('div')
  if (cls) line.className = cls
  line.textContent = text
  el.appendChild(line)
}

/** `Trace` as plain lines: one per step the reader took, then the outcome.
 *  Mirrors the vocabulary docs/reading.md already uses (fold, restart,
 *  longest match) rather than inventing new terms for the same ideas. */
function linesOf(trace: Trace): { text: string; cls?: 'error' }[] {
  const lines: { text: string; cls?: 'error' }[] = []
  let step = 0
  for (const s of trace.steps) {
    if (s.kind === 'restart') {
      lines.push({ text: `↻  nothing from the start reads the whole line — trying from "${s.at}"` })
      continue
    }
    step++
    lines.push({ text: `${step}. at "${s.at}"` })
    for (const g of s.groups) {
      const words = `${g.length} word${g.length === 1 ? '' : 's'}`
      const summary =
        g.kept.length > 0 ? g.kept.join(', ')
        : g.typed.length > 0 ? '— fits the types, but not the precedence here'
        : g.shape.length > 0 ? '— matches the words, but not the types here'
        : '— nothing'
      lines.push({ text: `   ${words}:  ${summary}` })
    }
  }
  lines.push({ text: '' })
  if (trace.outcome.kind === 'read') {
    lines.push({ text: 'reads as:' })
    for (const l of trace.outcome.lines) lines.push({ text: `  ${l}` })
  } else {
    lines.push({ text: trace.outcome.message, cls: 'error' })
  }
  return lines
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmt(n: number): string {
  return parseFloat(n.toFixed(2)).toString()
}

function formatLineEq(a: number, b: number, c: number): string {
  const eps = 1e-9
  const terms: string[] = []

  const addTerm = (coef: number, variable: string) => {
    if (Math.abs(coef) < eps) return
    if (coef ===  1) terms.push(terms.length === 0 ? variable           : `+ ${variable}`)
    else if (coef === -1) terms.push(`- ${variable}`)
    else if (coef > 0)   terms.push(terms.length === 0 ? `${fmt(coef)}${variable}` : `+ ${fmt(coef)}${variable}`)
    else                 terms.push(`- ${fmt(Math.abs(coef))}${variable}`)
  }

  addTerm(a, 'x')
  addTerm(b, 'y')

  if (Math.abs(c) >= eps) {
    if (c > 0) terms.push(terms.length === 0 ? fmt(c)  : `+ ${fmt(c)}`)
    else       terms.push(`- ${fmt(Math.abs(c))}`)
  }

  return `(${terms.join(' ') || '0'} = 0)`
}
