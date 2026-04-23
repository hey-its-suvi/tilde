<template>
  <div class="tilde-sketch">
    <div
      class="tilde-sketch__canvas-wrap"
      :class="{ focused }"
      @click.self="focus"
      ref="wrapEl"
    >
      <canvas ref="canvasEl" @mousedown="handleMouseDown" @dblclick="handleDblClick" />
      <span v-if="error" class="tilde-sketch__error">{{ error }}</span>
      <span v-if="!focused" class="tilde-sketch__hint">click to pan &amp; zoom</span>

      <!-- Hover annotation tooltip -->
      <div
        v-if="focused && hoverInfo"
        class="tilde-sketch__tooltip"
        :style="{ left: tooltipX + 'px', top: tooltipY + 'px' }"
      >
        <template v-if="hoverInfo.kind === 'point'">
          <strong>{{ hoverInfo.label }}</strong>
          <span v-if="hoverInfo.solutions === 'one'"> ({{ hoverInfo.x.toFixed(2) }}, {{ hoverInfo.y.toFixed(2) }})</span>
        </template>
        <template v-else-if="hoverInfo.kind === 'segment'">
          <strong>[{{ hoverInfo.label }}]</strong>
          <span v-if="hoverInfo.length !== null"> = {{ hoverInfo.length.toFixed(2) }}</span>
        </template>
      </div>

      <!-- Annotations toggle -->
      <button
        class="tilde-sketch__annot-btn"
        :class="{ active: showAnnotations }"
        @click.stop="toggleAnnotations"
        title="Toggle all annotations"
      >ann</button>
    </div>
    <textarea
      class="tilde-sketch__editor"
      v-model="editableSource"
      spellcheck="false"
      rows="1"
      ref="textareaEl"
    />
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, onBeforeUnmount, watch, nextTick } from 'vue'
import { lex } from '../../../src/lang/lexer.js'
import { parse } from '../../../src/lang/parser.js'
import { solve } from '../../../src/lang/solver/index.js'
import { Canvas2DRenderer } from '../../../src/renderer/canvas2d.js'
import type { HoverInfo } from '../../../src/renderer/interface.js'

const props = withDefaults(defineProps<{
  source: string
  height?: number
  zoom?: number
  cx?: number
  cy?: number
  annotations?: boolean
}>(), {
  height: 300,
  zoom: 1,
  cx: 0,
  cy: 0,
  annotations: false,
})

const canvasEl   = ref<HTMLCanvasElement | null>(null)
const wrapEl     = ref<HTMLDivElement | null>(null)
const textareaEl = ref<HTMLTextAreaElement | null>(null)
const error          = ref<string | null>(null)
const focused        = ref(false)
const showAnnotations = ref(props.annotations)
const hoverInfo      = ref<HoverInfo>(null)
const tooltipX       = ref(0)
const tooltipY       = ref(0)
const editableSource = ref(props.source.trim())

let renderer: Canvas2DRenderer | null = null
let initialized = false

// ── Pan state ─────────────────────────────────────────────────────────────────
let isPanning = false
let lastX = 0, lastY = 0

function focus() {
  focused.value = true
}

function toggleAnnotations() {
  showAnnotations.value = !showAnnotations.value
  renderer?.setAnnotations(showAnnotations.value)
}

function handleClickOutside(e: MouseEvent) {
  if (wrapEl.value && !wrapEl.value.contains(e.target as Node)) {
    focused.value = false
    hoverInfo.value = null
  }
}

function canvasCoords(e: MouseEvent): { x: number; y: number } {
  const canvas = canvasEl.value!
  const rect   = canvas.getBoundingClientRect()
  return {
    x: (e.clientX - rect.left) * (canvas.width  / rect.width),
    y: (e.clientY - rect.top)  * (canvas.height / rect.height),
  }
}

function handleWheel(e: WheelEvent) {
  if (!focused.value || !renderer) return
  e.preventDefault()
  const { x, y } = canvasCoords(e as unknown as MouseEvent)
  renderer.applyZoom(e.deltaY > 0 ? 1 / 1.1 : 1.1, x, y)
}

function handleMouseDown(e: MouseEvent) {
  if (e.button !== 0) return
  if (!focused.value) { focus(); return }
  isPanning = true
  lastX = e.clientX
  lastY = e.clientY
  e.preventDefault()
}

