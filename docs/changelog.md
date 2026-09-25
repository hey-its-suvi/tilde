# Changelog

## 0.3.44 — current

- **Brackets group.** `line l through (1,2) (3,4)` and `circle c with center (0,0) and radius 2` work: a bracketed group is worked out first and its result fills the slot it sits in, wherever that is. Groups can sit inside groups, and brackets around a single name or number change nothing.
- **`point p = (3, 4)`**, and a pair of numbers anywhere a point is expected. A pair is an ordinary definition in the prelude rather than something built into the language, and brackets are required when it is used — not because the definition says so, but because a slot takes one word, one number or one bracketed group.
- **A definition that makes something of its own no longer needs to be given a name.** Each use gets its own copy either way; previously one with nothing to name it by was refused.
- Mismatched brackets are reported where they are — a bracket never closed, one that closes nothing, or an empty pair.

## 0.3.43

- The pair syntax from 0.3.43 (`point p = (3, 4)`) has been withdrawn. It worked by treating brackets and commas as ordinary words in a pattern, which meant every place a pair could appear needed its own definition. Brackets are better used for grouping — so that `(3, 4)` is *a point* wherever one is expected, written once — and that is being designed rather than approximated.

## 0.3.42

- **Roadmap additions**: a true/false type with a third "not known yet" value; the ability to *ask* whether something holds as well as assert it, using the same words for both (`is a parallel b`); and arithmetic, with a note on what makes solving it harder than writing it.

## 0.3.41

- **A Limitations page**, listing what Tilde does not do yet and — more usefully — what it does *quietly*: constraints that are read and then ignored, answers chosen for you where your program was silent, and contradictions that leave a shape out rather than saying so. The aim is that you can tell a bug from a gap.
- **The Roadmap covers the definition syntax** now, and two entries claiming work was unfinished have been removed because it since got done.

## 0.3.40

- **`=` can be written where it reads naturally**: `point p = 3 5`, `scalar r = 2`, `a = 0 0`. It is not a built-in operator — it is a character a definition may use in its pattern, like `at` or `on`, and it means whatever that definition does. `at` still works exactly as before, and a program can give `=` its own meaning for its own shapes.
- **`=` reads as equality, never as assignment.** `r = 2` followed by `r = 3` does not change `r` to 3 — it says the number is both, which it cannot be, so `r` is left with no possible value. This was also a real bug: giving a number two different values used to keep the second one silently.
- **A definition's line now ends with `:` instead of `=`**, which is what frees `=` for use inside patterns:

  ```
  define point (n: Name) = (x: Scalar) (y: Scalar) => Point:
      point n at x y
      return n
  ```

## 0.3.39

- **Two named numbers can be made the same number**: `scalar h; h is w` says `h` and `w` are one number, and it does not matter which becomes known first. Neither is copied into the other — each is narrowed to what both could be, so the answer arrives from whichever direction it happens to come.
- **"Nothing known" and "no possible answer" are now different answers.** They used to be indistinguishable, both reported as an empty list. A shape nothing pins down could be *anything*; one that has been asked for the impossible could be *nothing*. Telling them apart is what lets two numbers be combined properly: the first constrains nothing, the second rules out everything.
- **An impossible number no longer stops the drawing.** `scalar a is 7` followed by `scalar b is 3` and `a is b` marks both as having no possible answer and leaves the rest of the figure alone, rather than abandoning the whole thing.

## 0.3.38

- **A way to see what your drawing actually pins down.** The strategy picker in the playground gains a `none` option, which places only what the constraints force and leaves everything else out. A drawing has to start somewhere, and when a shape is genuinely underdetermined something has to choose a representative — both are choices your program did not make, and this shows you where they happen. `point a at 0 0` followed by `point b` and a line through them draws only `a` under `none`: the point `b` and the line were being chosen for you.

## 0.3.37

- **Fixed: a definition could not reach a part of the shape it was given.** Writing `n.p at x y` inside a definition, where `n` is one of its slots, failed with *"n is not declared"*. The name and the part-of-a-name were being treated as unrelated, so the slot was never filled in. This affected `triangle` too — `triangle t with a b c` happened to work while `triangle q with a b c` did not, because the definition's own slot is called `t`.

## 0.3.36

- **A named number reports every possible answer, not just the first.** Where a shape has more than one possible position, a number read off it has more than one possible value — a point where a circle meets a line sits at x = 5 *or* x = −5. Previously such a number quietly reported 5, as though a choice had been made. It now reports both, stays in step with the shape answer-for-answer, and can be chosen between with `pick` like anything else.

