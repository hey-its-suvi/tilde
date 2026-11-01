# Solver

A named number is no longer just one value or unknown — underneath, it's a
set: a range, or a few exact values, as well as those two. The language and
the renderer moved to this without rewriting the geometric solver to
understand it, which is its own unwritten effort.

Until that exists, the solver only reads back what a statement says
directly — it works out nothing from the shape of a figure. A position, a
radius, a line's coefficients, a named number tied to another element's
field: each narrows only the thing it's directly about. Two facts about the
same name combine — two `position` statements on one point intersect per
axis, a named number bound to a circle's radius settles whichever side is
known first. Nothing crosses between *different* elements: a point `on` a
line or circle, a line `through` two points, `parallel`, `perpendicular`, a
length or angle placing something, and `=` between two points (which means
"zero distance apart") are all accepted and drawn as undetermined, never
worked out.

```
point a at 0 0
point b at 4 0
circle c with center a and radius 3
point p on c
p on b
```

`a`, `b` and `c` are drawn — each comes from a direct fact. `p` is not: `on`
is relational, and nothing works out where it has to sit.

This is deliberate, not a bug. The real solver, with its propagate/pick loop
and canonical gauge-fixing, still exists in git history, parked until it's
rewritten to work natively over the new value. See the
[roadmap](/roadmap#geometric-derivation) for what comes back.
