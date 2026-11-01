# Plan: interval backend

Tried on its own branch, `worktree-interval-backend`, so it can be dropped in
one go. This moves the lang↔solver and solver↔renderer boundary onto the
interval `Scalar` from `values/scalar.ts`, without rewriting the real
geometric solver.

## The design being tried

**The real solver is deleted, not parked.** `model.ts`, `model-io.ts`,
`geom.ts`, `types.ts`, `solver.ts`, `propagate/`, and `pick/` go away. They
stay in git history for whenever the solver itself is rewritten to be
interval-native — that is separate, future work, out of scope here. The new
contract replaces the old one in place, at `src/lang/solver/interface.ts`.

**A `ShellSolver` replaces `Solver`.** It does no geometric derivation —
nothing crosses between elements. Per element it only:

- merges direct constraints *on that element* (two `position` constraints on
  the same point intersect per axis; two `line-equation` constraints on the
  same line intersect per field; `circle-spec` likewise),
- merges `scalars-equal` pairs and `scalar-equality` against a literal by
  intersecting,
- resolves `scalar-equality`'s `{ element, field }` form (e.g. `circle c with
  radius k` ties `k` to `c.r`) by reading whichever side is already settled
  and intersecting it into the other — a lookup, not a derivation, since
  nothing about `c.r` or `k` is computed from anything else. This runs after
  the direct-fact pass above, in one or two fixed passes (so a short chain —
  a scalar bound to a field that's itself bound to another scalar — still
  settles), never an open-ended propagate-to-fixpoint loop,
- otherwise leaves a field exactly as declared, or whole (fully unknown) if
  nothing declared it.

`on-line`, `on-segment`, `on-circle`, `distance`, `angle`, `parallel`,
`perpendicular` are accepted (so `ConstraintSet` doesn't change shape) but
narrow nothing — they're relational and need real derivation, which is
exactly the complexity being deferred.

**No `ElementResult` wrapper, no `dof`.** `Scalar` already represents
"unknown" (whole), "contradiction" (`[]`), and "discrete multiple values" (a
union of singleton intervals) on its own — the old `{ solutions: T[] |
undefined, dof }` wrapper existed to let a number-only `T` carry those
states, and a pass-through solver has no `dof` to report anyway. The new
primitives are:

```
Point  = { x: Scalar, y: Scalar }
Line   = { a: Scalar, b: Scalar, c: Scalar }
Circle = { center: string, r: Scalar }
```

`SolveResult` is `Map<string, Point | Line | Circle | Scalar>` per kind, no
per-element wrapper.

**Renderer stays number-based; only the seam between changes.** `renderer/
interface.ts` and `canvas2d.ts` are untouched — pixels need plain numbers
regardless of what produced them. `solver/output.ts` (the scene graph
builder) is rewritten against the new `SolveResult`:

- a field that's empty (`[]`) anywhere in an element → contradiction, not
  drawn (unchanged from today).
- a field that's a singleton on every field the element needs → draw it,
  `'one'`.
- anything else — a genuine bounded range, a discrete union of more than one
  singleton (e.g. `{2} ∪ {5}`), or fully whole — is treated the same: **not
  drawn**, for now. A discrete multi-valued field is *not* given the old
  `'multiple'` treatment (drawing one point per combination of fields), even
  though it could be: doing that correctly needs each solution kept as a
  whole correlated element (an iterator over whole points, not independently
  uncertain fields recombined by cartesian product), which isn't built yet.
  Treating it like any other non-singleton avoids quietly shipping a
  half-right version of multiplicity now. `'infinite'`/`'multiple'` only ever
  got a pixel position in the old system because the *pick* phase invented a
  gauge-justified placement, or the real solver found correlated branches
  directly; a pass-through solver has neither. The wavy/jagged drawing code
  in `canvas2d.ts` is left in place, dormant, for whichever future solver can
  supply that again. Same treatment applies to printing a named scalar's
  value (`describe`/`show` in `solver/index.ts`): singleton prints the
  number, anything else prints as not yet known, no "2 or 5" text.

**`core.til` starts handing `Scalar` through, nothing more.** There's no
collapsing to stop — `+`/`-`/`*`/`/` on a named number already refuse anything
but a plain literal (`'arithmetic on a named number is not supported yet'`),
and `ScalarValue` (`defs/values.ts`) is defined but never actually
constructed anywhere today. The value layer genuinely is library-only, as the
revert commit said. So this step is just: wherever a `core.til` native
(`tsx`) block currently hands a literal `number` to `constrain(...)`, wrap it
as `exactScalar(n)` instead, so the boundary is consistently `Scalar`-typed.
Teaching arithmetic to produce real ranges is separate, future work — not
touched here.

**Pick-strategy switching goes away.** `rule` / `budget` / `none` were
policies for the real solver's gauge-fixing; there's nothing left for them to
pick between. `setPick` / `getPick` / `PICK_NAMES` / `PickName` are removed
from `solver/index.ts`, and the pick-picker dropdown is removed from the
playground header.

**Tests go with it.** `solver.test.ts` and anything testing `propagate/` or
`pick/` directly are deleted outright. Other test files keep whatever checks
language/elaboration behaviour or direct-fact merging, and drop whatever
asserted an outcome that required real geometric derivation (on-circle,
on-line, distance/angle placement, parallel/perpendicular inference,
intersections). The end state is a smaller, fully green suite — not a red one
with known-failing cases.

Steps 1 through 7 are listed separately for narrative clarity, but they're
mutually interdependent — none of it compiles or passes tests in any
in-between state, so they land as one commit ("the swap"). Step 8 (test
triage) turned out small enough to land in the same commit too — fixing the
compile breaks in it surfaced most of what needed trimming anyway, and
leaving the suite red even briefly wasn't worth the extra commit.

**Follow-up, after the swap landed:** `PositionConstraint.x`/`y`,
`LineEquationConstraint.a`/`b`/`c`, `CircleSpecConstraint.r` and
`ParallelConstraint.distance` dropped `| null` in favour of always being a
`Scalar`, defaulting to `wholeScalar()` when a statement doesn't mention that
field. `Scalar` already has its own identity element for "nothing said" —
intersecting whole with anything is a no-op, by definition, not an accident
of `ShellSolver` being simple — so a second `null` state for the same idea
was redundant. `CircleSpecConstraint.center: string | null` is unchanged: a
point-ref has no "whole" to default to.

## Status

| # | Step | State |
|---|------|-------|
| 0 | Plan written | done |
| 1 | New `solver/interface.ts`: `ConstraintSet`/`ResolvedConstraint` unchanged in shape, `Point`/`Line`/`Circle`/`Scalar`/`SolveResult`/`SolverInterface` rewritten against `values/scalar.ts` | done |
| 2 | Delete the real solver (`model.ts`, `model-io.ts`, `geom.ts`, `types.ts`, `solver.ts`, `propagate/`, `pick/`) and its dedicated tests | done |
| 3 | `ShellSolver`: direct-constraint merging only, per the rules above | done |
| 4 | Rewrite `solver/output.ts` against the new `SolveResult` | done |
| 5 | `solver/index.ts`: wire in `ShellSolver`, drop pick-strategy exports, rewrite `describe`/`show`/`equation` for `Scalar` leaves | done |
| 6 | `core.til`'s native (`tsx`) blocks wrap literal numbers as `exactScalar(n)` at each `constrain(...)` call site | done |
| 7 | Playground: remove the pick-picker dropdown | done |
| 8 | Triage remaining tests: strip assertions that needed real derivation, keep the rest | done — 369/369 green |

`segKey` also moved from the deleted `model.ts` into `interface.ts` (it's
boundary-level, not solver-internal), and `values/scalar.ts` gained
`singleValue` — the one case `numbersOf` doesn't cover: a single value or
`undefined`, never throwing on a range.

Full list of test files trimmed or deleted, and why — every case was the same
shape, something that needed on-line/on-circle/distance/angle/parallel/
perpendicular derivation, or point/scalar `=` chaining through one of those:

- Deleted outright: `solver.test.ts`, `anchor.test.ts` (tested
  `propagate`/`pick` directly).
- Trimmed: `circles.test.ts` (kept direct-fact circle declarations, dropped
  the whole `on-circle constraints` block), `print.test.ts` (two derived-line
  /circle-intersection cases), `read.test.ts` and `known-types.test.ts` (point
  `=` is distance-zero, relational), `brackets.test.ts` and `data.test.ts`
  (asserted a derived line resolved, now check the constraint set instead).
- Fixed only (same behaviour, new API): everything that compared raw
  `ConstraintSet` literals now wraps numeric fields in `exactScalar(...)`;
  everything reading a `SolveResult` now reads `Point`/`Line`/`Circle`/
  `Scalar` directly instead of through `.solutions`/`.dof`.

## Open questions, not decided here

- **Decided:** `ConstraintSet`'s `picks: Map<string, number>` (user solution
  picks) stays in the type and is threaded through unused — dead code, not
  worth stripping out now. It's likely to matter again once the real
  solver's eventual rewrite can surface multiple solutions as whole
  correlated elements, and ripping it out now just means re-adding it later.
- Exactly which existing test cases survive step 8 is a per-file judgement
  call made while doing that step, not decided in advance here.
