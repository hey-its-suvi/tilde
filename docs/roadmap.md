# Roadmap

Ideas and planned work, roughly grouped by theme. Not ordered by priority.

---

## Definition syntax

The newer way of writing Tilde, where the language's own constructs are ordinary
definitions rather than built into the parser. Reachable in the playground under
`syntax: definitions`; the classic syntax is still the default.

### Reaching inside a point, line or circle
`t.point1` reaches a triangle's corner, because a corner is a whole point. There
is no way to reach a *part* of a point, line or circle — no `p.x`, no `l.slope`.
The obstacle is that a shape found two ways over has two possible answers, and
those answers belong to the shape as a whole; splitting a line into three
separate numbers would turn two real answers into eight false ones. Needs
possible answers to be tracked for the whole drawing at once rather than shape by
shape.

### Two shapes that are the same shape
Two numbers can be made the same number. Two points cannot. Saying `p = q` for
points needs them to become one thing rather than one copying the other, so that
they are still the same when neither is known yet. Sketched: keep both names,
point them at one shape, and narrow to what both could be.

### What `=` means

An open question. `=` currently has no built-in meaning: it is a word patterns can
use, and the prelude defines it once per shape — `point p = (3, 4)`, `scalar r =
2`, and so on. That works, but every new type needs its own definitions before
`=` means anything for it.

The underlying question is whether **giving something a name** and **saying two
things are the same** are one feature or two. Most languages treat them as two:
`x = 5` names a value, `a == b` compares, and only the second can be redefined
per type. Tilde has no reassignment — `point p = (3, 4)` followed by `p = (1, 2)`
is a contradiction, not an update — which suggests they may be the same thing
here: declaring a name makes an empty shape, and every `=` after that narrows it.

### Working with solved values

Everything a program says runs *before* the solver: it builds up facts, and only
afterwards are positions and sizes known. So anything that needs a solved value —
printing it, measuring something, writing a point as `"(" + p.x + ", " + p.y + ")"`
— has nowhere to run in Tilde itself. Today `print` works by recording what was
asked and having the implementation fill it in after solving, which is why how a
point or line prints cannot be written or changed in Tilde.

The fix is a second stage: definitions that run once the solver is done. That is
where `print` for a point could be written in terms of `print` for a number, and
where `distance between a and b` could give back a length rather than only take
one. Two things it depends on:

- **Reaching a point's coordinates**, `p.x` — a coordinate is part of a point
  rather than a shape of its own, which is the same question as *Reaching inside
  a point, line or circle* above.
- **Keeping possibilities together.** If `p` could be `(5, 0)` or `(-5, 0)`, the
  second stage has to run once for each version of the drawing — pairing each `x`
  with its own `y` — or it will produce answers that were never possible.

### Redefinition

Tilde has no reassignment: `point p = (3, 4)` followed by `p = (1, 2)` is a
contradiction, and a new object made from an old one gets a new name — `l'`,
`A''`. For the rare case where you really mean "no, this one", an explicit
redefinition could be added, likely as `redefine p as (1, 2)` or `:=`. It would
*replace* the definition everywhere rather than from that line onward — so
anything depending on `p` follows the new value, and the order of statements still
does not matter. Suited to interactive editing more than to written programs.
Not `<=`, which is reserved for inequalities.

### True and false

A `Boolean` type, so a definition can answer a question rather than assert
something. Three values rather than two: **true**, **false**, and **not known
yet** — a drawing part-way through solving may not have settled whether two lines
are parallel.

That fits what numbers already do. A number holds the values it could still take:
nothing known yet, exactly one, several, or none at all. A Boolean is the same
idea over a domain of two, so "not known" is just *both still possible* and a
contradiction is *neither*. No new machinery, only a smaller domain.

### Asking as well as asserting

Today `l parallel m` makes two lines parallel, and there is no way to ask whether
they already are. The proposal is to write both, with the same words:

```
define (a: Line) parallel (b: Line) => Line:        # makes it so
define (a: Line) parallel (b: Line) => Boolean:     # says whether it is so
define is (v: Boolean) => Boolean:
```

so `is a parallel b` reads as `is (a parallel b)` — the inner one answers, the
outer one checks the answer.

This replaces a convention with something composable. The rule so far has been
that a question is a *separate definition* whose name happens to start with `is`,
unrelated to the thing it asks about. Under this, `is` is an ordinary definition
taking a Boolean, and any relation can offer an asking form alongside its
asserting one.

Two things make it harder than it looks:

- **It is overloading by *answer*, not by arguments.** Both definitions above
  take two lines; only what they hand back differs. Inside `is`, the slot now
  picks — `is` wants a Boolean, so the Boolean form is used (see *Letting the
  slot decide*).
- **A line on its own has no slot.** `l parallel m` by itself would fit both
  forms equally, and nothing around it says which. Every rule considered for
  that — definition order, a marker on the asserting form, treating a bare line
  differently — had a real cost, so for now asking forms are separate
  definitions that start with `is` (`is (a: Line) parallel (b: Line)`), and the
  composable version waits.

