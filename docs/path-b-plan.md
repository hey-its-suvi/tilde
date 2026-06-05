# Path B: Unified Solver Plan

> Internal planning doc for a follow-up agent. Not user-facing documentation.

## Goal

Replace the current `AnchorStrategy` + `resolve()` split with a single solver loop. Anchors today are a separate pass that mutates a model, returns it, then `resolve()` runs a fixpoint over a different set of placement rules. Path B collapses them into one loop with two phases per iteration: **propagate** (apply forced placements) and **pick** (place one element by gauge claim or fallback).

This kills three problems:

1. The round-trip between anchor (which makes canonical choices) and resolve (which propagates constraints). Today they can't see each other's progress mid-pass.
2. The leaky abstraction where resolve's 1-locus heading-pick was doing implicit gauge consumption (fixed in commit `30a0442`, but the deeper architectural issue remains).
3. The split between `BarePointClaimant` / `BareRSReferenceClaimant` / future `LineClaimant` / etc. — each claimant handles one (shape, gauge-pattern) combo, leading to fragmentation. In the new loop, each shape has one claim function that decides per call what to do based on the current budget.

## Current state (as of commit `3584fed`)

- [src/lang/solver/interface.ts](src/lang/solver/interface.ts) — `Solver` interface (whole-pipeline contract: `solve(ConstraintSet) → SolveResult`). Already swappable.
- [src/lang/solver/geometric/](src/lang/solver/geometric/) — the only existing `Solver` implementation, `GeometricSolver`. Wires together:
  - `buildModel()` — ConstraintSet → GeomModel
  - `anchor.plan(model)` — gauge fixing (RuleBased or Budget)
  - `resolve(model)` — constraint propagation
  - `extractResult(model)` — GeomModel → SolveResult
- [src/lang/solver/geometric/anchor.ts](src/lang/solver/geometric/anchor.ts) — `RuleBasedAnchor`. Procedural, case-by-case T → R+S → line absorbing. Returns the modified model directly (interface refactored in commit `62901fb`).
- [src/lang/solver/geometric/budget-anchor.ts](src/lang/solver/geometric/budget-anchor.ts) — `BudgetAnchor` (WIP). Has `GaugeBudget`, a `Claimant` interface, and one `PointClaimant` (handles bare points + R+S reference + R-only known-length in one cascade).
- [src/lang/solver/geometric/resolve.ts](src/lang/solver/geometric/resolve.ts) — fixpoint loop over priority-ordered placement rules: exact → locus → fallback. Plus scalar bindings.
- [src/lang/solver/geometric/points.ts](src/lang/solver/geometric/points.ts), [lines.ts](src/lang/solver/geometric/lines.ts) — the rule functions called by resolve.

Test state: ANCHOR=rule passes 88/88. ANCHOR=budget passes 82/88, all 6 failures are line-related (no LineClaimant yet).

## Target architecture

One `Solver` class implements the existing `Solver` interface. It owns the loop and takes a `PropagateStrategy` + `PickStrategy` in its constructor. Those are the swappable bits.

```
Solver (interface — existing contract, single implementation)
  └─ Solver (class — owns loop, takes 2 strategies)
       ├─ PropagateStrategy
       │    ├─ GeometricPropagate    (ports current resolve.ts forced rules)
       │    └─ (future) NumericalPropagate, etc.
       └─ PickStrategy
            ├─ RuleBasedPick         (adapter wrapping rule anchor logic)
            └─ BudgetPick            (new, 1-dof claim primitives)
```

The interface and class share the name `Solver`. They live in different files; either alias one on import or rename the interface (see "File layout" below). There is no `DefaultSolver` / `LoopSolver` / `UnifiedSolver` — just `Solver`.

