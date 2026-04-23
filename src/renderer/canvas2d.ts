// ─── Canvas 2D Renderer ───────────────────────────────────────────────────────

import { Renderer, SceneGraph, SceneLine, SceneSegment, ScenePoint, RenderConfig, Solutions } from './interface.js'

const SCALE       = 60   // pixels per unit
const DOT_RADIUS  = 3    // inner filled dot, screen pixels
const RING_RADIUS = 10   // outer ring, screen pixels
const HIT_RADIUS  = 12   // hit target, screen pixels

const COLOR: Record<Solutions, string> = {
  one:      '#1a1a2e',
  infinite: '#9b9bc0',
  multiple: '#c07a20',
}

export class Canvas2DRenderer implements Renderer {
  private ctx: CanvasRenderingContext2D
  private scene: SceneGraph = { segments: [], points: [], arcs: [], annotations: [], lines: [] }
  private config: RenderConfig = { grid: true }
  private panX = 0   // screen pixels
  private panY = 0   // screen pixels
  private zoom = 1
  private annotations = false

  constructor(private canvas: HTMLCanvasElement) {
    const ctx = canvas.getContext('2d')
    if (!ctx) throw new Error('Could not get 2D context')
    this.ctx = ctx
  }

  render(scene: SceneGraph, config: RenderConfig): void {
    this.scene = scene
    this.config = config
    this.drawScene()
  }

