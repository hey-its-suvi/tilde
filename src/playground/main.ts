// ─── Tilde Playground ─────────────────────────────────────────────────────────

import { createEditor, setSyntaxMode, type SyntaxMode } from './editor.js'
import { lex, LexError } from '../lang/lexer.js'
import { parse, ParseError } from '../lang/parser.js'
import { solve, solveSource, setPick, getPick, PICK_NAMES, PickName } from '../lang/solver/index.js'
import { ConstraintError } from '../lang/solver/interface.js'
import { ElaborationError } from '../lang/elaborate.js'
import { Canvas2DRenderer } from '../renderer/canvas2d.js'

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

function log(msg: string, kind: 'info' | 'error' = 'info') {
  const line = document.createElement('div')
  line.className = kind
  line.textContent = msg
  consoleEl.appendChild(line)
  consoleEl.scrollTop = consoleEl.scrollHeight
}

function clearConsole() { consoleEl.innerHTML = '' }

// ─── Compile pipeline ─────────────────────────────────────────────────────────

function compile(source: string) {
  clearConsole()
  try {
    if (mode === 'definitions') {
      const { scene, config } = solveSource(source)
      renderer.render(scene, config)
      log('OK')
    } else {
      const ast = parse(lex(source))
      const { scene, config } = solve(ast)
      renderer.render(scene, config)
      log(`OK — ${ast.statements.length} statement(s)`)
    }
  } catch (e) {
    if (e instanceof LexError || e instanceof ParseError || e instanceof ConstraintError || e instanceof ElaborationError) {
      log(e.message, 'error')
    } else if (e instanceof Error) {
      log(e.message, 'error')
    } else {
      log(String(e), 'error')
    }
  }
}

// ─── Editor ───────────────────────────────────────────────────────────────────

// Each syntax keeps its own buffer, so switching modes never destroys what is
// in the other one.
const MODE_KEY = 'tilde_playground_mode'
const STORAGE_KEY: Record<SyntaxMode, string> = {
  classic: 'tilde_playground_source',
  definitions: 'tilde_playground_source_defs',
}

const DEFAULT_SOURCE: Record<SyntaxMode, string> = {
  classic: `# try it out
let segment ab = 5
`,
  definitions: `-- Everything below is defined in the prelude, in this syntax.
-- \`right triangle ... with legs ...\` is not built in.
import prelude

define right triangle (t: Name) with legs (u: Scalar) (v: Scalar) => Triangle =
    point p at 0 0
    point q at u 0
    point r at 0 v
    t holds p q r

right triangle t with legs 3 4
circle c with center p and radius 1
`,
}

let mode: SyntaxMode = (localStorage.getItem(MODE_KEY) as SyntaxMode | null) ?? 'classic'
setSyntaxMode(mode)

const sourceFor = (m: SyntaxMode) => localStorage.getItem(STORAGE_KEY[m]) ?? DEFAULT_SOURCE[m]

const editor = createEditor(editorEl, sourceFor(mode), (value) => {
  localStorage.setItem(STORAGE_KEY[mode], value)
  compile(value)
})

compile(sourceFor(mode))

resetBtn.addEventListener('click', () => {
  localStorage.removeItem(STORAGE_KEY[mode])
  editor.dispatch({ changes: { from: 0, to: editor.state.doc.length, insert: DEFAULT_SOURCE[mode] } })
})

// ─── Syntax picker (dev) ──────────────────────────────────────────────────────
// Two front ends side by side while the definition pipeline catches up. Classic
// stays the default so nothing that worked before changes.

{
  const header = document.querySelector('header > div:last-child') ?? document.querySelector('header')!
  const picker = document.createElement('select')
  picker.id = 'syntax-picker'
  picker.style.cssText = 'font-family: monospace; font-size: 0.8rem; margin-right: 12px; background: #2a2a3e; color: #f5f5f0; border: 1px solid #444; padding: 2px 6px; border-radius: 3px;'
  for (const name of ['classic', 'definitions'] as SyntaxMode[]) {
    const opt = document.createElement('option')
    opt.value = name
    opt.textContent = `syntax: ${name}`
    picker.appendChild(opt)
  }
  picker.value = mode
  picker.addEventListener('change', () => {
    mode = picker.value as SyntaxMode
    localStorage.setItem(MODE_KEY, mode)
    setSyntaxMode(mode)
    editor.dispatch({ changes: { from: 0, to: editor.state.doc.length, insert: sourceFor(mode) } })
  })
  header.insertBefore(picker, header.firstChild)
}

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
      tooltip.textContent = `${info.solutions === 'infinite' ? '~' : ''}  [${info.label}]`
    } else if (info.kind === 'point') {
      tooltip.textContent = `${info.label}  (${info.x.toFixed(2)}, ${info.y.toFixed(2)})`
    } else if (info.kind === 'line') {
      const prefix = info.solutions === 'infinite' ? '~' : info.solutions === 'multiple' ? '?' : ''
      tooltip.textContent = `${prefix}  ${info.label}  ${formatLineEq(info.a, info.b, info.c)}`
    } else if (info.kind === 'circle') {
      const prefix = info.solutions === 'infinite' ? '~' : info.solutions === 'multiple' ? '?' : ''
      tooltip.textContent = `${prefix}  ${info.label}  center (${fmt(info.cx)}, ${fmt(info.cy)})  r=${fmt(info.r)}`
    } else {
      // Unhandled kind — show whatever label we have so we don't leak the
      // previously-set tooltip text. Any new shape gets a placeholder until a
      // proper formatter is added above.
      const label = (info as { label?: string }).label
      tooltip.textContent = label ? `${label}  (no format)` : '(no format)'
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
