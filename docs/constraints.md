# Constraints

Constraints express geometric relationships between elements. They can appear as standalone statements or inline after `with ... and ...` on a shape declaration.

```
triangle abc with ab = 3 and bc = 4 and ca = 5   # inline
ab = 3                                             # standalone
```

---

## Length

Sets the distance between two vertices. Units are optional — omitting them uses abstract units.

```
ab = 5
ab = 5cm
ab = 5mm
ab = 2.5in
```

Available units: `cm`, `mm`, `m`, `in`, `inches`.

<TildeSketch source="
triangle abc with ab = 3 and bc = 4 and ca = 5
pick c 1
" :cx="1.5" :cy="2" :zoom="0.8" :annotations="true"/>

---

## Coincidence

Declares that two vertices occupy the same position.

```
a = b
```

---

## On and through — the matrix

Two operators express positional constraints between elements:

- **`X on Y`** — X (a point) lies on Y (a locus: line, segment, circle).
- **`X through Y`** — X (a line or circle) passes through Y (a point).

Both are forms of the same underlying relation. They desugar to the same internal constraint at parse time, so the choice is purely about readability: `point p on line l` and `line l through point p` say the same thing.

Here's what each pair of LHS/RHS element types means:

| LHS / RHS | point | line | circle | segment |
|---|---|---|---|---|
| **point on …** | — | point on line | point on circle | point on segment |
| **line on …** | (error: line isn't a point) | — | — | — |
| **circle on …** | (error) | circle's **centre** is on line | (error — not supported) | circle's **centre** is on segment |
| **line through …** | line passes through point | — | line passes through circle's **centre** | — |
| **circle through …** | circle passes through point | — | (error — not supported) | — |

The non-empty cells are the constraints you can write. Everything else is rejected at elaboration.

**Circle conventions.** When a circle name appears in a `point` position (the LHS of `on`, or the RHS of `through`), it stands in for its centre. So:

```
c on l         # c's centre is on l
l through c    # same constraint, read from l's side
c on ab        # c's centre is on segment ab
l through c, d # both c's and d's centres are on l
```

Two circles can't relate this way: `c1 on c2` and `c1 through c2` are rejected because there's no obvious one-point reading. (To express "the centre of c1 lies on c2" you'd write `c1.center on c2` — though there's no such syntax today; you can express it by giving the circle a named centre point and constraining that point directly.)

---

## On-line

Constrains a point to lie on a named line. The point's position along the line is underconstrained unless a distance to a known neighbor pins it down.

```
p on l
p on line l
point p on l
point p on line l
```

The same constraint can be expressed from the line's side using `through`:

```
line l through p          # inline on the line declaration
line l through p, q       # multiple points inline
l through p               # standalone statement
```

All forms are equivalent — `through` is desugared to `on` at parse time.

<TildeSketch source="
line l = (1, -1, 0)
point a = (0, 0)
b on l
ab = 3
pick b 1
" :cx="1.5" :cy="1.5" :zoom="1.1" :annotations="true"/>

---

## On-circle

Constrains a point to lie on a circle. With one circle, the point's position along the circle is underconstrained; combine with a second locus (line or another circle) to pin it down.

```
p on c
point p on c
```

The same constraint can be expressed from the circle's side using `through`:

```
circle c through p             # inline on the circle declaration
circle c = (o, 1) through p, q # multiple points inline
c through p                    # standalone statement
```

When three or more points are known to lie on the same circle, the circle's centre and radius are uniquely determined and the solver places them automatically.

A circle written in a point position — `c on l` or `l through c` — stands in for its **centre**. See [On and through — the matrix](#on-and-through-the-matrix) above.

---

## On-segment

Constrains a point to lie somewhere on a segment. Its position along the segment is always underconstrained — free to be anywhere on it. Multiple underconstrained points on the same segment are distributed evenly.

```
p on ab
p on segment ab
point p on ab
```

<TildeSketch source="
segment ab = 6
p on ab
q on ab
r on ab
" :cx="3" :cy="0" :zoom="1.1"/>

---

## Equality

::: info Coming soon
Two segments share the same length without specifying a value.

```
ab = cd
```
:::

---

## Angle

::: info Coming soon
Sets the interior angle at a vertex.

```
angle abc = 90
angle abc = 1.571rad
```

Available units: `deg`, `rad`. Required for squares, rectangles, and right-angle constructions.
:::

---

## Parallel

Constrains two lines to have the same direction.

```
l parallel m
line l parallel m         # inline on the line declaration
line l parallel line m    # optional 'line' hints
```

Add `at` to specify the distance between the lines. This produces two symmetric solutions — one on each side.

```
line l parallel m at 3    # l is 3 units from m (two solutions)
```

---

## Perpendicular

Constrains two lines to meet at a right angle.

```
l perpendicular m
line l perpendicular m    # inline on the line declaration
```

Add `at` to name the intersection point — it is placed exactly at the crossing of the two lines.

```
line l perpendicular m at p   # l ⊥ m, p is their intersection
```