  clear(): void {
    this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height)
  }

  resize(width: number, height: number): void {
    this.canvas.width  = width
    this.canvas.height = height
    this.drawScene()
  }

  applyPanDelta(dx: number, dy: number): void {
    this.panX += dx
    this.panY += dy
    this.drawScene()
  }

  applyZoom(factor: number, screenX: number, screenY: number): void {
    const newZoom = Math.max(0.1, Math.min(20, this.zoom * factor))
    const ratio   = newZoom / this.zoom
    const cx = screenX - this.canvas.width  / 2
    const cy = screenY - this.canvas.height / 2
    this.panX = cx * (1 - ratio) + this.panX * ratio
    this.panY = cy * (1 - ratio) + this.panY * ratio
    this.zoom = newZoom
    this.drawScene()
  }

  resetView(): void {
    this.panX = 0
    this.panY = 0
    this.zoom = 1
    this.drawScene()
  }

  setView(worldCx: number, worldCy: number, zoom: number): void {
    this.zoom = zoom
    const scale = SCALE * zoom
    this.panX = -worldCx * scale
    this.panY =  worldCy * scale
    this.drawScene()
  }

  setAnnotations(on: boolean): void {
    this.annotations = on
    this.drawScene()
  }

  hitTest(x: number, y: number) {
    const scale = SCALE * this.zoom
    const wx = (x - this.canvas.width  / 2 - this.panX) / scale
    const wy = (y - this.canvas.height / 2 - this.panY) / scale * -1
    const hitWorld = HIT_RADIUS / scale

    for (const pt of this.scene.points) {
      const dx = pt.x - wx, dy = pt.y - wy
      if (Math.sqrt(dx * dx + dy * dy) <= hitWorld) {
        return { kind: 'point' as const, label: pt.label, x: pt.x, y: pt.y, solutions: pt.solutions }
      }
    }
    for (const seg of this.scene.segments) {
      if (distToSegment(wx, wy, seg.x1, seg.y1, seg.x2, seg.y2) <= hitWorld) {
        return { kind: 'segment' as const, label: seg.label ?? '', length: null, solutions: seg.solutions }
      }
    }
    return null
  }

  private drawScene() {
    const { ctx, canvas } = this
    this.clear()

    const scale = SCALE * this.zoom
    ctx.save()
    ctx.translate(canvas.width / 2 + this.panX, canvas.height / 2 + this.panY)
    ctx.scale(scale, -scale)

    if (this.config.grid) this.drawGrid()
    for (const ln  of this.scene.lines)    this.drawLine(ln)
    for (const seg of this.scene.segments) this.drawSegment(seg)
    for (const pt  of this.scene.points)   this.drawPoint(pt)

    ctx.restore()
  }

  // ── Grid ──────────────────────────────────────────────────────────────────

  private drawGrid() {
    const { ctx, canvas, panX, panY, zoom } = this
    const scale = SCALE * zoom
    const px = 1 / scale  // 1 screen pixel in world units

    // Visible world bounds (accounting for pan).
    // ctx transform: screen_x = (W/2+panX) + wx*scale, screen_y = (H/2+panY) - wy*scale
    // Solving for wx/wy at screen edges gives the bounds below.
    const xMin = -(canvas.width  / 2 + panX) / scale
    const xMax =  (canvas.width  / 2 - panX) / scale
    const yMin = -(canvas.height / 2 - panY) / scale
    const yMax =  (canvas.height / 2 + panY) / scale

    // Minor grid lines (every 1 unit)
    ctx.strokeStyle = '#e8e8e8'
    ctx.lineWidth = px
    for (let x = Math.ceil(xMin); x <= Math.floor(xMax); x++) {
      if (x === 0) continue
      ctx.beginPath(); ctx.moveTo(x, yMin); ctx.lineTo(x, yMax); ctx.stroke()
    }
    for (let y = Math.ceil(yMin); y <= Math.floor(yMax); y++) {
      if (y === 0) continue
      ctx.beginPath(); ctx.moveTo(xMin, y); ctx.lineTo(xMax, y); ctx.stroke()
    }

    // Axes
    ctx.strokeStyle = '#ccc'
    ctx.lineWidth = 1.5 * px
    ctx.beginPath()
    ctx.moveTo(0, yMin); ctx.lineTo(0, yMax)
    ctx.moveTo(xMin, 0); ctx.lineTo(xMax, 0)
    ctx.stroke()
  }

  // ── Lines ─────────────────────────────────────────────────────────────────

  private drawLine(ln: SceneLine) {
    const { ctx, canvas, panX, panY, zoom } = this
    const scale = SCALE * zoom
    const px = 1 / scale

    // Visible world bounds (same derivation as drawGrid)
    const xMin = -(canvas.width  / 2 + panX) / scale
    const xMax =  (canvas.width  / 2 - panX) / scale
    const yMin = -(canvas.height / 2 - panY) / scale
    const yMax =  (canvas.height / 2 + panY) / scale

    // Clip the infinite line ax+by+c=0 to the visible rect
    // Collect candidate intersection points with the four viewport edges
    const pts: Array<{ x: number; y: number }> = []

    if (Math.abs(ln.b) > 1e-10) {
      // y = (-ax - c) / b  — intersect with left and right edges
      const yAtXMin = (-ln.a * xMin - ln.c) / ln.b
      const yAtXMax = (-ln.a * xMax - ln.c) / ln.b
      if (yAtXMin >= yMin && yAtXMin <= yMax) pts.push({ x: xMin, y: yAtXMin })
      if (yAtXMax >= yMin && yAtXMax <= yMax) pts.push({ x: xMax, y: yAtXMax })
    }

    if (Math.abs(ln.a) > 1e-10) {
      // x = (-by - c) / a  — intersect with top and bottom edges
      const xAtYMin = (-ln.b * yMin - ln.c) / ln.a
      const xAtYMax = (-ln.b * yMax - ln.c) / ln.a
      if (xAtYMin >= xMin && xAtYMin <= xMax) pts.push({ x: xAtYMin, y: yMin })
      if (xAtYMax >= xMin && xAtYMax <= xMax) pts.push({ x: xAtYMax, y: yMax })
    }

    if (pts.length < 2) return

    ctx.save()
    ctx.beginPath()
    ctx.moveTo(pts[0]!.x, pts[0]!.y)
    ctx.lineTo(pts[1]!.x, pts[1]!.y)
    ctx.strokeStyle = '#a0a0c0'
    ctx.lineWidth = px
    ctx.setLineDash([4 * px, 4 * px])
    ctx.stroke()
    ctx.setLineDash([])

    // Label at the right edge
    const lx = pts[1]!.x * scale
    const ly = -pts[1]!.y * scale
    ctx.scale(1 / scale, -1 / scale)
    ctx.font = '11px monospace'
    ctx.fillStyle = '#a0a0c0'
    ctx.fillText(ln.label, lx + 4, ly - 4)
    ctx.restore()
  }

  // ── Segments ──────────────────────────────────────────────────────────────

  private drawSegment(seg: SceneSegment) {
    const { ctx } = this
    const scale = SCALE * this.zoom
    ctx.beginPath()
    ctx.strokeStyle = COLOR[seg.solutions]
    ctx.lineWidth = (seg.solutions === 'one' ? 2 : 1.5) / scale
    ctx.setLineDash([])

    if (seg.solutions === 'infinite') {
      drawSquiggly(ctx, seg.x1, seg.y1, seg.x2, seg.y2)
    } else if (seg.solutions === 'multiple') {
      drawJaggyLine(ctx, seg.x1, seg.y1, seg.x2, seg.y2)
    } else {
      ctx.moveTo(seg.x1, seg.y1)
      ctx.lineTo(seg.x2, seg.y2)
    }
    ctx.stroke()

    if (this.annotations && seg.solutions === 'one') {
      const mx = (seg.x1 + seg.x2) / 2
      const my = (seg.y1 + seg.y2) / 2
      const len = Math.sqrt((seg.x2 - seg.x1) ** 2 + (seg.y2 - seg.y1) ** 2)
      // Draw in screen space, offset perpendicular to the segment
      const dx = seg.x2 - seg.x1, dy = seg.y2 - seg.y1
      const d  = Math.sqrt(dx * dx + dy * dy)
      const nx = d > 1e-9 ? -dy / d : 0   // unit normal
      const ny = d > 1e-9 ?  dx / d : 1
      const ox = nx * 14 / scale, oy = ny * 14 / scale
      ctx.save()
      ctx.scale(1 / scale, -1 / scale)
      ctx.font = '10px monospace'
      ctx.fillStyle = '#888'
      ctx.textAlign = 'center'
      ctx.fillText(len.toFixed(2), (mx + ox) * scale, -(my + oy) * scale)
      ctx.textAlign = 'left'
      ctx.restore()
    }
  }

  // ── Points ────────────────────────────────────────────────────────────────

  private drawPoint(pt: ScenePoint) {
    const { ctx } = this
    const scale = SCALE * this.zoom
    const dot  = DOT_RADIUS  / scale
    const ring = RING_RADIUS / scale

    // Center dot
    ctx.beginPath()
    ctx.arc(pt.x, pt.y, dot, 0, Math.PI * 2)
    ctx.fillStyle = COLOR[pt.solutions]
    ctx.fill()

    // Outer ring — clean circle for one, wavy for infinite, jagged for multiple
    ctx.beginPath()
    if (pt.solutions === 'one') {
      ctx.arc(pt.x, pt.y, ring, 0, Math.PI * 2)
    } else if (pt.solutions === 'infinite') {
      drawWavyCircle(ctx, pt.x, pt.y, ring)
    } else {
      drawJaggedCircle(ctx, pt.x, pt.y, ring)
    }
    ctx.strokeStyle = COLOR[pt.solutions]
    ctx.lineWidth = 1.5 / scale
    ctx.stroke()

    // Label (in screen space so size stays constant)
    const sx = pt.x * scale
    const sy = -pt.y * scale
    ctx.save()
    ctx.scale(1 / scale, -1 / scale)
    ctx.font = '12px monospace'
    ctx.fillStyle = COLOR[pt.solutions]
    const label = pt.solutionIndex !== undefined ? `${pt.label} ${pt.solutionIndex}` : pt.label
    ctx.fillText(label, sx + RING_RADIUS + 4, sy - 3)
    if (this.annotations && pt.solutions === 'one') {
      ctx.font = '10px monospace'
      ctx.fillStyle = '#888'
      ctx.fillText(`(${pt.x.toFixed(2)}, ${pt.y.toFixed(2)})`, sx + RING_RADIUS + 4, sy + 10)
    }
    ctx.restore()
  }

  destroy() {}
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function drawSquiggly(
  ctx: CanvasRenderingContext2D,
  x1: number, y1: number, x2: number, y2: number,
) {
  const dx = x2 - x1, dy = y2 - y1
  const len = Math.sqrt(dx * dx + dy * dy)
  if (len === 0) return
  const ux = dx / len, uy = dy / len
  const nx = -uy,      ny = ux
  const amp   = 3.5 / SCALE
  const freq  = 0.3 * SCALE
  const steps = Math.max(20, Math.floor(len * SCALE / 4))

  ctx.moveTo(x1, y1)
  for (let i = 1; i <= steps; i++) {
    const frac   = i / steps
    const offset = amp * Math.sin(frac * len * freq)
    ctx.lineTo(x1 + frac * dx + nx * offset, y1 + frac * dy + ny * offset)
  }
}

