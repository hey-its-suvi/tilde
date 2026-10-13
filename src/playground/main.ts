// ─── Tilde Playground ─────────────────────────────────────────────────────────

import { createEditor } from './editor.js'
import { solveSource, setPick, getPick, PICK_NAMES, PickName } from '../lang/solver/index.js'
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

function compile(source: string) {
  clearConsole()
  subscripts = DEFAULT_CONFIG.subscripts
  try {
    const { scene, config, printed } = solveSource(source)
    subscripts = config.subscripts
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

// ─── Pick picker (dev) ────────────────────────────────────────────────────────
// Gated behind a literal `true` so it can be hidden on the public playground
// later by flipping this to a real dev flag. While visible, lets us A/B
// compare pick strategies without code changes.

if (true) {
  const header = document.querySelector('header > div:last-child') ?? document.querySelector('header')!
  const picker = document.createElement('select')
  picker.id = 'pick-picker'
  picker.style.cssText = 'font-family: monospace; font-size: 0.8rem; margin-right: 12px; background: #2a2a3e; color: #f5f5f0; border: 1px solid #444; padding: 2px 6px; border-radius: 3px;'
  for (const name of PICK_NAMES) {
    const opt = document.createElement('option')
    opt.value = name
    opt.textContent = `pick: ${name}`
    picker.appendChild(opt)
  }
  picker.value = getPick()
  picker.addEventListener('change', () => {
    setPick(picker.value as PickName)
    compile(editor.state.doc.toString())
  })
  header.insertBefore(picker, header.firstChild)
}

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
