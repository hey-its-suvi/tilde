// ─── Tilde Playground ─────────────────────────────────────────────────────────

import { createEditor } from './editor.js'
import { lex, LexError } from '../lang/lexer.js'
import { parse, ParseError } from '../lang/parser.js'
import { solve, ConstraintError } from '../lang/solver/index.js'
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
    const tokens = lex(source)
    const ast    = parse(tokens)
    const { scene, config } = solve(ast)
    renderer.render(scene, config)
    log(`OK — ${ast.statements.length} statement(s)`)
  } catch (e) {
    if (e instanceof LexError || e instanceof ParseError || e instanceof ConstraintError) {
      log(e.message, 'error')
    } else {
      log(String(e), 'error')
    }
  }
}

// ─── Editor ───────────────────────────────────────────────────────────────────

const STORAGE_KEY = 'tilde_playground_source'
const DEFAULT_SOURCE = `# try it out
let segment ab = 5
`

const INITIAL = localStorage.getItem(STORAGE_KEY) ?? DEFAULT_SOURCE

const editor = createEditor(editorEl, INITIAL, (value) => {
  localStorage.setItem(STORAGE_KEY, value)
  compile(value)
})

compile(INITIAL)

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
      tooltip.textContent = `${info.solutions === 'infinite' ? '~' : ''}  [${info.label}]`
    } else if (info.kind === 'point') {
      tooltip.textContent = `${info.label}  (${info.x.toFixed(2)}, ${info.y.toFixed(2)})`
    }
  } else {
    tooltip.style.display = 'none'
  }
})

canvas.addEventListener('mouseleave', () => { tooltip.style.display = 'none' })