### Arithmetic
`+ - * /` exist as ordinary definitions and work on numbers written out:
`((2 + 3) * 4)` is 20. What is missing is `2 * r` for a *named* number — what
stands between the language and things like `scale`, which needs to say one size
is *twice* another rather than equal to it.

**Precedence** is planned as a fixed table on the symbols — `* /` before `+ -`,
the way ordinary maths reads — applied by inserting brackets before a statement
is matched. Definitions keep giving the symbols their meaning; nothing about
matching or dispatch changes. Until then, arithmetic is read left to right like
the rest of a line: `2 + 3 * 4` is `(2 + 3) * 4`.

Two halves, and they can be taken separately. Writing the expression is the small
one. Solving it is the large one: a size given as `2 * r` has to work backwards
as readily as forwards, since which end becomes known first is not decided in
advance. Numbers already carry the values they could still take, so an arithmetic
layer would have to work over those sets rather than over single values.

Handing the second half to an existing solver — numeric or symbolic — rather than
writing one is a reasonable answer, and probably the right one. The shape of the
language does not depend on which.

### Letting the slot decide
**Built.** Two definitions may share their words and differ only in what they give
back — a pair of numbers as a point `(x, y)`, or as a line in slope-intercept
form `(m, k)`. Where such a thing lands decides which it is: in a point's slot it
is the point, in a line's slot the line. A slot that takes anything (`print`)
cannot decide, and asks for the thing to be named first. Still to come: `=` passing
the type of one side across to the other, which needs `=` to say both sides are
the same kind of thing.

### Settings
On/off settings (`grid`, `axes`, `origin`, `subscripts`) exist, as
`set (s: Name) on` / `off` in the prelude backed by a `setting()` call. A setting
that takes a value — units, winding — needs its own kind of definition; see below.

### To bring back from the classic syntax
Tilde used to have a second syntax, with its own hand-written grammar. It was
removed in 0.3.67, and with it went everything below. Each needs a definition
(or more) in the prelude, and some need language design first. The solver
still supports the ones marked *solver ready* — only the way to write them
went.

**Need design first**

- **`pick`** — `pick p 1` chose one of several positions for something with more
  than one. It acts on the possible answers rather than on one figure, so it is
  not an ordinary definition.
- **Units** — `set unit cm` / `mm` / `m` / `in`, `set unit degrees` / `radians`,
  and numbers written with a unit: `5cm`, `60deg`. Needs numbers with a suffix,
  and a setting that takes a value rather than on/off. In the classic syntax
  `set` had to come before any geometry; whether that rule is wanted is open.
- **`set winding clockwise`** — which way round a triangle's corners go. A
  setting that takes a value, like units.
- **Named segments** — `segment ab = 5`, then `ab = 5` as a length. Today
  `distance between a and b is 5` says the length and `segment a b` draws it,
  but a segment is not a thing with a name. Wants a Segment type.
- **Name shorthand** — `triangle abc` made corners `a`, `b`, `c`; a name that
  could not be split gave `t_1`, `t_2`, `t_3`, with edges `t_1_2` and angles
  `angle t_2`. Today: `triangle t with a b c`, and `t.point1`. Whether the
  shorthand is wanted at all is a design question.

**Solver ready**

- **Angles** — `angle abc = 60`: the angle at `b`, from `a` to `c`.
- **Lines by equation** — `line l = (m, k)` for y = mx + k, `line l = (a, b, c)`
  for ax + by + c = 0, part-known forms like `(2,)` (slope only) and `(, 1)`
  (intercept only), and `with slope 2, intercept 1`. Today a line is placed only
  through points or by relations; tests write a known line as the line through
  two placed points.
- **A point on a segment** — `a on ab`.
- **Part-placed points** — `point p = (5,)`, x known and y not. Can be said today
  with a named number (`scalar y`, `point p at 5 y`), less directly.

**Smaller**

- **Circle diameter** — `circle c with diameter 6`.
- **A circle standing for its centre** — `c on l` put the centre on `l`;
  `l through c` likewise. Today: name the centre and say `o on l`.
- **Writing several things at once** — `with … and …` after a declaration,
  comma lists (`l through p, q`), `;` between statements. `#` comments (now `--`)
  and `let` (which did nothing) are not worth bringing back.
- **Using a name before it is made** — the classic syntax allowed a number or a
  point to be used on a line above the one that made it.

**Found while moving the tests over**

- **A circle with nothing said about it is not drawn.** `circle c` alone makes a
  circle with no centre, which the solver cannot place, so it is never drawn and
  prints as not known. The classic syntax quietly gave it a free centre. Doing
  that in the prelude needs care: `circle c with center p` would then give the
  circle two centres.
- **The solver's handling of unnamed things is out of reach.** The solver treats
  an element whose name starts with `_` as unnamed — a bracketed point, a
  circle's hidden centre — and lets it give way to named ones when placing free
  things. The definition syntax names elements `Point#1`, never `_…`, so none of
  that applies to it. Three circle tests depending on it were dropped.
