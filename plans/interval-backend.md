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
- restates one directly-known fact in another element's terms where that's
  pure bookkeeping, not derivation — e.g. a partial `position` (`x` known,
  `y` free) still synthesises the axis-aligned line `x = <value>`, since that
  is the same fact written differently, not something solved for,
- merges `scalars-equal` pairs and `scalar-equality` against a literal by
  intersecting,
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
- a field that's a finite union of singleton intervals, for every field the
  element needs → draw one point/line/circle per combination: one combination
  is `'one'`, more than one is `'multiple'`. (This is actually new power —
  previously only the real solver's circle/line intersections produced
  `'multiple'`; now plain scalar arithmetic that lands on a discrete pair of
  values does too, for free.)
- anything else (a genuine bounded range, or fully whole) → **not drawn**.
  `'infinite'` only ever got a pixel position in the old system because the
  *pick* phase invented a gauge-justified placement for it; a pass-through
  solver has nothing to invent, so there is no anchor to draw a wavy mark at.
  The wavy drawing code in `canvas2d.ts` is left in place, dormant, for
  whichever future solver can supply that anchor again.

**Lang side stops collapsing.** Wherever elaboration currently converts an
evaluated scalar expression down to a plain `number` before building a
`ResolvedConstraint` (and throws if that collapse hits a real range), it
hands the already-evaluated `Scalar` straight through instead.

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

## Status

| # | Step | State |
|---|------|-------|
| 0 | Plan written | done |
| 1 | New `solver/interface.ts`: `ConstraintSet`/`ResolvedConstraint` unchanged in shape, `Point`/`Line`/`Circle`/`Scalar`/`SolveResult`/`SolverInterface` rewritten against `values/scalar.ts` | todo |
| 2 | Delete the real solver (`model.ts`, `model-io.ts`, `geom.ts`, `types.ts`, `solver.ts`, `propagate/`, `pick/`) and its dedicated tests | todo |
| 3 | `ShellSolver`: direct-constraint merging only, per the rules above | todo |
| 4 | Rewrite `solver/output.ts` against the new `SolveResult` | todo |
| 5 | `solver/index.ts`: wire in `ShellSolver`, drop pick-strategy exports, rewrite `describe`/`show`/`equation` for `Scalar` leaves | todo |
| 6 | Lang side stops collapsing evaluated scalars to `number` before the boundary | todo |
| 7 | Playground: remove the pick-picker dropdown | todo |
| 8 | Triage remaining tests: strip assertions that needed real derivation, keep the rest | todo |

## Open questions, not decided here

- Whether `ConstraintSet`'s `picks: Map<string, number>` (user solution picks)
  still means anything once there's no multi-branch derivation to pick
  between from geometry — scalar arithmetic can still produce a discrete
  multi-valued result (see `output.ts` rules above), so a pick may still be
  meaningful there. Left as-is for now; revisit if it turns out to be dead.
- Exactly which existing test cases survive step 8 is a per-file judgement
  call made while doing that step, not decided in advance here.
