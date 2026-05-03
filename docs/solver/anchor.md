# Pass 2 — Anchor Selection

Tilde describes geometry in relative terms: "a triangle with sides 3, 4, 5". That description says nothing about *where* the triangle sits in the plane, which direction it faces, or what scale to use. Before placement can begin, the solver detects which of these global degrees of freedom are unconstrained and pins them to a canonical form.

## Degrees of freedom

A floating figure in the plane has three global degrees of freedom:

| DOF | What it means | Fixed by |
|---|---|---|
| **T** — translation | the figure can slide anywhere in the plane | an explicitly placed point, or a fully specified named line |
| **R** — rotation | the figure can rotate around any fixed point | a named line with a known direction, or two explicitly placed points |
| **S** — scale | the figure can be scaled up or down uniformly | a known length, or two explicitly placed points |

Pass 2 detects which of T, R, S are still free after Pass 1, then applies fixers in order to pin them down.

## The three fixers

### T fixer — translation

**Condition:** no point has explicit coordinates AND no named line has a fully known position.

The solver scans vertices in declaration order and picks the first one that is:
- not already explicitly placed
- not constrained to a named line
- not constrained to lie on a segment

That vertex is pinned to **(0, 0)** and becomes the **anchor**. All other vertices will be placed relative to it.

### R + S fixers — rotation and scale

After the T fixer runs (or if T was already fixed), the solver looks for a **reference vertex** to fix the remaining rotational and scale DOF. The reference must be free (not explicitly placed, not on a line, not on a segment), and is found by:

1. Preferring a vertex directly connected to the anchor by a segment (same component)
2. Falling back to any other free vertex in the model

Once found:

**R + S both free:** the reference vertex is placed at the canonical direction from the anchor (along +x), and the segment length is set to 1. Both position and scale are canonicalized in one step.

**R free, S fixed:** the reference vertex is placed along the canonical direction from the anchor at the existing known distance. Direction is canonicalized; scale was already determined.

**R fixed, S free:** no reference is needed for rotation. Instead, the first unconstrained segment between two free vertices is given a default length of 1.

## What "canonical" means

The canonical position is defined by constants in `anchor.ts`:

```
CANONICAL_X, CANONICAL_Y = (0, 0)   — anchor lands here
CANONICAL_DIR_X, CANONICAL_DIR_Y = (1, 0)   — reference placed in this direction
CANONICAL_SCALE = 1   — default length when scale is free
```

These are conventions, not constraints. A figure that is described purely in relative terms (no absolute coordinates, no explicit lengths) will always be placed at origin, facing right, with unit scale — a stable, predictable canonical form.

## What happens when DOF is already fixed

If explicit points or lengths already remove some DOF, the corresponding fixer is skipped:

- Two explicitly placed points → T, R, and S are all fixed; Pass 2 does nothing.
- One explicitly placed point → T is fixed; the solver still tries to fix R using the nearest free segment.
- A named line with known direction → R is fixed; T and S may still need fixers.

## Why not just always pin at (0, 0)?

Pinning an arbitrary vertex at (0, 0) would conflict with explicit position constraints — if `point a = (3, 4)` is declared, the anchor must not override it. Pass 2 only touches vertices that are genuinely free and not covered by any other constraint.