- **A named free centre with two placed points on the circle is refused**
  ("placed points are not equidistant from centre") instead of being worked out:
  the free centre is placed before the points on the circle are taken into
  account.

---

## Language

### N-gon syntax
Replace `polygon N name` with inline numeric prefix: `5-gon abcde`. The name-length matching rule already handles it — a 5-character all-distinct lowercase name decomposes into vertices, anything else uses subscript mode. `polygon` keyword goes away.

```
5-gon abcde          # decompose: vertices a, b, c, d, e
5-gon p              # subscript: vertices p_1 … p_5
```

### Comma as delimiter in `with`
`and` is the only clause separator today. Allow commas as an alternative, or mixed:

```
triangle abc with ab=3, bc=4, ca=5
triangle abc with ab=3 and bc=4, ca=5   # mixed — also fine
```

### Named constructs (`between` / `through`)
Ability to give a name to a shape built from existing points:

```
segment s between a and b    # s is a segment with vertices a and b (no new points created)
triangle t between a and b and c
```

For lines — a line through two already-placed points (different from vertex binding since the equation must be derived):

```
line l through a and b       # solver computes equation once a and b are placed
```

This requires the solver to treat lines as potentially derived entities (see Solver section below).

### `with` for subscript shape vertex binding
Currently `triangle t with a and b and c` is not valid. Bare refs after `with` (no operator) should bind existing points to the shape's subscript vertices instead of creating new ones.

### Post-declaration naming of hidden parts
Bare declarations mint anonymous internals (e.g. `circle c` creates an anonymous centre `_ptN`). There's no way to give that centre a user-facing name later. Proposal: allow a follow-up binding statement that attaches a name to a hidden part of an already-declared shape, e.g.

```
circle c
c center point p       # p is now the centre of c
```

Same idea could extend to other hidden internals as more shapes grow them. Useful for incremental construction where the user doesn't decide a part needs a name until later.

---

## Solver

### Angle constraints
Angle constraints parse correctly but are not yet wired into placement. The solver needs to use angle information when placing vertices — currently only length (circle) and line constraints drive placement.

### Equal length constraint (`ab = cd`)
Parses as `EqualityConstraint` but solver ignores it. When one length is known the other should be inferred, and both segments should participate in the constraint graph.

### Derived lines
Lines defined by two points rather than an explicit equation. Fits into the fixpoint model as a new entity type resolved after its defining points are placed:

```
line l = (,3)        # unknown slope, y-intercept 3 — one on-constraint resolves it
line l               # fully unknown — two on-constraints resolve it
```

The fixpoint loop gets a new step: after placing points, resolve any underdetermined lines whose defining `on` points are now placed, then restart.

### Square / rectangle
Parse but solver ignores them. Need registration and constraint logic (right angles, equal sides).

### Computed geometry (incircle / circumcircle / perpendicular bisector)
A class of constructs that aren't constraints but functions: take some existing geometry, compute a new geometry from it. Examples:

- `incircle of abc` — circle inscribed in triangle `abc`
- `circumcircle of abc` — circle through the three vertices
- `perpendicular bisector of ab` (or `of segment s`) — line derived from a segment

These resolve after their inputs are placed, similar to derived lines. Open question: surface as keywords (`incircle`, `circumcircle`) or as a more general function-style syntax.

---

## UI / rendering

### Constraint indicators
Visual marks that show constraints rather than just the resulting geometry:

- **Right angle** — small square at the intersection of perpendicular objects
- **Parallel lines** — matching number of perpendicular tick marks to group parallel lines together (one tick for the first parallel group, two for the second, etc.)
- **Equal length** — tick marks on segments of equal length (same grouping idea)

Should be toggleable via a setting (e.g. `set indicators off`) for users who want a cleaner diagram.

### Scaffolding geometry (single-underscore names)
For complex constructions the user often needs intermediate shapes (helper points, lines, circles) that aren't part of the final figure. Proposal:

- `__name` (double underscore) — internal anonymous shapes created by the compiler (current behaviour, moved from single to double)
- `_name` (single underscore) — user-authored scaffolding: still rendered but in a lighter style (faded stroke, smaller labels), and hideable via a setting (e.g. `set scaffolding off`)
- no underscore — normal user geometry, rendered fully

This gives users a first-class way to express "this is just construction, not the answer" without cluttering the final diagram.

---

## Infrastructure

### `print` statement
Partially implemented in the parser. Needs solver support to read back computed values (lengths, angles, vertex positions) — essential for testing and debugging.

### `set winding`
Parses but has no effect. Should control which solution is preferred when two exist (clockwise vs counterclockwise).

---

## Design questions

- **`between` vs `=` for vertex binding** — settled on `between` for shapes, `=` stays for coordinates and equations
- **Mixed `with` clauses** — whether a single `with` clause can contain both vertex bindings and constraints, or if they must be separate
- **Line namespace** — lines and shapes share the name namespace; `l` could be a line or a subscript segment. Solver resolves by checking `model.lines` first.
