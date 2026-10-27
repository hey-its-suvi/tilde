# Plan: interval value layer

Tried on its own branch, `worktree-interval-value-layer`, so it can be dropped in
one go. This is the value layer only: what a scalar and a bool are, and what
operations they support. No solver changes. Every step is one commit that keeps
the tests passing.

## The design being tried

**Everything is a set.** A bool is a subset of `{true, false}`. A scalar is a
normalised union of intervals. `{}` is a contradiction, the full set is
"unknown", and a singleton is "determined". There is no separate undefined state.

**Interval.** One contiguous run of numbers:

```
Bound    = { value: Number | null, open: boolean }
Interval = { low: Bound, high: Bound }
```

`value: null` means that side is unbounded, and its `open` is always `true`.
An exact value is `[a, a]`. Empty intervals are never stored.

The backend's number type is `Number`. Infinity is never a `Number`, so exact
backends never represent it.

**Scalar.** A sorted list of disjoint intervals, none touching. Overlapping or
touching intervals are merged on construction, so each scalar has one canonical
form and equality is structural.

**Bool.** A two-bit set. `and`, `or`, `not` are set operations applied to the
possible values.

**Arithmetic is behind an interface.** Scalar code calls `add`, `sub`, `mul`,
`div`, `sqrt` and `compare` on an `Arith` object. It never touches rounding or
float bits. The first backend is rounding float; a later exact backend (rationals
plus algebraic numbers) implements the same interface, and nothing above it
changes.

**Division by a set containing 0.** The divisor's 0 has no value and is dropped,
so `1 ÷ [0, 1]` is `[1, inf)`. Dividing by a set that is only `{0}` gives `{}`.
Splitting at 0 creates no branches: the result is a union of intervals.

**Not in this plan:** the `x − x` dependency problem (a solver concern), infinite
endpoints in `inf − inf` and `0 × inf` (decided per operation as they come up,
step 4), and points.

```
[1, 2] + [10, 20]  →  [11, 22]
[0, 1] ∪ [1, 3]    →  [0, 3]          (touching, so merged)
(0, 1) ∪ [1, 3]    →  (0, 3]          (1 is in the closed end, so merged; 0 stays open)
(0, 1) ∪ (1, 3]    →  (0, 1) ∪ (1, 3] (1 is in neither, so kept apart)
1 ÷ [0, 1]         →  [1, inf)
1 ÷ [-1, 1]        →  (-inf, -1] ∪ [1, inf)
```

## Status

| # | Step | State |
|---|------|-------|
| 0 | Plan written | done |
| A | Solver's scalar type and helpers move into `values/scalar.ts`, exact values only | done |
| 1 | `Interval` type: construction, emptiness, containment, ordering | done |
| 2 | Scalar: normalised union; union, intersect, complement | done, solver answer order broken (see open questions) |
| 3 | Arith interface and rounding float backend | done |
| 4 | Scalar arithmetic with the division rules above | todo |
| 5 | Bool: subset of `{true, false}`, `and`, `or`, `not`, comparisons | todo |
| 6 | Swappability check: a test suite that runs against any `Arith` | todo |

## Steps

### A. Scalar module, exact values only

Before any interval code, the solver's scalar type moves into one module.
`src/lang/values/scalar.ts` exports `Scalar` (`number[] | undefined`, where
`undefined` is unknown and `[]` is a contradiction), `intersectScalars` and
`sameScalars`. The solver imports from there. No behaviour change, so the test
suite is the check. Points, lines and circles still hold plain numbers.

Scalars and bools are two concrete types. They don't share a supertype. Each has
its own small helpers (`isSingle`, `isEmpty`), since there are only two.

### 1. `Interval`

New file `src/lang/values/interval.ts`, with a test file `src/tests/values.test.ts`.

- `interval(low, high)` takes two `Bound`s and returns `null` when empty
  (`low.value > high.value`, or equal values with either end open).
- `contains`, `isSingleton`, and a total order on intervals for sorting.

### 2. Scalar: normalised union

Same file family, `src/lang/values/scalar.ts`.

- Construction sorts and merges overlapping and touching intervals.
- `union`, `intersect`, `complement` on scalars.
- `isEmpty`, `isSingleton`, `isWhole` for the three states.

### 3. Arith interface and rounding float backend

`src/lang/values/arith.ts` defines the interface. `src/lang/values/float.ts` is
the first backend: each operation rounds its result outward, using `nextUp` and
`nextDown` on the IEEE bits, so a computed set always contains the true answer.

### 4. Scalar arithmetic

`add`, `sub`, `mul`, `div`, `sqrt` on scalars, going through the `Arith`
interface. Division applies the rules in the design above, and `sqrt` of a set
that dips below 0 keeps only its non-negative part.

### 5. Bool

`src/lang/values/bool.ts`. Four states as subsets of `{true, false}`. Comparisons
on scalars return a bool: `[1, 2] < [3, 4]` gives `{true}`, `[1, 4] < [3, 4]` gives
`{true, false}`, and an empty side gives `{}`.

### 6. Swappability check

Run the step 2 to 5 tests against an `Arith` built only from the interface. A
second, trivial backend (exact points, no rounding) is enough to show the seam.
If any test needs to know which backend it runs on, the interface is wrong.

## Open questions, not decided here

- **Answer order for scalars.** Normalising sorts a scalar's values, so a
  scalar's answers no longer match its element's answers by position, and
  `pick` on the scalar can pick a different answer from `pick` on the element.
  Three tests in `scalar-binding.test.ts` are skipped for this. Options under
  discussion: a view of the element's answers, or the solver keeping its own
  answer order.

- Whether an interval should carry its own precision, or the backend should
  decide.
- Whether the `Arith` interface needs a `zero` or `isZero` test, or whether
  comparisons cover it.
