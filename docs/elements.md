# Elements

Elements are the things a figure is made of — numbers, points, lines, circles,
segments and triangles. Each is made by naming it:

```
import prelude

point p
line l
circle c with center p and radius 2
```

A program starts with `import prelude`, which brings in every word on this page.
None of them is built into the language: they are definitions, written in Tilde,
and you can write your own the same way. How a line of a program is read is on
[Reading a Line](/reading).

---

## Scalar

A named number. It can be given a value, or left for the solver to work out from
the geometry.

```
scalar k = 5
scalar r                  -- worked out from the figure
```

Giving a number two different values is a contradiction rather than a correction —
the second does not replace the first. The number is left with no value it could
take, and anything depending on it goes undrawn.

```
scalar m = 2
m = 3                     -- m cannot be both, so it has no value
```

A number left open is worked out from what the figure says about it:

```
scalar r
point o at 0 0
point p at 3 4
circle k with center o and radius r
p on k
print r                   -- r = 5
```

A named number can stand wherever a number goes — a coordinate, a radius — and
two shapes can share a size by sharing a name.

---

## Point

```
point p                   -- free: the solver places it
point p at 3 5            -- at (3, 5)
point p = (3, 5)          -- the same
```

A pair of numbers in brackets is a point too, and can be used wherever a point
goes without naming it: `line l through (1, 2) (3, 4)`.

<TildeSketch source="
point a at 0 0
point b at 4 0
point c at 2 3
segment a b
segment b c
segment c a
" :cx="2" :cy="1.5" :zoom="1.2" :annotations="true"/>

---

## Line

An infinite line, drawn dashed across the view.

```
line l                    -- free: the solver places it
line l through p q        -- the line through two points
l through p               -- said of a line that already exists
```

`parallel` and `perpendicular` relate a line to another; see
[Constraints](/constraints). A line can be made and constrained in one go, and
what follows is said about the line just made:

```
line l parallel m through p
```

<TildeSketch source="
line l through (0, 0) (1, 1)
line m through (0, 4) (4, 0)
" :cx="2" :cy="2" :zoom="0.9"/>

---

## Circle

A circle by its centre and radius.

```
circle c with center p and radius 3
circle c with center (2, 1) and radius 4
circle c with center p              -- radius left open
```

The centre may be a named point or a bracketed one; the radius a number or a
named number.

```
scalar r = 5
circle c with center p and radius r
```

A circle needs a centre to be drawn — `circle c`, or `circle c with radius 3`,
with no centre said, is not drawn yet.

A point can be put on a circle with `on`. On one circle it can slide round it;
on two circles, or a circle and a line, it is where they cross:

```
point a at 0 0
point b at 4 0
circle c1 with center a and radius 3
circle c2 with center b and radius 5
point p on c1
p on c2                   -- p at (0, 3) or (0, −3)
```

Three points known to lie on a circle fix it — its centre and radius are worked
out:

```
point a at 1 0
point b at -1 0
point c at 0 1
point o
scalar r
circle k with center o and radius r
a on k
b on k
c on k                    -- o is at (0, 0), r is 1
```

---

## Segment

The straight piece between two points, drawn.

```
segment a b
```

Giving the two points a distance draws the segment too:

```
distance between a and b is 4
```

<TildeSketch source="
point a
point b
distance between a and b is 4
" :cx="2" :cy="0" :zoom="1.2" :annotations="true"/>

---

## Triangle

Three corners, with the three sides drawn. The corners are named when the
triangle is made:

```
triangle t with a b c
```

The corners can also be reached through the triangle: `t.point1`, `t.point2`,
`t.point3` are `a`, `b` and `c`.

<TildeSketch source="
triangle t with a b c
distance between a and b is 3
distance between b and c is 4
distance between c and a is 5
" :cx="1.5" :cy="0" :zoom="0.6" :annotations="true"/>

A 3-4-5 triangle can sit either side of `ab`, so `c` has two places it could
be, and both are shown.
