# Limitations

What Tilde does not do yet, and what it does quietly rather than loudly. Written
so you can tell a bug from a gap.

Anything here is a gap. If Tilde does something not described on this page and
not described elsewhere in the docs, that is worth reporting.

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
r = 3            -- r cannot be both, so it has no value and is not drawn
```

Nothing marks it as impossible on the canvas. You find out by noticing something
missing.

---

## Ambiguous figures

Where a figure has two possible versions, Tilde draws and prints both. There is no
way yet to choose one — `pick` went with the classic syntax and is on the
[roadmap](/roadmap#to-bring-back-from-the-classic-syntax). Saying something more
that rules one out is the only way to settle it.

---

## The language

How a line is read is described in [Reading a Line](/reading).

**Not available at all:** `pick`, units, angles, lines by equation, and the other
things that went with the classic syntax — listed on the
[roadmap](/roadmap#to-bring-back-from-the-classic-syntax).

**Arithmetic works only on numbers written out.** `scalar r = ((2 + 3) * 4)` is
20, but `(k + 1)` with a named `k` is refused — a named number is worked out after
the arithmetic runs, so there is nothing to add yet.

**Where anything would do, a two-way group has to be named first.** If a pair of
numbers can mean a point or a line, the slot it lands in decides — but `print`
takes anything, so `print (2, 1)` is refused until the pair is named
(`point p = (2, 1)`, then `print p`). `=` cannot pass a type across from one side
to the other yet either.

**You can reach a shape's parts but not a shape's numbers.** `t.point1` gives you
a triangle's corner, because a corner is a whole point. There is no `p.x` — see
the roadmap for why that is harder than it looks.

**Two points said to be the same stay two points.** `p = q` holds them at no
distance apart, drawn on top of each other, rather than making them one point —
that waits on `=` learning to merge. (Two numbers, `r = w`, already are one.)

**A definition's helper shapes are not drawn.** A name used only inside a
definition ends when the definition finishes, and so does any way of showing what
it named. The shape still counts — if it holds something else in place, that
still holds — but it does not appear. To show a part of what a definition builds,
make it a field of the thing's type, or build it under the name the caller
supplied. A way to ask for a helper to be drawn is planned.

**A definition can only use what its own file imported.** Importing a file does
not give you what *it* imported. This is deliberate, and matches how most
languages work, but it means a shape you got from elsewhere may not be one you
can say anything about without importing more.

