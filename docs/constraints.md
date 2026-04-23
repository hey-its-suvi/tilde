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

## On-line

Constrains a point to lie on a named line. The point's position along the line is underconstrained (`infinite`) unless a distance to a known neighbor pins it down.

```
p on l
p on line l
point p on l
point p on line l
```

<TildeSketch source="
line l = (1, -1, 0)
point a = (0, 0)
b on l
ab = 3
pick b 1
" :cx="1.5" :cy="1.5" :zoom="1.1" :annotations="true"/>

---

## On-segment

Constrains a point to lie somewhere on a segment. Always `infinite` — its position along the segment is free. Multiple underconstrained points on the same segment are distributed evenly: `t = (i+1)/(n+1)`.

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

::: info Coming soon
```
ab parallel cd
```
:::

---

## Perpendicular

::: info Coming soon
```
ab perpendicular cd
```
:::
