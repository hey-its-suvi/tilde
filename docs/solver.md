# Solver

Tilde uses a **constructive constraint solver** — analytical, not numerical. It works by reducing each vertex placement to a known geometric construction (circle intersection, line intersection, etc.) and solving exactly.

## Overview

```
Program (AST)
     │
     ▼
 ┌─────────┐
 │  Pass 1  │  Register shapes, lines, points.
 │          │  Apply constraints to model.
 │          │  Read settings (grid, winding…).
 └────┬─────┘
      │
      ▼
 ┌─────────┐
 │  Pass 2  │  Set anchor point at (0, 0).
 │          │  Default: first declared vertex.
 └────┬─────┘
      │
      ▼
 ┌─────────────────────────────────────────────────────┐
 │  Pass 3 — fixpoint placement loop                   │
 │                                                     │
 │  Repeat until no new vertex is placed:              │
 │                                                     │
 │  P1   Circle ∩ Circle                               │
 │       2+ placed neighbors with known distances      │
 │       → solve two-circle intersection               │
 │       → 1 or 2 solutions (store all if unpicked)    │
 │                                                     │
 │  P1b  Circle ∩ Line                                 │
 │       vertex is on-line AND has 1 dist neighbor     │
 │       → solve circle-line intersection              │
 │       → 1 or 2 solutions (store all if unpicked)    │
 │                                                     │
 │  P2   Single dist neighbor                          │
 │       exactly 1 placed neighbor with known dist     │
 │       → place along rotating heading (+x, +y, -x…) │
 │       → marks vertex free=true (underconstrained)   │
 │                                                     │
 │  P3   On-line only                                  │
 │       vertex is on-line, no dist neighbors yet      │
 │       → place at foot of perpendicular from origin  │
 │       → free=true                                   │
 │                                                     │
 │  P3b  On-segment, both endpoints placed             │
 │       distribute n points evenly: t = (i+1)/(n+1)  │
 │       → always free=true                            │
 │                                                     │
 │  P4   Segment neighbor, no known dist               │
 │       → place DEFAULT_LEN (3 units) along +x        │
 │       → free=true                                   │
 │                                                     │
 │  Remaining isolated vertices → place at (3, 0)      │
 └────┬────────────────────────────────────────────────┘
      │
      ▼
 ┌─────────┐
 │  Output  │  Build SceneGraph from model.
 │          │  Emit ScenePoint × N for 'multiple' vertices.
 └─────────┘
```

## Constraint model

The model accumulated in Pass 1:

| Structure | Contents |
|---|---|
| `points` | All declared vertices, with `(x, y, free)` |
| `segments` | Set of canonical segment keys `"a:b"` |
| `lengths` | Map of segment key → length (or null) |
| `angles` | Map of angle key → degrees (or null) |
| `lines` | Named lines as `ax + by + c = 0` |
| `onLine` | Vertex → line name |
| `onSegment` | Vertex → segment endpoints |
| `solutionPicks` | Vertex → 1-based solution index |

## Circle intersection

For a vertex `v` with two placed neighbors `a` (distance `r₁`) and `b` (distance `r₂`):

1. Compute the foot `m` along `ab` at distance `A = (r₁² - r₂² + d²) / 2d`
2. Compute perpendicular offset `h = √(r₁² - A²)`
3. Two solutions: `m ± h·n̂` where `n̂` is the unit normal to `ab`
4. Solution 1 = left-of-AB (CCW); Solution 2 = right-of-AB (CW)

## Circle-line intersection

For a vertex `v` on line `ax + by + c = 0` with one placed neighbor `p` (distance `r`):

1. Project `p` onto the line → foot `f`
2. Compute distance `d` from `p` to line
3. If `d > r`: no solution → `ConstraintError`
4. Offset along line by `h = √(r² - d²)`
5. Two solutions: `f ± h·t̂` where `t̂` is the unit tangent of the line
6. Solution 1 = higher y; Solution 2 = lower y

## Solutions model

Each vertex ends up with one of three states:

| State | Meaning | Visual |
|---|---|---|
| `one` | Uniquely determined | Crisp dot + circle |
| `multiple` | Finitely many discrete solutions | Jagged dot + jagged lines, numbered |
| `infinite` | Continuous family (underconstrained) | Wavy dot + squiggly lines |

Use `pick v N` to collapse a `multiple` vertex to `one`.
