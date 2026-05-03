# Solver

Tilde's solver works the way a human does when solving a geometry problem by hand: start from what you know, apply a construction, find a new point, repeat. Each vertex is placed by intersecting circles, lines, or both — exact constructions, not approximations. A triangle with sides 3, 4, 5 always produces a right angle of exactly 90°.

This also means the solver fails loudly when constraints are inconsistent, rather than silently producing a nonsensical result.

## The four passes

Every time you edit a program, the solver runs four passes in sequence:

```mermaid
flowchart TD
    A([Program AST]) --> P0

    P0["Pass 0 — Unit Resolution
    Determine the active unit.
    Use explicit 'set unit', or
    infer it from the first suffixed length."]

    P0 --> P1

    P1["Pass 1 — Constraint Model
    Register all shapes, lines, and points.
    Apply length, on-line, on-segment constraints.
    Record pick statements."]

    P1 --> P2

    P2["Pass 2 — Anchor Selection
    Detect which global DOFs are free (T, R, S).
    Apply canonical fixers: pin anchor at origin,
    place reference vertex to fix orientation/scale."]

    P2 --> P3

    P3["Pass 3 — Fixpoint Placement
    Repeatedly scan all unplaced vertices.
    Place each one using the highest-priority
    rule that applies. Repeat until done."]

    P3 --> OUT
    OUT([Scene Graph])
```

## Pages

- [Pass 0 — Unit Resolution](./unit-resolution) — how Tilde decides what a bare number means
- [Pass 1 — Constraint Model](./constraint-model) — the graph of vertices, lengths, and relationships the solver works from
- [Pass 2 — Anchor](./anchor) — DOF detection and canonical fixers for translation, rotation, and scale
- [Pass 3 — Placement](./placement) — the core fixpoint loop that places every vertex and completes every line
- [Types](./types) — the working types, output types, and helpers used throughout the solver