```ts
class Solver implements SolverContract {
  constructor(
    private propagate: PropagateStrategy,
    private pick: PickStrategy,
  ) {}

  solve(input: ConstraintSet): SolveResult {
    let model = buildModel(input)
    while (true) {
      const next = this.propagate.step(model) ?? this.pick.step(model)
      if (next === null) break
      model = next
    }
    return extractResult(model, input)
  }
}

interface PropagateStrategy {
  /** Apply one forced placement. Return new model or null. Pure: no mutation. */
  step(model: GeomModel): GeomModel | null
}

interface PickStrategy {
  /** Place one element — gauge-fixing if available, else representative.
   *  Return new model or null. Pure: no mutation, no instance state. */
  step(model: GeomModel): GeomModel | null
}
```

Both strategies are **stateless** — they take a model and return a new model. Any "state" (budget, etc.) is derived from the model on entry to each `step` call.

## Two phases per iteration

### Propagate

Apply every forced placement (constraints uniquely determine the element). Examples from current `resolve.ts`:

- `tryPlaceVertexByLineIntersectLine` — vertex on 2+ known lines → place at intersection
- `tryPlaceVertexByCircleIntersectCircle` — 2 distance-neighbors → 1/2 solutions
- `tryPlaceVertexByCircleIntersectLine` — 1 distance-neighbor + 1 line
- `tryCompleteLineByConstraint` — line with placed on-line points
- `tryApplyLineRelation` — parallel/perpendicular direction copy
- `tryResolveScalarBindings` — scalar = element.field propagation

These all produce `dof = 0` outputs and don't consume gauge. Port them as-is into `GeometricPropagate.step()`.

### Pick

Pick **one** element to place. Two sub-cases:

1. **Gauge-justified** — a gauge is still free. Consume it canonically; the specific coordinates represent an entire equivalence class under the gauge → `dof = 0`.
2. **Arbitrary** — no gauge available; the coordinates are a real choice. Internally prefer locus-aware positions (foot on a line, point on a circle around a neighbour) over isolated defaults for nicer visuals, but this is a tactical detail inside the sub-case, not a separate phase → `dof > 0`.

The picked element joins the placed set; the loop re-enters propagate, which may now fire on other elements that became forced.

The `dof` value is the only thing the renderer needs to distinguish solid from wavy (see "Tracking arbitrary vs determined" below). No `placedBy` tag is needed — `dof = 0` already means "solid (forced or gauge-justified)" and `dof > 0` already means "wavy (arbitrary or transitively arbitrary)."

## Gauge model — 1-dof primitives

Each gauge claim is **1-dof**. Bundles (T-full = 2 axes of T; R+S = direction + scale) are just consecutive 1-dof claims on the same element across iterations.

Available 1-dof claims:

| Claim | What it does | Prerequisites |
|---|---|---|
| T-x | Pin element's x coordinate to canonical | T-x not already pinned |
| T-y | Pin element's y coordinate to canonical | T-y not already pinned |
| T-along-direction `d` | Pin projection onto `d` to canonical | residual T in direction `d` is free |
| R | Pin orientation/direction | R free; needs a pivot/reference |
| S | Pin a magnitude (length, radius) to canonical | S free; needs something to scale |

For a bare point with all gauges free: one `step` call claims T-x (point on y-axis, `dof = 1`), next call claims T-y (point at origin, `dof = 0`). Two iterations, same result as the old "T-full" bundle.

For two bare lines (the [line l; line m] case that motivated this work):
- iter 1: l claims R + T-perp → `l: y=x, c=0`. R consumed, T pinned along (1,-1)/√2.
- iter 2: m claims residual T-along-l direction → `m.c = 0` (m passes through origin), direction stays free → `dof = 1`.

The cleaner mental model: a 1-dof gauge claim narrows one degree of freedom; element `dof` only reaches 0 when enough claims (and forced placements) compose.

## The `deriveBudget` function — critical correctness piece

`BudgetPick` is stateless because the budget is **derived from the model on every call**. The model already contains all the placements; the budget is just a reading of which gauge axes are no longer available.

