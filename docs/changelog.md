# Changelog

## 0.3.3 — current

- Length constraint `ab = 5` now implicitly declares and renders the segment
- Segments where both endpoints are explicitly placed render crisp (not wavy)
- Docs: settings page updated with unit documentation, stale entries removed
- Added `CLAUDE.md` with project conventions

## 0.3.2

- **Length units**: `set unit cm` (or `mm`, `m`, `in`, `inches`) sets the default unit for the program
- Mixed units convert automatically — `50mm` and `5cm` are the same length when `set unit cm`
- Without `set unit`, the first unit used in any constraint becomes the default; fully unitless programs stay abstract
- `set` statements are now validated to appear before any geometry declarations
- Removed `set anchor` (use explicit point coordinates instead)

## 0.3.1

- Fixed isolated disconnected components (e.g. two unconnected segments) stacking both vertices at the same point — each component now seeds separately so constraint propagation resolves it correctly

## 0.3.0

- **Multiple solutions**: ambiguous placements now render all discrete solutions simultaneously as jagged numbered alternatives
- `pick v N` statement to select a specific solution
- **On-segment constraint**: `p on ab` places a point on a segment (always `infinite`)
- Multiple underconstrained points on the same segment distribute evenly
- `solutions` model replaces old `certainty` model: `one | multiple | infinite`
- Jagged line and circle style for `multiple` state (amber)

## 0.2.0

- **Equation-defined lines**: `line l = (a, b, c)` or `line l = (m, k)`
- **On-line constraint**: `b on l`, `point b on line l`, `b on line l`
- **Explicit point declaration**: `point p = (x, y)`
- Circle-line intersection solver (P1b priority)
- Name collision detection — reusing a name across shapes/lines/points is a runtime error
- **Vertex-centric fixpoint solver** replaces old per-shape placement
- Rotating heading (90° CCW per P2 placement) prevents collinear degeneracy in underconstrained cycles

## 0.1.0

- Initial language: `segment`, `triangle`
- Length constraints: `ab = 5`
- Point coincidence: `a = b`
- Two-circle intersection solver (SSS triangles)
- `set grid on/off`
- Canvas2D renderer with pan, zoom, resize
- Wavy circle / squiggly line for underconstrained (`infinite`) vertices
- Semicolons as optional statement terminators
- LocalStorage persistence in playground