function handleMouseMove(e: MouseEvent) {
  if (isPanning && renderer) {
    const canvas = canvasEl.value!
    const rect   = canvas.getBoundingClientRect()
    const sx = canvas.width  / rect.width
    const sy = canvas.height / rect.height
    renderer.applyPanDelta((e.clientX - lastX) * sx, (e.clientY - lastY) * sy)
    lastX = e.clientX
    lastY = e.clientY
  }

  if (focused.value && renderer && wrapEl.value) {
    const canvas = canvasEl.value!
    const rect   = canvas.getBoundingClientRect()
    const { x, y } = canvasCoords(e)
    const info = renderer.hitTest(x, y)
    hoverInfo.value = info
    if (info) {
      tooltipX.value = e.clientX - rect.left + 12
      tooltipY.value = e.clientY - rect.top  -  8
    }
  }
}

function handleMouseUp() { isPanning = false }

function handleDblClick() {
  renderer?.setView(props.cx, props.cy, props.zoom)
}

function autoResize() {
  const el = textareaEl.value
  if (!el) return
  el.style.height = 'auto'
  el.style.height = el.scrollHeight + 'px'
}

function run() {
  if (!renderer) return
  error.value = null
  try {
    const tokens = lex(editableSource.value)
    const ast    = parse(tokens)
    const { scene, config } = solve(ast)
    renderer.render(scene, config)
    if (!initialized) {
      renderer.setView(props.cx, props.cy, props.zoom)
      renderer.setAnnotations(showAnnotations.value)
      initialized = true
    }
  } catch (e) {
    error.value = e instanceof Error ? e.message : String(e)
    renderer.clear()
  }
}

onMounted(() => {
  const canvas = canvasEl.value!
  canvas.width  = canvas.parentElement!.clientWidth
  canvas.height = props.height
  renderer = new Canvas2DRenderer(canvas)
  run()
  nextTick(autoResize)

  document.addEventListener('click', handleClickOutside)
  document.addEventListener('mousemove', handleMouseMove)
  document.addEventListener('mouseup', handleMouseUp)
  canvas.addEventListener('wheel', handleWheel, { passive: false })
})

onBeforeUnmount(() => {
  document.removeEventListener('click', handleClickOutside)
  document.removeEventListener('mousemove', handleMouseMove)
  document.removeEventListener('mouseup', handleMouseUp)
})

watch(editableSource, () => {
  initialized = false  // reset so setView re-applies after code change
  run()
  nextTick(autoResize)
})
</script>

<style scoped>
.tilde-sketch {
  border: 1px solid var(--vp-c-divider);
  border-radius: 8px;
  overflow: hidden;
  margin: 1.5rem 0;
  font-family: monospace;
}

.tilde-sketch__canvas-wrap {
  position: relative;
  background: #f5f5f0;
  border-bottom: 1px solid var(--vp-c-divider);
  cursor: pointer;
}

.tilde-sketch__canvas-wrap.focused {
  cursor: grab;
  outline: 2px solid var(--vp-c-brand);
  outline-offset: -2px;
}

.tilde-sketch__canvas-wrap.focused:active {
  cursor: grabbing;
}

.tilde-sketch__canvas-wrap canvas {
  display: block;
  width: 100%;
}

.tilde-sketch__hint {
  position: absolute;
  bottom: 8px;
  right: 44px;
  font-size: 11px;
  font-family: monospace;
  color: #aaa;
  pointer-events: none;
}

.tilde-sketch__canvas-wrap.focused .tilde-sketch__hint {
  display: none;
}

.tilde-sketch__error {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 12px;
  font-family: monospace;
  color: #ff8080;
  background: rgba(26,26,46,0.88);
  padding: 1rem;
  white-space: pre-wrap;
}

.tilde-sketch__tooltip {
  position: absolute;
  background: rgba(26,26,46,0.85);
  color: #f5f5f0;
  padding: 3px 8px;
  font-size: 12px;
  font-family: monospace;
  border-radius: 4px;
  pointer-events: none;
  white-space: nowrap;
}

.tilde-sketch__annot-btn {
  position: absolute;
  bottom: 7px;
  right: 8px;
  font-family: monospace;
  font-size: 10px;
  padding: 2px 6px;
  background: rgba(255,255,255,0.8);
  border: 1px solid #ccc;
  border-radius: 3px;
  cursor: pointer;
  color: #888;
  line-height: 1.4;
}

.tilde-sketch__annot-btn:hover { border-color: #999; color: #444; }
.tilde-sketch__annot-btn.active { background: #1a1a2e; color: #f5f5f0; border-color: #1a1a2e; }

.tilde-sketch__editor {
  display: block;
  width: 100%;
  min-height: 2rem;
  padding: 0.75rem 1rem;
  font-family: monospace;
  font-size: 13px;
  line-height: 1.6;
  border: none;
  outline: none;
  resize: none;
  background: var(--vp-code-block-bg);
  color: var(--vp-c-text-1);
  overflow: hidden;
}
</style>
