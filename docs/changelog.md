# Changelog

## 0.3.25 — current

- **Multi-target `through`**: `l through p, q` and `l through p and q` (with comma or `and` separator) now work as standalone constraint statements, not just inline on a line declaration. Each target desugars to a separate on-line constraint. The same syntax also works for circles: `c through a, b, c`.
- **`through` clause on circle declarations**: `circle k = (o, 1) through a, b, c` works inline, mirroring the existing `line l = (1,) through p, q` form. With three placed points the circumcentre rule completes the circle.
- **Chaining constraint operators is now rejected**: `l through p parallel m` used to be silently accepted in line declarations (treating it as `l through p; l parallel m`) but was actually a parse error in standalone constraint statements. The reading is ambiguous (is `p` parallel to `m`?), so it's now a parse error everywhere. Each constraint clause needs its own statement.
- **Shared constraint-body parser**: standalone constraint statements (`l through p`), line-decl trailing clauses (`line l = (1,) through p`), and circle-decl trailing clauses now go through one shared parser. Future constraint operators added there automatically work in all three contexts.

## 0.3.24

- **Circles**: first-class element declared as `circle c = (p, 3)` (named centre + radius), `circle c = ((x, y), r)` (inline centre), or `circle c` (bare — centre at origin, radius 1).
- **`with center` and `with radius`**: alternative property syntax — `circle c with center p and radius 3`. Each parameter can be specified independently; `=` is optional.
- **Bundled forms for circles**: `circle c with center p = (5, 3)` declares point `p` and places it; `circle c with radius r = 4` declares scalar `r` with value 4.
- **On-circle constraints**: `p on c` constrains a point to a circle. Combined with another locus (line or second circle), a point can be placed at the exact intersection.
- **Three points determine a circle**: if three or more placed points lie on the same circle, the solver derives its centre and radius.
- **Derived circle radius**: a scalar declared without a value and used as a circle's radius is back-propagated when the radius is determined by an on-circle constraint.

## 0.3.23

- **Partial point declarations**: `point p = (5,)` declares a point with `x = 5` and `y` unknown; `point p = (,3)` declares the symmetric `y = 3, x` unknown form. The two halves can be combined across multiple statements — `point p = (5,)` followed by `point p = (,3)` merges to a fully placed point at `(5, 3)`. The syntax mirrors the existing partial-line forms `line l = (m,)` and `line l = (,b)`. Internally a partial point is treated as a point lying on an axis-aligned line, so existing constraints work without special cases: e.g. `point p = (5,); line l = (3, 2); p on l` resolves to `p = (5, 17)` automatically.

## 0.3.22

- **Unified solver architecture**: the old anchor-then-resolve two-pass solver has been replaced with a single loop that alternates between *propagate* (apply every forced placement) and *pick* (place one element by canonical gauge fixing or by a representative choice). Behaviour is identical — the rule-based strategy still passes the same 88 tests — but the internals are cleaner and easier to extend. The playground dropdown now reads `pick: rule` / `pick: budget` instead of `anchor: rule` / `anchor: budget`. The solver documentation has been rewritten to match the new structure.

## 0.3.21

- **Fix dof reporting for free 1-locus points**: a point with a known distance to a single placed neighbour (and no other constraints) used to be reported as fully determined when it happened to be placed first, even when the neighbour itself was at an arbitrary position. It is now correctly reported as underconstrained — the placement we picked is representative, not canonical. Affects scenes with disconnected components whose canonicalization can't be reached from the anchor (e.g. `point a; segment bc = 5`).

## 0.3.20

- **Better anchor accounting for partial lines with a free point**: `line l = (1,); point p on l` (and the symmetric direction-only / y-intercept-only forms) now resolves fully — the T-gauge that was previously unused is consumed by placing the point at the line's natural position (origin for slope-only and direction-only forms; the line's pinned point for y-intercept-only forms). Both line and point render as solid instead of underconstrained.
- **R-gauge tracking when canonicalizing line direction**: when a connected line gets a canonical default slope filled in (e.g. y-intercept-only line with a free point at the y-intercept), the line is marked as resolved (dof=0) if rotation-gauge was still available, rather than left as underconstrained.