## 0.3.35

- **Numbers can have names.** `scalar r is 3` names a number; `scalar r` on its own says only that *some* number is there, and leaves the solver to work out which.

  ```
  scalar r is 3
  point o at 0 0
  circle c with center o
  c with radius r
  circle d with center o
  d with radius r
  ```

  Both circles come out the same size, and if you change `3` they both follow. Neither circle was given a number of its own — `r` is what makes them agree.
- **A named number and the shape it describes settle each other, in whichever order the answer arrives.** Give the number and the shape takes it; pin the shape some other way and the number follows. Previously only the second direction worked — a named size was quietly ignored, and the shape drifted to wherever it would have gone anyway.
- **Anywhere a number can be written, a named one can go instead**: `point p at k j`, `point p at k 2`, `circle c with radius r`. Mixing the two in one statement is fine.

## 0.3.34

- **Shapes are made and named with three general-purpose words**, replacing the triangle-specific `holds`. `new` makes a shape of any kind, reaching down through whatever parts that kind is declared to have; `call` gives a second name to something that already exists; `segment` draws an edge between two points. A triangle is now written entirely in Tilde, with no escape into the implementation:

  ```
  define type Triangle =
      Point point1
      Point point2
      Point point3

  define triangle (t: Name) with (a: Name) (b: Name) (c: Name) => Triangle =
      new Triangle t
      call t.point1 a
      call t.point2 b
      call t.point3 c
      segment a b
      segment b c
      segment c a
      return t
  ```

  Anyone can write a shape this way — nothing here is reserved for the built-in ones. Corners are numbered rather than lettered so the naming carries to shapes with more of them.
- **A name given by `call` and the thing it names are one and the same.** After `triangle t with a b c`, `a` and `t.point1` are two names for one point: constrain either and you have constrained both. It is not a copy kept in step, so you can mix the two freely.
- **Triangle moved out of the core file**, since the solver knows nothing about it — it is three points and the edges between them, so it belongs with the other shapes.
- **Drawings label what you wrote.** A triangle's corners are stored under the triangle, but if you called them `a`, `b` and `c`, that is what appears on the canvas, and its edges read `ab`, `bc`, `ac` as they always have.
- A slot can be written `Any` when a definition works on a shape without caring what kind it is — `call` is the first to need it. Use it sparingly: a slot that accepts everything makes it easier to write two definitions that both match the same statement.

## 0.3.33

- **Types can declare what they contain**: a shape can now say what parts it is made of, and those parts can be reached by name.

  ```
  define type Triangle =
      Point a
      Point b
      Point c
  ```

  Fields are written type-then-name — `Point a` — the same order a statement declares a point in (`point a`), so the two read alike. With that, `triangle t with a b c` gives you `t.a`, `t.b`, `t.c` alongside the names you chose, and they are the same points either way: `t.a at 0 0` and `a at 0 0` do the same thing.
- **Dotted names work anywhere a name does.** `line l through t.a t.b`, `t.a on l`, `distance between t.a and t.b is 5`. The kind of thing dispatch sees is the field's kind, not the shape's, so `t.a on l` picks the point-on-line meaning without anything special.
- **You can declare your own types**, not just use the built-in ones — a `Segment` with a `from` and a `to`, say — and reach their parts the same way.
- A field always holds a whole shape: a point, a line, a circle. It cannot hold a *piece* of one, so there is no `Scalar x` inside a Point. This is deliberate — a line found by two tangency conditions has two possible answers, and those answers live in the line as a whole; splitting it into three separate numbers would turn two real answers into eight false ones.
- Mistakes are reported plainly: `Triangle has no field "z" (it has a, b, c)`, `Point has no fields, so "p.a" means nothing`, and setting a field to the wrong kind of shape names both kinds.

## 0.3.32

- **`return` says what a definition gives back**: a definition's body ends with `return`, naming which of the things it built comes back. Previously the last line's value was used, which meant the result depended on the order you happened to write the body in. Now order is free:

  ```
  define dot (n: Name) at (x: Scalar) (y: Scalar) => Circle =
      point n at x y
      circle c with center n and radius 1
      return c
  ```

  A definition that states `=> Circle` must have a `return`, and one that returns must state a type — mismatches are reported rather than silently handing back the wrong kind of thing. `return` may only be the last line: it says which value comes back, it does not skip anything. It joins `define`, `import`, `export` and `tsx` as the only words that cannot be redefined.
