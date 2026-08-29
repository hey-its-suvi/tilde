# Limitations

What Tilde does not do yet, and what it does quietly rather than loudly. Written
so you can tell a bug from a gap.

Anything here is a gap. If Tilde does something not described on this page and
not described elsewhere in the docs, that is worth reporting.

---

## Written but not acted on

These parse without complaint and then have no effect on the drawing. There is
no warning — the figure simply comes out as though you had not written them.

- **Angles.** `triangle abc with angle abc = 90` is read and stored, but nothing
  uses it to place a corner. Only lengths and lines drive placement.
- **Equal lengths.** `ab = cd` is read and ignored. Knowing one length will not
  give you the other.
- **Squares and rectangles.** Declared but treated as nothing in particular —
  neither the right angles nor the equal sides are applied.
- **`set winding`.** Read and ignored. It cannot yet choose between a clockwise
  and an anticlockwise answer.
- **`print`.** Partly built. It cannot yet read back a length, an angle or a
  position.

---

## Answers chosen for you

A drawing has to start somewhere, and when a figure is genuinely ambiguous
something has to settle on one version of it. Both are choices your program did
not make, and both are invisible in the result.

```
point a at 0 0
point b
line l through a b
```

Only `a` is actually determined here. `b` is placed at the origin because
nothing says otherwise, and the line through two identical points comes out at
an arbitrary angle.

**To see which parts are yours:** switch the strategy picker in the playground to
`none`. It draws only what your constraints force, and leaves out everything
that was being chosen for you.

---

## Contradictions are quiet

Asking for something impossible does not stop the drawing or report anything. The
impossible part is left out and the rest is drawn.

```
scalar r = 2
r = 3            # r cannot be both, so it has no value and is not drawn
```

Nothing marks it as impossible on the canvas. You find out by noticing something
missing.

---

## Ambiguous figures

Where a figure has two possible versions, Tilde reports both and `pick` chooses
between them. Two gaps:

- **Choosing is per shape.** If a point has two possible positions and a number
  is read from that point, picking the point does not pick the number to match.
  They can end up describing different versions of the drawing.
- **A number read from an ambiguous shape shows only its first value.** The
  second is tracked but not displayed.

---

## Definition syntax

The newer syntax — the playground's `syntax: definitions` — is younger than the
classic one and does less.

**Not available at all:** `pick`, `set unit`, `set grid`, point literals like
`(2, 1)`, and arithmetic of any kind (`2 * r`).

**Statements are one line of words and values.** There is no way to nest one
inside another, so `l parallel (m rotated 60)` cannot be written.

**You can reach a shape's parts but not a shape's numbers.** `t.point1` gives you
a triangle's corner, because a corner is a whole point. There is no `p.x` — see
the roadmap for why that is harder than it looks.

**Two numbers can be made the same number; two points cannot.** `r = w` works.
`p = q` for points does not.

**A definition that names something of its own must take a name.** If it builds a
helper shape and gives it a name, it needs a name for the thing it is building
too, so that using it twice makes two of them rather than a collision. A
definition that takes no name reports this instead of quietly colliding.

**A definition's helpers are still reachable.** They are given names based on
what you called the thing, and nothing stops you using those names from outside.
They are not private, only unlikely to be typed by accident.

**A definition can only use what its own file imported.** Importing a file does
not give you what *it* imported. This is deliberate, and matches how most
languages work, but it means a shape you got from elsewhere may not be one you
can say anything about without importing more.

---

## Two syntaxes

The classic and definition syntaxes both work, and a program is written in one or
the other — they cannot be mixed in a file. The classic syntax is the default and
is what the rest of these docs describe.
