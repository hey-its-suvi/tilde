# Pass 1 — Constraint Model

Pass 1 walks every statement in the program and builds the **constraint model** — a graph of vertices and the relationships between them. This is the data structure Pass 3 works from when placing vertices.

## What gets built

By the end of Pass 1, the model holds:

| Structure | What it stores |
|---|---|
| `points` | Every declared vertex, initially unplaced (`dof = 2`, coordinates null) |
| `segments` | The set of all declared edges, as canonical pairs |
| `lengths` | A length value for each segment that has one, or `null` |
| `lines` | Named lines, stored as `(a, b, c)` where any coefficient may be `null` for partial/bare declarations |
| `onLine` | Which vertex is constrained to which named line(s) |
| `onSegment` | Which vertex is constrained to lie on which segment |
| `solutionPicks` | Which solution index was chosen for each ambiguous vertex |

## How shapes become vertices and edges

A shape declaration registers its vertices and the edges between them. No positions are assigned yet — that's Pass 3's job.

```
let triangle abc
```

This registers vertices `a`, `b`, `c` and three edges: `a–b`, `b–c`, `c–a`.

```
let segment ab
```

Registers vertices `a`, `b` and one edge: `a–b`.

Inline length constraints attach length values to the edges at the same time:

```
triangle abc with ab = 3 and bc = 4 and ca = 5
```

Registers the triangle and sets `|ab| = 3`, `|bc| = 4`, `|ca| = 5`.

## How constraints layer on top

Constraints declared separately (via `with` blocks or standalone statements) add information to what's already registered. A `length` constraint sets a length on an existing or new edge. An `on-line` or `on-segment` constraint records that a vertex must lie on a specific line or segment.

```mermaid
flowchart LR
    S["Shape declaration\n`let triangle abc`"] --> V["Vertices registered\na, b, c"]
    S --> E["Edges registered\na–b, b–c, c–a"]

    C1["Length constraint\n`= 3, 4, 5`"] --> L["Lengths stored\n|ab|=3, |bc|=4, |ca|=5"]

    C2["On-line constraint\n`p on L`"] --> OL["onLine: p → L"]
    C3["On-segment constraint\n`p on ab`"] --> OS["onSegment: p → (a,b)"]

    V --> M([Constraint model])
    E --> M
    L --> M
    OL --> M
    OS --> M
```

## Pick statements

`pick v 2` tells the solver that when vertex `v` has two possible positions, it should use position 2. These are recorded during Pass 1 and consulted during placement in Pass 3.

## What Pass 1 does and does not do

Pass 1 **does** assign coordinates to explicitly placed vertices — `point a = (3, 4)` or `a = (3, 4)` inside a `with` block resolves immediately to `dof = 0`. Every other vertex enters Pass 3 as an unplaced working point: both coordinates null, `dof = 2`. The constraint model is purely relational for those: it says *what exists* and *what constraints apply*, not *where anything is*.
