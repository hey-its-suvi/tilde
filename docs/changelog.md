# Changelog

## 0.3.12 — current

- **Parallel lines**: `line l parallel m` constrains `l` to have the same direction as `m`. Can appear inline on the `line` declaration or as a standalone statement. Optional `line` hints accepted on both sides (`line l parallel line m`).
- **Perpendicular lines**: `line l perpendicular m` sets `l`'s direction perpendicular to `m`.
- **Intersection point shorthand**: `line l perpendicular m at p` declares `l`, marks it perpendicular to `m`, and places point `p` at their intersection — sugar for adding `p` to both lines' `through` lists.
- **Parallel distance**: `line l parallel m at 3` constrains `l` to be exactly 3 units from `m`, producing two symmetric solutions (one on each side).

## 0.3.11

- **Partial line declarations**: a line can now be declared with one parameter unknown — `(m,)` for slope-only, `(, k)` for y-intercept-only, `(a, b,)` for direction-only. If a placed point lies on the line the missing parameter is solved exactly; otherwise a canonical default is used. A line resolved by default is rendered as underconstrained (like a free point), one resolved by constraint is fully crisp.

## 0.3.10

- **Anchor bug fix**: a free point with a length constraint to an already-fixed point is no longer selected as the translation anchor — anchoring it at the origin would violate the distance constraint

## 0.3.9

- **Test suite**: Vitest added; `src/tests/solver.test.ts` covers bare segment/triangle, subscript triangle, length constraints, explicit point placement, contradictory-position errors, and line-intersection placement

## 0.3.8

- **Subscript shape support**: shapes in subscript mode (`triangle t`, `segment s`) now register vertices (`t_1`, `t_2`, `t_3`) and edges in the solver
- **Subscript segment syntax**: `t_1_2` (double underscore) is the canonical edge ref for subscript shapes — unambiguous regardless of vertex count
- **Unified ref system**: parser now produces only `NameRef | SubscriptRef`; all semantic resolution (line vs segment vs vertex) moved to the solver where the symbol table is available
- **`p on t_1_2` works**: on-constraints now accept subscript segment targets
- **`point a` after `segment ab`**: re-declaring an implicitly created vertex is now allowed — coordinates are applied as a position constraint rather than throwing
- Internal: `MeasureConstraint` split into `LengthConstraint` and `AngleConstraint`; `PointCoincidence` merged into `EqualityConstraint`

## 0.3.7

- **Any-case identifiers**: names can now be any mix of upper and lowercase (`MyTriangle`, `Seg1`, `hello`) — the previous all-upper / all-lower restriction is removed
- **Flexible shape naming**: exact-length all-distinct lowercase names decompose into vertices (`triangle abc` → vertices `a`, `b`, `c`); any other name uses subscript mode (`triangle t` → `t_1`, `t_2`, `t_3`)
- **Repeated characters in shape names** route to subscript mode instead of erroring (`segment ss` → `ss_1`, `ss_2`)
- **Position constraint inline**: `a = (1, 2)` in a `with` clause or as a standalone statement places a vertex at exact coordinates; errors if already placed at a different position
- **Language reference**: new `/reference` page with complete syntax listing, marking unimplemented features

## 0.3.6

- **Line ∩ Line constraint**: a point constrained to two named lines is placed at their intersection (`point p on a; p on b`)
- Constraining a point to three or more lines checks that all lines share a common point, throwing a constraint error if not
- **Bare point declaration**: `let point a` now works without coordinates — declares a free vertex the solver places normally
- **Bare line declaration**: `let line l` now works without an equation — defaults to `y = x`

## 0.3.5

- Docs: expanded solver internals into five pages — overview, unit resolution, constraint model, anchor, and placement loop
- Docs: introduced locus-intersection model as the unifying framing for the placement algorithm
- Docs: added Mermaid flow diagrams throughout solver internals

## 0.3.4

- Docs: fixed incorrect example in certainty page (underconstrained example now correctly shows a point on a circle, not a fully free point)
- Docs: removed internal terminology (`infinite`, `one`, `heading`, `P2`) from user-facing pages
- Docs: fixed zoom levels on pick and certainty examples

## 0.3.3

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
