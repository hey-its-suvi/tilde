# Elements

Elements are the building blocks you declare in Tilde — scalars, points, lines, segments, and triangles.

---

## Scalar

A named value. Scalars can be used anywhere a number is expected — in coordinates, line equations, length constraints, and inline tuples.

```
scalar m = 2
line a = (m, -1, 0)
line b = (m, -1, -3)    # same slope, different intercept
```

Scalars can reference other scalars and support forward declarations (use before the `scalar` statement appears).

```
point p = (k, 0)
scalar k = 5            # p is placed at (5, 0)
```

A scalar declared without a value is determined by the solver from geometric constraints.

```
scalar m
line l = (m, -1, 0)
point a = (0, 0)
point b = (1, 3)
a on l
b on l                  # solver determines m = 3
```

---

## Point

An explicit point at exact world coordinates.

```
point p = (3, 5)
```

<TildeSketch source="
point a = (0, 0)
point b = (4, 0)
point c = (2, 3)
segment ab; segment bc; segment ca
" :cx="2" :cy="1.5" :zoom="1.2" :annotations="true"/>

---

## Line

An infinite line declared as the implicit equation `ax + by + c = 0`, or as slope-intercept `(m, k)` meaning `y = mx + k`.

```
line l = (1, 2, -3)    # x + 2y - 3 = 0
line l = (2, 1)         # y = 2x + 1  →  2x - y + 1 = 0
```

A line can also be declared **partially** — with one parameter left open. The missing value is filled in by the first placed point that lies on the line. If no such point exists, a canonical default is used.

```
line l = (2,)           # slope 2, intercept unknown
line l = (, 1)          # y-intercept 1, slope unknown
line l = (1, -1,)       # direction (1, −1) known, position unknown
```

For slope-intercept form, `with slope` and `with intercept` are clearer alternatives. The `=` is optional — `with slope 2` reads the same as `with slope=2`.

```
line l with slope 2
line l with intercept 1
line l with slope 2 and intercept 1
line l with slope=2, intercept=1     # = and comma both still work
```

These can be combined with `through`:

```
line l with slope 2 through p        # slope fixed, position determined by p
```

The bundled form lets a scalar be declared and assigned in the same statement as the line:

```
line l with slope m = 2              # same as: scalar m = 2; line l with slope=m
line l with intercept k = 5
line l with slope m = 2 and intercept k = 1
```

A partially declared line with no constraining point is drawn the same way as an underconstrained point — its position is a representative choice, not uniquely determined.

Use `through` to declare that a line passes through one or more points. This is the mirror of `point p on line l` and can appear inline on the declaration or as a standalone statement.

```
line l through p
line l through p, q       # comma-separated
line l through p and q    # or with 'and'
line l = (2,) through p   # combined with partial coefficients
l through p               # standalone
```

Use `parallel` or `perpendicular` to constrain a line's direction relative to another line. These can appear inline on the declaration or as a standalone statement.

```
line l parallel m            # l has the same direction as m
line l perpendicular m       # l is perpendicular to m
l parallel m                 # standalone form
l perpendicular m
line l parallel line m       # optional 'line' hint
```

Add `at` to name the intersection point of two perpendicular lines, or to set the distance between two parallel lines:

```
line l perpendicular m at p  # l ⊥ m, p is placed at their intersection
line l parallel m at 3       # l ∥ m, distance between them is 3
                             # (produces two symmetric solutions)
```

Rendered as an infinite dashed line clipped to the viewport.

<TildeSketch source="
line l = (1, -1, 0)
line m = (1, 1, -4)
" :cx="2" :cy="2" :zoom="0.9"/>

---

## Segment

A segment between two vertices. The `= 5` form is shorthand for a length constraint.

```
segment ab
segment ab = 5
let segment ab = 5      # 'let' is optional sugar
```

<TildeSketch source="
segment ab = 4
" :cx="2" :cy="0" :zoom="1.2" :annotations="true"/>

---

## Triangle

Three vertices with segments `ab`, `bc`, `ca` registered automatically. Inline constraints follow `with ... and ...`.

```
triangle abc
triangle abc with ab = 3 and bc = 4 and ca = 5
```

<TildeSketch source="
triangle abc with ab = 3 and bc = 4 and ca = 5
pick c 1
" :cx="1.5" :cy="2" :zoom="0.8" :annotations="true"/>
