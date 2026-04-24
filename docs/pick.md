# Pick

When a placement step has more than one discrete geometric solution, all are shown simultaneously as jagged numbered alternatives. `pick` selects one by index.

```
pick b 2
```

Index is **1-based**. The default (no pick) renders all solutions — useful for exploring which variant you want before committing.

## When does this happen?

Two cases produce multiple discrete solutions:

**Circle ∩ circle** — a vertex fully determined by distances to two placed neighbors (e.g. the third vertex of a triangle). The two solutions are mirror images across the baseline.
- Solution `1` — left-of-baseline (CCW winding)
- Solution `2` — right-of-baseline (CW winding)

**Circle ∩ line** — a vertex on a named line with a known distance to one placed neighbor.
- Solution `1` — higher y value
- Solution `2` — lower y value

## Example

Without `pick`, both solutions are shown jagged:

<TildeSketch source="
line l = (1, 0, -3)
point a = (0, 0)
b on l
ab = 5
" :cx="1.5" :cy="0" :zoom="0.5"/>

With `pick b 2`:

<TildeSketch source="
line l = (1, 0, -3)
point a = (0, 0)
b on l
ab = 5
pick b 2
" :cx="1.5" :cy="-2" :zoom="0.7"/>

## Multiple ambiguous vertices

Each vertex's pick is independent. For a triangle where `c` has two solutions:

```
triangle abc with ab = 3 and bc = 4 and ca = 5
pick c 1    # selects the upper solution
```

## More than two solutions

In principle, each ambiguous placement doubles the total solution count — a figure with three ambiguous vertices has up to 2³ = 8 total configurations. Each `pick` statement resolves one vertex independently.
