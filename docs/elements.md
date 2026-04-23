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

Rendered as an infinite dashed line clipped to the viewport.

<TildeSketch source="
line l = (1, -1, 0)
line m = (1, 1, -4)
" :cx="2" :cy="2" :zoom="0.9"/>

---

## Point

An explicit point at exact world coordinates. Renders as `one` (crisp) immediately.

```
point p = (3, 5)
```

<TildeSketch source="
point a = (0, 0)
point b = (4, 0)
point c = (2, 3)
segment ab; segment bc; segment ca
" :cx="2" :cy="1.5" :zoom="1.2" :annotations="true"/>