function drawJaggyLine(
  ctx: CanvasRenderingContext2D,
  x1: number, y1: number, x2: number, y2: number,
) {
  const dx = x2 - x1, dy = y2 - y1
  const len = Math.sqrt(dx * dx + dy * dy)
  if (len === 0) return
  const ux = dx / len, uy = dy / len
  const nx = -uy, ny = ux
  const amp   = 2.5 / SCALE
  const steps = Math.max(8, Math.floor(len * SCALE / 6))

  ctx.moveTo(x1, y1)
  for (let i = 1; i <= steps; i++) {
    const frac   = i / steps
    const offset = (i % 2 === 0 ? amp : -amp)
    ctx.lineTo(x1 + frac * dx + nx * offset, y1 + frac * dy + ny * offset)
  }
}

function drawJaggedCircle(
  ctx: CanvasRenderingContext2D,
  cx: number, cy: number, r: number,
) {
  const steps = 24
  const amp   = r * 0.25
  for (let i = 0; i <= steps; i++) {
    const angle  = (i / steps) * Math.PI * 2
    const radius = r + (i % 2 === 0 ? amp : -amp)
    const x = cx + Math.cos(angle) * radius
    const y = cy + Math.sin(angle) * radius
    if (i === 0) ctx.moveTo(x, y)
    else         ctx.lineTo(x, y)
  }
  ctx.closePath()
}

function drawWavyCircle(
  ctx: CanvasRenderingContext2D,
  cx: number, cy: number, r: number,
) {
  const steps = 64
  const amp   = r * 0.18
  const waves = 7
  for (let i = 0; i <= steps; i++) {
    const angle  = (i / steps) * Math.PI * 2
    const radius = r + amp * Math.sin(waves * angle)
    const x = cx + Math.cos(angle) * radius
    const y = cy + Math.sin(angle) * radius
    if (i === 0) ctx.moveTo(x, y)
    else         ctx.lineTo(x, y)
  }
  ctx.closePath()
}

function distToSegment(px: number, py: number, x1: number, y1: number, x2: number, y2: number): number {
  const dx = x2 - x1, dy = y2 - y1
  const lenSq = dx * dx + dy * dy
  if (lenSq === 0) return Math.sqrt((px - x1) ** 2 + (py - y1) ** 2)
  const t = Math.max(0, Math.min(1, ((px - x1) * dx + (py - y1) * dy) / lenSq))
  return Math.sqrt((px - x1 - t * dx) ** 2 + (py - y1 - t * dy) ** 2)
}
