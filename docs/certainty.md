# Certainty Model

Every point and segment in Tilde carries a **solutions** value that describes how well-determined it is. This drives the visual style.

## The three states

### `one` — uniquely determined

The vertex position follows logically from the constraints. There is exactly one valid placement.

**Rendered as:** crisp dot with a clean circle.

<TildeSketch source="
triangle abc with ab = 3 and bc = 4 and ca = 5
pick c 1
" :cx="1.5" :cy="2" :zoom="0.8"/>

### `infinite` — underconstrained

The vertex has more freedom than the constraints remove. It could be anywhere on a line, circle, or plane — an infinite continuous family of solutions.

**Rendered as:** dot with a wavy circle; segments rendered as squiggly lines.

<TildeSketch source="
triangle abc
ab = 5
" :cx="2.5" :cy="1.5" :zoom="1.2"/>

Here `c` is only constrained to lie on a circle around `b` at distance `bc` — its position along that circle is free.

### `multiple` — finitely many discrete solutions

The vertex is fully constrained in terms of DOF, but the constraint equations are nonlinear (quadratic) and yield more than one isolated solution.

**Rendered as:** dot with a jagged circle in amber; segments as jagged lines. Each solution is numbered.

<TildeSketch source="
line l = (1, 0, -3)
point a = (0, 0)
b on l
ab = 5
" :cx="1.5" :cy="0" :zoom="1.1"/>

Use `pick b 1` or `pick b 2` to select one.

## Why this matters

A `one` result means your figure is fully determined — you can trust the coordinates. An `infinite` result means you haven't constrained the figure enough; add more constraints to pin it down. A `multiple` result means your constraints are sufficient but geometrically ambiguous — use `pick` to choose.

## Inheritance

- A vertex placed by **circle intersection** inherits `free` from its neighbors: if either anchor was underconstrained, the result is too.
- A vertex placed by **on-segment** is always `infinite` — its position along the segment is unconstrained.
- A vertex placed by **heading** (P2) is always `infinite`.