- **A definition can be used more than once**: names a body writes on its own account now belong to the call rather than the program. Calling `dot d at 3 4` and then `dot e at 1 1` used to fail with "c is already declared" — the `c` inside was one shared name. Each call now gets its own, keyed by the name you passed: `d_c`, `e_c`. Names that came from the call itself (`d`, `e`) are untouched. Definitions that name nothing of their own — which is all of the prelude — behave exactly as before.
- A definition that names something of its own but takes no `Name` slot to key it by is reported rather than silently colliding.

## 0.3.31

- **Definition syntax in the playground**: a `syntax:` picker in the header switches the editor between `classic` (unchanged, still the default) and `definitions`, a new front end where the language's own constructs are written in Tilde rather than built into the parser. In `definitions` mode a program starts with `import prelude`, and `point`, `line`, `circle`, `parallel`, `on` and the rest come from prelude files instead of the lexer — so you can write your own shapes and use them in the next line:

  ```
  import prelude

  define dot (n: Name) at (x: Scalar) (y: Scalar) => Circle =
      point n at x y
      circle c with center n and radius 0.001

  dot d at 3 4
  ```

  Each mode keeps its own saved buffer, so switching never overwrites the other.
- **Highlighting follows meaning, not spelling**: in `definitions` mode only four words are keywords — `define`, `import`, `export`, `tsx` — because everything else is defined in the prelude and can be redefined by anyone. The rest of the colouring comes from matching each line against the definitions in scope, so the values filling slots are told apart from the words around them. The same word can be either: `line l through p q` colours `line` as a pattern word, `p on line` colours it as a value. Your own definitions feed the same table, so a shape you invent highlights like a built-in one.
- **Optional semicolons**: a line may end with `;` anywhere a line ends — statements, imports, and the lines inside a definition. Never required, and a program written with them means exactly the same as one written without. Not allowed on a `define` line, which ends in `=` with its body still to come.
- Known limits in `definitions` mode: scalars, `pick`, `set unit`, `set grid`, point literals like `(2, 1)`, and bracketed sub-expressions are not available yet. A definition that names something in its body (rather than taking it from a slot) can only be used once — using it twice reports that name as already declared.

## 0.3.30

- **Docs site home page and styling**: retitled from "A geometric programming language" to "A geometry definition language" — Tilde is declarative, with no control flow, so "programming language" was misleading (and "geometric programming" is an unrelated term from convex optimisation). The old tagline is gone. The home page picks up a subtle graph-paper grid backdrop, and horizontal dividers in the docs (plus the sidebar group separators) render as dash-dot patterns instead of solid lines.

## 0.3.29

- **`with diameter` syntax for circles**: `circle c with diameter 6` is sugar for `with radius 3`. Combinable with `center` (`circle c with center p and diameter 8`) and the bundled-scalar form (`circle c with diameter d = 6` declares `scalar d = 6` — the diameter — and sets the circle's radius to 3). Only literal numbers are accepted today; for scalar-referenced or solver-derived sizes use `with radius`.

## 0.3.28

- **Circle as a point-on-locus stand-in**: `c on l` now means "c's centre is on line l", and the symmetric `l through c` means "l passes through c's centre". The same applies to segments (`c on ab`). Useful for classical compass-and-straightedge constructions where the centre's locus is constrained — inscribed circles, tangent circles, Apollonius problems. Two circles can't relate this way: `c1 on c2` and `c1 through c2` are now rejected at elaboration (previously they parsed silently with no geometric meaning).
- **Stricter naming checks**: using a circle name in a point position (e.g. `c = (3, 4)` when `c` is a circle) is now an elaboration error rather than silently creating a phantom point.
- **`On and through — the matrix`** doc section: the constraints docs gain a matrix listing every LHS / RHS element-type pair and what it means (or that it's rejected). The on-circle section also documents the `through` form (`circle c through p`).

## 0.3.27

- **Circle hover tooltip**: hovering over a circle in the playground now shows its label, centre, and radius instead of the stale tooltip text from the previously-hovered element. The hover handler also gains a fallback branch that shows the element's label (or `(no format)`) for any kind that doesn't have a custom formatter yet, so similar bugs won't repeat as new shapes are added.

## 0.3.26

- **Underdetermined circles render through their on-circle points**: a bare `circle c` with one or two placed points on it (e.g. `point p = (1, 2); circle c; p on c`) used to throw because the default radius of 1 conflicted with the constraint. The circle now places its anonymous centre canonically — at the origin for a single on-circle point, at the chord midpoint for two — and lets the radius be derived from there. The circle renders as wavy (its centre is a representative choice). Three or more on-circle points continue to determine the circle exactly via the circumcentre rule.

## 0.3.25

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
