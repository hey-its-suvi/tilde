# Roadmap

Ideas and planned work, roughly grouped by theme. Not ordered by priority.

---

## Language

### N-gon syntax
Replace `polygon N name` with inline numeric prefix: `5-gon abcde`. The name-length matching rule already handles it — a 5-character all-distinct lowercase name decomposes into vertices, anything else uses subscript mode. `polygon` keyword goes away.

```
5-gon abcde          # decompose: vertices a, b, c, d, e
5-gon p              # subscript: vertices p_1 … p_5
```

### Comma as delimiter in `with`
`and` is the only clause separator today. Allow commas as an alternative, or mixed:

```
triangle abc with ab=3, bc=4, ca=5
triangle abc with ab=3 and bc=4, ca=5   # mixed — also fine
```

### Named constructs (`between` / `through`)
Ability to give a name to a shape built from existing points:

```
segment s between a and b    # s is a segment with vertices a and b (no new points created)
triangle t between a and b and c
```

For lines — a line through two already-placed points (different from vertex binding since the equation must be derived):

```
line l through a and b       # solver computes equation once a and b are placed
```

This requires the solver to treat lines as potentially derived entities (see Solver section below).

### `with` for subscript shape vertex binding
Currently `triangle t with a and b and c` is not valid. Bare refs after `with` (no operator) should bind existing points to the shape's subscript vertices instead of creating new ones.

---

## Solver

### Angle constraints
Angle constraints parse correctly but are not yet wired into placement. The solver needs to use angle information when placing vertices — currently only length (circle) and line constraints drive placement.

### Parallel / perpendicular constraints
Parse but do nothing. Need solver support: a parallel constraint defines a directional locus; combined with a length or position it can fully place a vertex.

### Equal length constraint (`ab = cd`)
Parses as `EqualityConstraint` but solver ignores it. When one length is known the other should be inferred, and both segments should participate in the constraint graph.

### Derived lines
Lines defined by two points rather than an explicit equation. Fits into the fixpoint model as a new entity type resolved after its defining points are placed:

```
line l = (,3)        # unknown slope, y-intercept 3 — one on-constraint resolves it
line l               # fully unknown — two on-constraints resolve it
```

The fixpoint loop gets a new step: after placing points, resolve any underdetermined lines whose defining `on` points are now placed, then restart.

### Square / rectangle
Parse but solver ignores them. Need registration and constraint logic (right angles, equal sides).

---

## Infrastructure

### Test suite
As the constraint space grows, regressions are increasingly hard to spot by eye. Need a programmatic test suite covering:
- Basic shapes and constraints
- Subscript mode shapes
- Edge cases: overdetermined, underdetermined, contradictory constraints
- Unit handling
- Pick / multiple solutions

The `print` statement (currently parsed but not fully wired) is needed to make constraint values inspectable in tests.

### `print` statement
Partially implemented in the parser. Needs solver support to read back computed values (lengths, angles, vertex positions) — essential for testing and debugging.

### `set winding`
Parses but has no effect. Should control which solution is preferred when two exist (clockwise vs counterclockwise).

---

## Design questions

- **`between` vs `=` for vertex binding** — settled on `between` for shapes, `=` stays for coordinates and equations
- **Mixed `with` clauses** — whether a single `with` clause can contain both vertex bindings and constraints, or if they must be separate
- **Line namespace** — lines and shapes share the name namespace; `l` could be a line or a subscript segment. Solver resolves by checking `model.lines` first.
