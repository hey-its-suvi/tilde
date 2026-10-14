# Constraints

Constraints say how elements relate: how far apart two points are, which line a
point is on, which way a line runs. Each is a line of the program on its own, or
follows on from the line before it in the same sentence:

```
line l parallel m          -- make l, then: l is parallel to m
l through p                -- said on its own
line l parallel m through p
```

A constraint gives back the thing it was said about, which is what lets the next
one in the sentence be about the same thing. How a line is read is on
[Reading a Line](/reading).

---

## Position

Puts a point at given coordinates.

```
p at 3 5
point p at 3 5             -- make p and put it there
point p = (3, 5)           -- the same
```

---

## Distance

Fixes the distance between two points, and draws the segment between them.

```
distance between a and b is 5
```

<TildeSketch source="
triangle t with a b c
distance between a and b is 3
distance between b and c is 4
distance between c and a is 5
" :cx="1.5" :cy="0" :zoom="0.6" :annotations="true"/>

---

## Same point

Two points are the same point.

```
p = q
```

For now they are held at no distance apart — still two points, drawn on top of
each other.

---

## On a line

A point lies on a line. Its place along the line is open unless something else
pins it down.

```
p on l
point p on l               -- make p on l
```

The same thing said from the line's side:

```
l through p
line l through p q         -- make the line through two points
```

<TildeSketch source="
line l through (0, 0) (1, 1)
point a at 0 0
point b on l
distance between a and b is 3
" :cx="1.5" :cy="1.5" :zoom="1.1" :annotations="true"/>

`b` can be 3 from `a` on either side of it along `l`, so both places are shown.

---

## On a circle

A point lies on a circle. On one circle it can slide round; with a line or a
second circle it is where they cross.

```
p on c
point p on c
```

When three or more points are known to lie on the same circle, its centre and
radius are worked out. See [Circle](/elements#circle).

---

## Parallel

Two lines run the same way.

```
l parallel m
line l parallel m          -- make l parallel to m
```

Add `at` for the distance between them. That has two answers, one on each side.

```
l parallel m at 3
```

---

## Perpendicular

Two lines meet at a right angle.

```
l perpendicular m
line l perpendicular m
```

Add `at` to name where they cross:

```
l perpendicular m at p     -- p is on both
```

---

## Coming back

Angles, a point on a segment and a few other constraints went with Tilde's older
syntax and are not here yet. They are listed on the
[roadmap](/roadmap#to-bring-back-from-the-classic-syntax).