## 0.3.19

- **Optional `=` in `with` clauses**: `line l with slope 2 and intercept 1` now parses the same as `line l with slope=2 and intercept=1`. The `=` between a property name and its value is optional; existing code is unchanged.
- **Bundled scalar declarations in `with` clauses**: `line l with slope m = 2` is sugar for `scalar m = 2; line l with slope=m` — declares a named scalar and uses it as the slope in one statement. Double-`=` forms like `with slope = m = 2` are rejected to enforce one binding per name.

## 0.3.18

- **Solver-derived scalars**: scalars can now be declared without a value (`scalar m`) and derived by the solver from geometric constraints. For example, `scalar m; line l = (m, -1, 0); l through (0,0); l through (1,3)` determines `m = 3`. Multiple scalars can be derived from the same element.
- **Bare scalar declarations**: `scalar m` (no `= value`) declares an unknown scalar whose value is determined by the solver.

## 0.3.17

- **Scalar declarations**: `scalar m = 3` declares a named constant usable anywhere a number is expected — coordinates, line equations, length constraints, inline tuples. Scalars support forward references and can reference other scalars.
- **`Scalar` type**: geometry primitives (`Point`, `Line`) are now defined in terms of `Scalar` (= `number`), documenting the relationship to the language concept.

## 0.3.16

- **Inline tuple refs**: numeric tuples can now appear wherever a name is expected — `line l perpendicular m at (1, -1)` places the intersection inline, `line l parallel (1, -1, 0)` references a line by equation, `p on (1, -1, 0)` constrains a point to an inline line. Optional `point`/`line` keyword disambiguates when the tuple length is ambiguous for the context.
- **Templatized element declarations**: `LineDecl` and `PointDecl` now share an `ElementDecl<K, T>` template with a `params: Nullable<T>` field, ready for future element types (e.g. circles).
- **Declarations no longer carry constraints**: inline sugar (`through`, `parallel`, `perpendicular`, `= 5`) is expanded by the parser into separate constraint statements. Declarations are pure declarations.

## 0.3.15

- **Line anchoring**: disconnected bare lines now correctly render as underconstrained when other elements (e.g. fixed points) consume the global symmetries that would otherwise absorb the line's degrees of freedom. Previously, a bare line always rendered as fully determined regardless of surrounding constraints.

## 0.3.14

- **Solver interface**: introduced a shared `Solver` interface (`ConstraintSet` → `SolveResult`) enabling swappable solver backends.
- **Elaboration layer**: new `elaborate.ts` transforms the AST into a solver-agnostic `ConstraintSet`, separating semantic analysis (ref resolution, unit conversion, shape expansion) from solving.
- **Geometric solver encapsulated**: existing solver code moved into `solver/geometric/` with a single public entry point (`GeometricSolver`).
- **Shared geometry types**: `Point` and `Line` defined once in the solver interface, used everywhere.
- **Removed `freeCoefs`**: line tooltips now always show concrete coefficients.

## 0.3.13

- **Line rendering by certainty**: underconstrained lines now render with a squiggly stroke; two-solution lines (e.g. `l parallel m at 3`) render with a jagged stroke. Both use the same colour coding as points and segments.
- **Line labels coloured by certainty**: label colour now matches the line's constraint state.
- **`pick` works for lines**: `pick l 1` / `pick l 2` selects one solution from a two-solution line, rendering it as fully resolved.
- **Line labels**: always visible, placed inset from the viewport edge with a small perpendicular offset so they stay inside the canvas at all orientations.
- **Line hover**: hovering over a line now shows a tooltip with its name and constraint state.

## 0.3.12

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
