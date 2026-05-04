// ─── Tilde Renderer Interface ─────────────────────────────────────────────────
// The renderer knows nothing about the language. It only receives a SceneGraph
// and draws it. Swap Canvas2D for WebGL by implementing the same interface.

// ─── Scene Graph ─────────────────────────────────────────────────────────────

export type Solutions = 'one' | 'multiple' | 'infinite'

export type SceneSegment = {
  x1: number; y1: number
  x2: number; y2: number
  solutions: Solutions
  label?: string
}

export type ScenePoint = {
  x: number; y: number
  label: string
  solutions: Solutions
  solutionIndex?: number  // set when solutions === 'multiple', 1-based
}

export type SceneArc = {
  cx: number; cy: number
  radius: number
  startAngle: number  // radians
  endAngle: number    // radians
  solutions: Solutions
  label?: string
}

export type SceneAnnotation = {
  x: number; y: number
  text: string
}

export type SceneLine = {
  a: number; b: number; c: number  // ax + by + c = 0
  label: string
  solutions: Solutions
  solutionIndex?: number  // set when solutions === 'multiple', 1-based
  freeCoefs: { a: boolean; b: boolean; c: boolean }  // true = canonically chosen, not constrained
}

export type SceneGraph = {
  segments: SceneSegment[]
  points: ScenePoint[]
  arcs: SceneArc[]
  annotations: SceneAnnotation[]
  lines: SceneLine[]
}

// ─── Hover Info ───────────────────────────────────────────────────────────────

export type HoverInfo =
  | { kind: 'segment'; label: string; length: number | null; solutions: Solutions }
  | { kind: 'point';   label: string; x: number; y: number; solutions: Solutions }
  | { kind: 'line';    label: string; a: number; b: number; c: number; freeCoefs: { a: boolean; b: boolean; c: boolean }; solutions: Solutions }
  | { kind: 'angle';   label: string; degrees: number | null; solutions: Solutions }
  | null

// ─── Render Config ────────────────────────────────────────────────────────────

export type RenderConfig = {
  grid: boolean
}

export const DEFAULT_CONFIG: RenderConfig = {
  grid: true,
}

// ─── Renderer Interface ───────────────────────────────────────────────────────

export interface Renderer {
  /** Render the full scene. Called every time the scene changes. */
  render(scene: SceneGraph, config: RenderConfig): void

  /** Return info about whatever is under the cursor, or null. */
  hitTest(x: number, y: number): HoverInfo

  /** Toggle inline annotations (coords on points, lengths on segments). */
  setAnnotations(on: boolean): void

  /** Clear the canvas. */
  clear(): void

  /** Resize the render surface (e.g. on window resize). */
  resize(width: number, height: number): void
}