```ts
function deriveBudget(model: GeomModel): GaugeBudget {
  const b = new GaugeBudget()

  // Lines with known direction → R consumed.
  // Lines with known position → T-perp consumed.
  for (const wl of model.lines.values()) {
    const { a, b: lb, c } = workingVal(wl)
    if (a !== null && lb !== null) {
      b.claimR()
      if (c !== null) {
        const n = Math.hypot(a, lb)
        if (n > EPS) b.claimT({ dx: a/n, dy: lb/n })
      }
    }
  }

  // Each pinned point consumes T-full (or residual T if line already pinned).
  // Trick: try claimT on x and y axes separately. GaugeBudget.claimT checks
  // linear independence with already-pinned directions, so:
  //   - no prior pinning → both succeed → T-full
  //   - T-perp pinned by a line → only the residual axis succeeds → T-full
  for (const wp of model.points.values()) {
    if (!isWorkingComplete(wp)) continue
    b.claimT({ dx: 1, dy: 0 })
    b.claimT({ dx: 0, dy: 1 })
  }

  // R: any two distinct pinned points consume R.
  // S: any known length, OR any pinned point at non-zero distance from origin.
  // ...
  return b
}
```

**Why this matters.** The current `preDebit` in `budget-anchor.ts` calls `claimTFull()` for the first pinned point, which fails silently if T-perp was already pinned by a line. That misses the residual T-along consumption. The pinned point at, say, (0,0) on a line through origin actually consumes both T-perp (the line's normal) AND T-along (the projection onto the line direction). Without the fix above, subsequent claims would think T-along is free when it isn't.

The fix is the per-axis claim trick. Replace `preDebit` with `deriveBudget`, call it inside `BudgetPick.step()`, never persist a `GaugeBudget` across calls.

## File layout

New files live alongside the existing structure. The old `geometric/` directory stays untouched during migration and gets deleted at the end.

```
src/lang/solver/
  interface.ts             # existing — Solver interface lives here. Either
                           # rename to SolverContract or import-alias when
                           # the class lands; pick one.
  solver.ts                # new — Solver class implementing the interface
  propagate/
    interface.ts           # PropagateStrategy
    geometric.ts           # GeometricPropagate (ports resolve.ts rules)
  pick/
    interface.ts           # PickStrategy
    budget.ts              # BudgetPick + deriveBudget + GaugeBudget helper
    rule-based.ts          # RuleBasedPick adapter (wraps RuleBasedAnchor)
  geometric/               # legacy — leave untouched until migration ends
  index.ts                 # existing wiring; updates to swap in new Solver
  output.ts                # existing
```

After migration, the `geometric/` directory is gone and the data-only helpers (`model.ts`, `types.ts`, `geom.ts`) move up to `src/lang/solver/` or into a `model/` subdirectory.

## How to work

- **Branch off main.** Create a feature branch for this work. Do not commit to main until the migration is complete and the default is switched. Each step in the implementation order below is independently committable on the branch.
- **Ask, don't assume.** This plan was written ahead of implementation and there are decisions baked in that may turn out to be wrong. Surface any question or doubt, however small — naming, file layout, signature shape, ambiguous behaviour in the existing code, anything. Do not silently make assumptions. Bringing things up early is far cheaper than backing out a wrong decision later.

## Implementation order

The approach is **adapter-first**: stand up the new architecture by wrapping the existing mutating code rather than rewriting it. This makes step 1 small and reversible; the only genuinely new logic is `BudgetPick`. Real ports (replacing adapters with pure-return-new-model implementations) are optional cleanup at the end.

Each step should keep all existing tests passing under the current default. Verify after every step.

1. **Scaffold the new module.** Create the directory layout above. Resolve the `Solver` interface vs class naming collision (rename interface to `SolverContract` in `interface.ts`, or use `import { Solver as SolverContract }` in `solver.ts` — pick one and ask if unsure). Define `PropagateStrategy` and `PickStrategy` interfaces. Empty `Solver` class skeleton. No behaviour yet.

2. **Build the propagate adapter.** Wrap the existing exact-rule `try*` functions from [resolve.ts](src/lang/solver/geometric/resolve.ts) without modifying them:

   ```ts
   class GeometricPropagateAdapter implements PropagateStrategy {
     step(model: GeomModel): GeomModel | null {
       const scratch = cloneModel(model)
       const st = makePlacementState(scratch)
       let changed = false
       while (true) {
         if (tryApplyLineRelation(scratch))                      { changed = true; continue }
         if (tryPlaceVertexByLineIntersectLine(scratch, st))     { changed = true; continue }
         if (tryPlaceVertexByCircleIntersectCircle(scratch, st)) { changed = true; continue }
         if (tryPlaceVertexByCircleIntersectLine(scratch, st))   { changed = true; continue }
         if (tryCompleteLineByConstraint(scratch, st))           { changed = true; continue }
         if (tryResolveScalarBindings(scratch))                  { changed = true; continue }
         break
       }
       return changed ? scratch : null
     }
   }
   ```

   Important: only the **exact** rules go in propagate. The locus and fallback rules from `resolve.ts` (`tryPlaceVertexByLocus`, `tryCompleteLineByDefault`, `tryPlaceVertexByFallback`) belong to pick — they're arbitrary placements.

   The `try*` functions take a `PlacementState`. Construct one from the model on entry (mirror what `resolve()` does at startup).

3. **Build the rule-based pick adapter.** Wrap `RuleBasedAnchor.plan()` plus the locus/fallback `try*` functions:

   ```ts
   class RuleBasedPickAdapter implements PickStrategy {
     step(model: GeomModel): GeomModel | null {
       // 1. Try gauge fixings via the existing rule anchor.
       const afterAnchor = ruleBasedAnchor.plan(model)
       if (!modelsEqual(afterAnchor, model)) return afterAnchor

       // 2. Fall back to locus/fallback rules.
       const scratch = cloneModel(model)
       const st = makePlacementState(scratch)
       if (tryPlaceVertexByLocus(scratch, st))    return scratch
       if (tryCompleteLineByDefault(scratch, st)) return scratch
       if (tryPlaceVertexByFallback(scratch, st)) return scratch
       return null
     }
   }
   ```

   `modelsEqual` is a structural deep-equality check on the relevant model fields. Implement minimally — it just needs to detect whether the anchor placed anything new.

   Note: `RuleBasedAnchor.plan()` already returns a clone (since the earlier refactor). The first call places gauge fixings; on subsequent calls, the input model already has those placements, so `plan()` is essentially a no-op and `modelsEqual` returns true.

4. **Wire into the selector.** [src/lang/solver/index.ts](src/lang/solver/index.ts) currently has `setAnchor(name)` selecting between rule and budget anchors inside `GeometricSolver`. Add a new selector option that uses the new `Solver` with `GeometricPropagateAdapter` + `RuleBasedPickAdapter`. Keep the legacy `GeometricSolver` path available for now.
   - Suggested toggles during migration: `legacy-rule` (existing GeometricSolver + RuleBasedAnchor), `loop-rule` (new Solver + adapters).
   - Both paths should produce **identical** test results (88/88) because `loop-rule` is literally calling the same underlying code through adapters.

5. **Build `BudgetPick`.** This is the only genuinely new piece of logic.
   - Implement `deriveBudget(model)` with the per-axis claim trick described above. This replaces the existing lossy `preDebit` in [budget-anchor.ts](src/lang/solver/geometric/budget-anchor.ts).
   - Port the cascade from the existing `PointClaimant` ([budget-anchor.ts](src/lang/solver/geometric/budget-anchor.ts)) into `BudgetPick.step()`, with these changes:
     - Place ONE element per `step` call (not iterate all). The Solver's outer loop re-enters automatically.
     - Each "case" (T-full, R+S, R-only) decomposes into 1-dof claims. If only T-x can fit one iteration, do that, return. Next iteration may claim T-y on the same point.
     - Add line-element cases per the existing handover plan (bare lines claim R + T-perp; second bare line uses residual T-along).
   - For locus and fallback (arbitrary picks when no gauge available), reuse the same approach as in `RuleBasedPickAdapter` — call the existing `tryPlaceVertexByLocus` / `tryCompleteLineByDefault` / `tryPlaceVertexByFallback` functions.
   - Add a `loop-budget` toggle. Get it to 88/88 (the 6 currently-failing budget tests for line cases should now pass).

6. **Migrate the default.** Once `loop-budget` hits 88/88 and stays there, switch the default to the new `Solver` with `BudgetPick`. At this point the `legacy-rule` toggle and the `GeometricSolver` class can be removed from the selector. Note: the underlying `geometric/` files are *still in use* — both adapters call into them. Nothing in `geometric/` gets deleted yet.

7. **Optional cleanup: port adapters to direct implementations.** This is a follow-up that can be done at leisure (or never, if the adapters are working fine). Replace each adapter's call into `geometric/` with an in-place pure implementation, then delete what's no longer used:
   - Move the exact `try*` rule logic out of [resolve.ts](src/lang/solver/geometric/resolve.ts) and into `propagate/geometric.ts`. Rewrite to return-new-model rather than mutate. Delete `resolve.ts`.
   - Port `RuleBasedAnchor.plan()` logic into `pick/rule-based.ts` (or delete `RuleBasedPick` entirely if no longer needed once `BudgetPick` is the default). Delete `anchor.ts`.
   - Move `tryPlaceVertexByLocus` / `tryCompleteLineByDefault` / `tryPlaceVertexByFallback` (the locus/fallback rules) into the pick strategies.
   - Delete `budget-anchor.ts` (logic now lives in `pick/budget.ts`).
   - Delete `GeometricSolver` class ([geometric/index.ts](src/lang/solver/geometric/index.ts)).
   - Move data-only files (`model.ts`, `types.ts`, `geom.ts`) up out of `geometric/`. Delete the empty `geometric/` directory.

## What to keep, what to delete

**Keep:**
- `GeomModel` and helpers in [model.ts](src/lang/solver/geometric/model.ts) — the data structure stays.
- `WorkingPoint/Line/Scalar` types in [types.ts](src/lang/solver/geometric/types.ts) — these are model internals.
- `geom.ts` (geometric utility functions: `lineIntersect`, `circleIntersectBoth`, etc.).
- The constraint application logic in `GeometricSolver.buildModel` — needed to turn ConstraintSet into GeomModel.
- The `extractResult` logic — needed to turn GeomModel into SolveResult.
- [Tests](src/tests/) — should continue to pass throughout the migration.

**Delete after migration:**
- `anchor.ts` (rule anchor implementation, after RuleBasedPick stops being needed)
- `budget-anchor.ts` (the old budget anchor with its Claimant interface)
- `resolve.ts` (replaced by GeometricPropagate)
- `GeometricSolver` class (replaced by the new `Solver` class)

**Keep around during migration:** all of the above, until tests pass on the new path.

## Key decisions already made (don't re-litigate)

- **Strategies are pure.** `step(model) → model | null`. No mutation of inputs, no instance state.
- **Budget is derived from model.** Not maintained as separate state. `deriveBudget` runs on every `BudgetPick.step` call.
- **Per-axis T claims for the derivation.** The trick that handles the "line consumes T-perp, point gets placed at origin by propagation, T-along now also consumed implicitly" case. See the `deriveBudget` snippet above.
- **1-dof primitives.** Bundles emerge from consecutive 1-dof claims. Don't bake bundle semantics into the strategy.
- **One claimant per element type.** Not per (element, gauge-pattern). `PointClaimant`'s cascade is the model; same shape for `LineClaimant` (when added) and future shapes.
- **No mutating budget between solves.** With derive-from-model this is moot.
- **`Solver` interface stays.** The whole-pipeline contract for future radical alternatives (numerical solver from scratch, etc.).
- **Pick has two sub-cases, not three.** Gauge-justified (dof=0) and arbitrary (dof>0). Locus-aware visuals are a tactical preference inside the arbitrary case, not its own architectural phase.
- **`dof` is how we track "arbitrarily placed" vs "determined".** No separate provenance tag — the existing `dof` field already drives the wavy-vs-solid renderer distinction. See "Tracking arbitrary vs determined" below.

## Tracking arbitrary vs determined

The renderer draws a wavy outline for "arbitrarily placed" elements and a solid one for "determined" ones. This is keyed on `dof` — see [output.ts:solutionsStatus](src/lang/solver/output.ts) and [canvas2d.ts:292](src/renderer/canvas2d.ts#L292):

- `dof > 0` → `solutions = 'infinite'` → wavy
- `dof = 0` → `solutions = 'one'` → solid

The new loop must maintain this convention. The discipline per phase:

- **Propagate** (forced) → sets `dof = 0` if both inputs are forced; otherwise `dof` is inherited from the inputs (see [points.ts:58, 93](src/lang/solver/geometric/points.ts#L58) — circle∩circle and circle∩line compute `inheritedDof` from neighbour dofs). This inheritance must be preserved: an exact placement whose neighbours are wavy is itself wavy, because its position is determined *relative to* an arbitrary base.
- **Pick A (gauge-justified)** → sets `dof = 0`. The gauge claim fully fixes the element.
- **Pick B (arbitrary)** → sets `dof > 0`. The exact value depends on how many free dimensions remain (typically 1 for an on-circle locus, 2 for an isolated default).

Examples of where dof is set in the current code to mirror:
- [anchor.ts:94](src/lang/solver/geometric/anchor.ts#L94) — T-anchor pin: `dof = 0` (gauge-justified).
- [points.ts:42](src/lang/solver/geometric/points.ts#L42) — line∩line: `dof = 0` (forced).
- [points.ts:141](src/lang/solver/geometric/points.ts#L141) — locus on a line, foot of perpendicular: `dof = 1` (arbitrary).
- [points.ts:194](src/lang/solver/geometric/points.ts#L194) — isolated fallback: `dof = 1` (arbitrary).

Same conventions apply in `BudgetPick` and `GeometricPropagate`.

## Test expectations during migration

- The existing default path (currently ANCHOR=rule against `GeometricSolver`) MUST stay at 88/88 throughout. Don't touch `geometric/` until migration completes.
- The new path is allowed to fail tests during build-out. Run tests under both the legacy and new toggles after each step to ensure no regression on the production path.
- The 6 line-related failures under current ANCHOR=budget (see [budget-anchor.ts](src/lang/solver/geometric/budget-anchor.ts) handover TODO) will be the natural test set for `BudgetPick`'s line claim logic. Get those to pass.

## Reference: the `line l; line m` case

This was the motivating case. The current rule-anchor canonicalizes both lines to `y = x` (wrong — they coincide). The right answer: l at `y = x` through origin, m through origin with direction free (1 dof remaining = the angle between them).

In the new loop with `BudgetPick`:
- iter 1: propagate fires nothing. pick A: l claims R (slope 1) → `l: a=1, b=-1`. `dof = 1` for l (c unknown).
- iter 2: propagate fires nothing. pick A: l claims T-perp → `l.c = 0`. `l: y = x`, fully determined. R and T-perp consumed.
- iter 3: propagate fires nothing. pick A: m tries to claim R → fails (gone). Tries residual T-along → m's c gets set such that m passes through origin. `dof = 1` for m (direction is the remaining free dof).
- iter 4: nothing fires. Done.

End state: l fully determined, m through origin with direction free. l renders solid (`dof = 0`), m renders wavy (`dof = 1`). Matches the geometry.

## Open question for the implementer

Whether to expose all three migration toggles (`legacy-rule`, `loop-rule`, `loop-budget`) during the build-out or just one new option (`loop-budget`) alongside the existing default. The fewer toggles the easier; the more the easier to debug. I'd lean toward just the new one for the initial commits, expanding only if a specific comparison is needed.

## What "done" looks like

- The new `Solver` class is what `src/lang/solver/index.ts` instantiates.
- `BudgetPick` is the default `PickStrategy`.
- `GeometricPropagate` is the default `PropagateStrategy`.
- `geometric/` directory has only the data types (`model.ts`, `types.ts`, `geom.ts`) — no anchor or resolve code — OR is gone entirely with those moved up.
- All 88 tests pass.
- A new test or two for the `line l; line m` case (currently no test for it; add `assertLineEq(scene, 'l', 1, -1, 0)` + `assertLine(scene, 'm', 'infinite')`).
- Changelog entry describing the architectural change.
