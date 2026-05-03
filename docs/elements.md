# Elements

Elements are the geometric objects you declare in Tilde — segments, triangles, lines, and points.

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

For slope-intercept form, `with slope=` and `with intercept=` are clearer alternatives:

```
line l with slope=2
line l with intercept=1
line l with slope=2 and intercept=1
line l with slope=2, intercept=1     # comma works too
```

These can be combined with `through`:

```
line l with slope=2 through p        # slope fixed, position determined by p
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

Rendered as an infinite dashed line clipped to the viewport.

<TildeSketch source="
line l = (1, -1, 0)
line m = (1, 1, -4)
" :cx="2" :cy="2" :zoom="0.9"/>

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
