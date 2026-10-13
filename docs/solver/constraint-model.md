# Constraint Model

Before the solver loop can run, every statement in the program gets walked once to build the **constraint model** — a graph of vertices and the relationships between them. This is the data structure the [placement loop](./placement) works from.

## What gets built

The model holds:

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

The solver never sees a triangle. `triangle t with a b c` reaches it as three
points and the three segments between them; no positions are assigned yet —
that's the [placement loop](./placement)'s job.

```
triangle t with a b c
```

This registers vertices `a`, `b`, `c` and three edges: `a–b`, `b–c`, `c–a`.

```
segment a b
```

Registers one edge: `a–b`.

## How constraints layer on top

Each constraint a program states adds information to what is already
registered. A distance sets a length on an edge (adding the edge if it is new).
An on-line or on-circle constraint records that a vertex must lie on a specific
line or circle.

```mermaid
flowchart LR
    S["`triangle t with a b c`"] --> V["Vertices registered\na, b, c"]
    S --> E["Edges registered\na–b, b–c, c–a"]

    C1["`distance between a and b is 3` …"] --> L["Lengths stored\n|ab|=3, |bc|=4, |ca|=5"]

    C2["`p on l`"] --> OL["onLine: p → l"]

    V --> M([Constraint model])
    E --> M
    L --> M
    OL --> M
```

The model also has room for on-segment constraints, angles and chosen solutions
(`onSegment`, `angles`, `solutionPicks`); nothing in the language reaches them
since the classic syntax went — see the
[roadmap](/roadmap#to-bring-back-from-the-classic-syntax).

## What the model captures

The model **does** assign coordinates to explicitly placed vertices — `point a at 3 4` resolves immediately to `dof = 0`. Every other vertex enters the loop as an unplaced working point: both coordinates null, `dof = 2`. The constraint model is purely relational for those: it says *what exists* and *what constraints apply*, not *where anything is*.
