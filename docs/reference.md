# Language Reference

Complete listing of valid Tilde syntax. Entries marked _(not yet implemented)_ parse without error but have no effect.

## General

- `let` is optional before any declaration — `let segment ab` and `segment ab` are identical
- Statements are separated by newlines or semicolons (`;`)
- `#` starts a line comment

---

## Settings

Must appear before any geometry declarations.

```
set unit cm           # cm | mm | m | in | inches | unit
set unit degrees      # degrees | radians
set grid on           # on | off
set winding clockwise # clockwise | counterclockwise
```

If `set unit` is omitted, the active unit is inferred from the first length that carries a unit suffix. If no suffixed length exists, lengths are abstract numbers.

---

## Declarations

### Point

```
point a               # free vertex — solver places it
point a = (1, 2)      # fixed at (1, 2)
```

### Line

```
line l                # defaults to y = x
line l = (m, k)       # y = mx + k
line l = (a, b, c)    # ax + by + c = 0
```

### Segment

A segment name is either a **2-character all-distinct lowercase** name (decompose mode) or any other name (subscript mode).

```
segment ab            # decompose: vertices a and b
segment ab = 5        # decompose: vertices a and b, length 5
segment ab with <constraints>

segment s             # subscript: vertices s_1 and s_2
segment hello         # subscript: vertices hello_1 and hello_2
```

### Triangle

A triangle name is either a **3-character all-distinct lowercase** name (decompose mode) or any other name (subscript mode).

```
triangle abc          # decompose: vertices a, b, c — sides ab, bc, ca
triangle abc with <constraints>

triangle t            # subscript: vertices t_1, t_2, t_3 — sides t_12, t_23, t_31
triangle hey          # subscript: all chars same length but repeated → subscript
```

### Naming modes

**Decompose mode** — the name is split into individual vertex characters:
- Segment: exactly 2 characters, all lowercase, all distinct
- Triangle: exactly 3 characters, all lowercase, all distinct

Any name that does not meet the criteria for decompose mode uses **subscript mode**, where the name becomes a label and vertices are `name_1`, `name_2`, etc.

Repeated characters (e.g. `triangle aba`) force subscript mode.

### Other shapes _(not yet implemented)_

```
square abcd
rectangle abcd
polygon 5 abcde
```

These parse but register nothing in the solver.

---

## Constraints

Constraints can appear in two places:

- **Standalone** — as their own statement
- **Inline** — after `with` in a declaration, joined by `and`

```
triangle abc with ab = 3 and bc = 4 and ca = 5
```

### Length

```
ab = 5
ab = 5cm             # with unit suffix
ABC_12 = 5           # subscript segment
```

### Angle

```
angle abc = 60       # angle at b, measured from a to c
angle abc = 60deg    # with unit suffix
angle ABC_2 = 90     # subscript angle at vertex 2
```

### Position

```
a = (1, 2)           # place vertex a at (1, 2)
```

If `a` is already placed at the same position, this is a no-op. If `a` is placed at a different position, it throws a constraint error.

### On-line

```
a on l               # vertex a lies on named line l
a on line l          # same, with optional keyword
point a on l         # same, with optional keyword
point a on line l    # same
```

A vertex may be constrained to multiple lines:

```
a on l
a on m               # a is placed at the intersection of l and m
```

### On-segment

```
a on ab              # vertex a lies on segment ab
a on segment ab      # same, with optional keyword
point a on ab        # same
point a on segment ab
```

### Equal lengths _(not yet implemented)_

```
ab = cd
```

### Parallel / perpendicular _(not yet implemented)_

```
ab parallel cd
ab perpendicular cd
```

### Point coincidence _(not yet implemented)_

```
a = b
```

---

## Pick

Collapses an ambiguous vertex (two discrete solutions) to a specific one.

```
pick a 1             # use solution 1
pick a 2             # use solution 2
pick ABC_1 1         # subscript vertex
```

---

## Units

### Length
| Suffix | Meaning |
|---|---|
| `cm` | centimetres |
| `mm` | millimetres |
| `m` | metres |
| `in` or `inches` | inches |
| `unit` | abstract unit |

### Angle
| Suffix | Meaning |
|---|---|
| `deg` or `degrees` | degrees |
| `rad` or `radians` | radians |

---

## Subscript references

Shapes in subscript mode expose their components via subscripts.

```
t_1            # vertex 1 of shape t
t_1_2          # segment between vertices 1 and 2 of shape t
angle t_2      # angle at vertex 2 of shape t
```

Works for any label, any case:

```
ABC_1          # vertex 1 of shape ABC
ABC_1_2        # segment between vertices 1 and 2
angle ABC_2    # angle at vertex 2
```

The double-underscore delimiter (`_1_2`) is required for segment refs so the parser can distinguish vertex 12 from edge 1→2.

---

## What is not valid

- `set` after any geometry declaration
- Redefining a name that is already declared (e.g. two `let point a` statements)
- A vertex constrained to two parallel lines
- A vertex constrained to three or more lines with no common point
