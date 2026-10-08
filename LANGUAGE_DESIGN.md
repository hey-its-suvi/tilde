# Tilde — Language Design Notes

The design record for the definition syntax: what was decided, why, and what was
tried and dropped. Not user-facing — the docs in `docs/` are. Read this before
changing how the language works, and add to it when a decision is made.

## Rule 0: write it the way geometry is written

Tilde should read like a geometry text. For any syntax or design decision the
test is: *would a geometry book say it this way?* The rules below are mostly this
one rule applied — a program is a set of facts, `=` means "the same as", a new
object gets a new name, words over symbols. Kept in `CLAUDE.md` too, so every
session starts from it.

## The goal

Almost everything the language ships with — `parallel`, `perpendicular`,
`on`, `length` — should be definable by a user with the same tools we used.
Nothing should be privileged just because we wrote it.

---

## Decided

### 1. Definitions are patterns, not names

A definition is identified by its *shape* — the words and slots a user types —
together with the types of its slots. There is no separate function name.

```
(a: Line) parallel (b: Line)
distance between (a: Point) and (b: Point)
```

This started as a TypeScript block table (`kw` / `slot` / `var` / `multi` /
`opt`). Exposing it as a language construct turned out to *simplify* it: `opt`
and `multi` both disappeared, leaving a flat sequence of keywords and slots.
The old `blocks.ts` and its backtracking machinery are gone.

### 2. Slots hold simple things; statements hold patterns

Two layers, kept separate:

- A slot accepts a name, a literal, or something in brackets. Never a bare
  multi-word expression.
- Patterns match at the statement level. Longest match wins.

This is what avoids the parsing nightmare. `distance between a and b + 1` has
one reading, not three.

### 3. Bracket everything for now; left-to-right later

Start with required brackets for nesting. The eventual rule, which brackets are
a subset of:

- Arithmetic (`+`, `*`) keeps normal precedence.
- Pattern operations are all one level, strictly left to right, looser than
  arithmetic.
- Brackets override.

So `l parallel m rotated 60 at 5` will mean `((l parallel m) rotated 60) at 5`.
One rule, no table to memorise. Starting with brackets-only is compatible —
it's this rule with the left-to-right part switched off.

### 4. Declaring forms are written explicitly (not derived)

`line l parallel m` is its own definition, separate from `l parallel m`:

```
define (a: Line) parallel (b: Line) => Line =
    tsx`
    constrain({ kind: 'parallel', l1: a, l2: b })
    return a
    `

define line (n: Name) parallel (m: Line) => Line =
    line n
    n parallel m
    return n
```

**Why not derive it automatically.** The earlier plan was to generate the
declaring form from any constraint whose pattern starts with a slot. That broke
on `line l rotate 60`, which is nonsense. The reason: `l parallel m` returns
*the same* `l`, now constrained, while `l rotated 60` returns a *new* line — so
declaring `l` and binding it to a different line is circular.

That distinction is a property of the body (does it introduce a new element?),
not the signature. It's inferrable for composed definitions and *not* for
`primitive` bodies, which can't be inspected — so automatic derivation needs a
tag plus an exception. Not worth it.

Write both forms by hand in the prelude. Once there are twenty of them and the
shared shape is visible, automate it then. Deriving from two examples is how the
first attempt went wrong.

Errors still hold:
- `line l parallel m` when `l` already exists → redeclaration.
- `l parallel m` when `l` doesn't exist → unknown name.
- `point p parallel m` → no definition of `parallel` accepts (Point, Line).

**Why the declaring form works in Tilde and wouldn't elsewhere:**
`line l parallel m` doesn't pin `l` down — it still slides along one direction.
In most languages that's "not enough information, error". Here it's just
`dof > 0` and a wavy line. The existing certainty machinery makes it legal.

### 4b. Constraints return their subject

`l parallel m` yields `l`. This is what makes chaining work:

```
line l parallel m through p
```

Under the left-to-right rule (decision 3) that groups as
`((line l parallel m) through p)` with no brackets needed. Brackets are only
for when you want something *other* than left-to-right.

So nearly everything has a return type, and "has a return type" is **not** a
useful discriminator between constraints and producers. What differs is whether
the returned thing is the subject or a new element.

### 5. There is really only one kind of definition

The taxonomy (computation / construction / constraint / transformation) turns
out not to be a language-level thing. Everything is a **relation over typed
slots**. What differs is only how many directions it can be solved in:

- `distance between a and b` — solvable both ways. Known distance plus one
  placed point is already the circle locus in `CIRCLES_NOTES.md`.
- `l rotated 60` — solvable one way in practice.
- `area of poly` — one way only, because the reverse isn't meaningful.

So we don't implement four kinds of function. We implement relations, and note
which directions each can go.

What *does* differ between definitions is whether the result is the subject
(`l parallel m` → the same `l`) or a new element (`l rotated 60` → a new line).
That drives which surface forms are legal — see 4 and 4b.

### 6. No mutation, and no reassignment — new objects get new names

**Revised.** This originally allowed *rebinding*: `l = l rotated 60`, where the
name moves to a new line while the old line stays put. Dropped, because it makes
`=` mean two things and breaks the rule that `=` only ever narrows:

```
point p = (3, 4)
p = (1, 2)            a contradiction, not an update

point p = (2, )       x is 2, y unknown
p = (2, 3)            narrowing — fine
```

So `=` means "these are the same", always. A new object gets a new name, the
way geometry is written on paper — *rotate l by 60° and call the result l′*:

```
line l' = l rotated 60
```

Names may carry primes (`l'`, `A''`) for exactly this. It gets verbose in long
constructions, and that is accepted as the price of a program being a set of
facts rather than a sequence.

Nothing is ever modified in place, in v1 or after. Tilde's constraints are a set,
not a sequence — mutation, or a name moving part-way through, would make a
program's meaning depend on statement order.

**Considered and left open: explicit redefinition.** For cases where you really
mean "no, this one", something like `redefine p as (1, 2)` (or `:=`). The
semantics that fit are GeoGebra's — *replace* p's definition everywhere, so
everything depending on p follows and order still does not matter. Rejected
alternatives: mutators like `l rotate 60` (is `p on l` about the old l or the new
one?) and `<=`, which geometry will want for inequalities. Better suited to
interactive editing than to files; not built.

Consequence: "pass by reference, explicit copies" is dropped from the
philosophy. Nothing mutates, so nothing needs defensive copying.

### 7. Chained expressions desugar to hidden declarations

`l parallel m rotated 60` creates underscore-prefixed intermediates, which the
renderer already filters out.

Drawing rule:
- Things declared at the top level are drawn.
- Intermediates are not.
- `draw` inside a definition overrides, to expose a shape deliberately.

### 8. Predicates are separate definitions

`is l parallel m` is its own definition, unrelated to `l parallel m`. Different
maths inside. Convention: predicates start with `is`. This is for readability —
the parser doesn't need it, since the patterns already differ at the first word.

Adds a `bool` type. No control flow planned.

A bare predicate as a statement means **check and error if false**. So the pair
is: `l parallel m` *makes* it true, `is l parallel m` *checks* it. That's the
"prove that" style of program, and it's worth having.

**Likely superseded — see the roadmap's "Asking as well as asserting".** The
convention here is that a predicate is an *unrelated* definition that happens to
start with `is`. The better shape is `is` as an ordinary definition taking a
Boolean, with each relation offering an asking form beside its asserting one:

```
define (a: Line) parallel (b: Line) => Line:
define (a: Line) parallel (b: Line) => Boolean:
define is (v: Boolean) => Boolean:
```

Composable rather than conventional, and it makes the two forms visibly the same
relation. The cost is real though: it is overloading by **return type**, so
choosing between two definitions that differ only in what they hand back needs an
expectation carried inward from the surrounding statement — where dispatch today
looks only at the kinds of things named. It also needs nesting (decision 3),
since `is a parallel b` is meaningless until a statement can contain another.

### 9. Parsing and dispatch are one pass

`point p parallel m` fails because no definition matches those types — so the
parser can't finish without consulting the type table. Approach: parse to a
*set* of candidate matches, then pick by specificity, error if ambiguous.

For conflicts between two user definitions: longest match wins, ties are an
error at definition time. Crude but fine — there are no users to break.

### 10. Types are implicit tags (superseded: by 15, then fully in 0.3.59)

A type does two separable jobs: **naming** (a slot says what kind of thing it
accepts, a return says what kind it produces) and **declaring** (bringing the
type name into existence, registering it, validating it).

Naming is irreducible. Dispatch *is* "pick by the kind of the arguments", so
slot position has to hold a classifier, and that position is inherently unlike
`parallel` — the word there isn't executed, it constrains.

Declaring is not irreducible. A type isn't one definition; it's a **tag many
constructors share** (`line l`, `line l through p q`, `line l parallel m` all
produce Lines). So the tag can spring into existence the first time a definition
mentions it, exactly as `parallel` isn't declared anywhere — it just is the word
its definitions use.

**Chosen: implicit-on-first-use.** The only thing an explicit declaration buys
today is typo-catching (`=> Lin` silently mints a phantom tag nobody inhabits,
and you find out far away). That's a real cost, but a cheap one with no users,
and it doesn't need syntax to fix — a "declare your tags" check can be added
later as an *optional* pass without ever becoming required.

A `define type` construct is likely wanted eventually — for validation, and as
the natural home for whatever composites need once they carry structure.

**That eventually arrived: see decision 15.** `define type` now exists, and the
prediction held — it earned its keep by carrying *structure* (what a type
contains), not by validating tag names. Both rules still stand: a type with no
declaration is a tag with no fields, and nothing written under the implicit rule
was disturbed.

Note this is *not* what direct field access waits on. Accessors are ordinary
definitions and need no type declaration (see "How far Option A actually
stretches"); a tag can stay a bare tag and still have accessors written for it.

**Revised (0.3.59): a type must exist to be written.** A slot type, a return
type or a field type must be a built-in or come from a `define type`; anything
else is an error where it is written, with a suggestion when only the case is
off (`point` → `Point`). Once `define type` gave types structure, a tag nobody
declared could only ever be a box with a name — no fields, nothing the solver
can place — so `=> Lin` meant nothing but a slip that surfaced far away. The
check runs once every file is loaded, since types are shared by all of them; a
`tsx` body's `declare` is held to the same rule. A bare tag with no fields
cannot be declared today (`define type` needs a field); if one is ever wanted,
allowing an empty `define type` is the way in.

What stays genuinely privileged regardless: `Name` (hardcoded "this is a
declaration site"), `Scalar` (hardcoded "numeric literals fill this"), and
primitive tags being welded to solver representations. The last is the real
frontier — Option B, not a syntax choice.

### 11. Imports are file-scoped and do not transit

The model every mainstream language uses. If A defines `p` and `q`, B imports A
and defines `r` whose body uses `q`, then C importing B sees `r` — and calling
`r` reaches `q` — but C cannot write `q` itself without importing A.

Tilde has no name lookup, so "scope" means *which table a statement is matched
against*. Three sets per module:

| set | contents | what it is |
| --- | --- | --- |
| `own` | definitions declared in the file | — |
| `exports` | own + re-exports | what importers receive |
| `scope` | own + the exports of everything imported | what statements here match against |

The mechanism that makes non-transitivity work: **a composed body expands in the
scope of the module that defined it, not the caller's.** That is exactly lexical
scoping, and it is what lets `r`'s body use `q` while C still cannot.

**Re-export.** `import x` is private; `export import x` also passes x on.
Without the second form a barrel module like `prelude` — which has no
definitions of its own — would export nothing. Rust spells this `pub use`, JS
`export * from`; every language with file-scoped imports needs it, and it exists
precisely for the barrel case.

**Shadowing: local beats imported.** A file's own definitions displace imported
ones with the same signature, so a user really can redefine `parallel` — which
is the whole goal. Two *imports* colliding stays an error, surfaced at dispatch
as an ambiguity: there is no principled winner between them, so the collision is
loud rather than silently order-dependent.

Signature means keywords plus slot *types*, with slot names dropped —
`(a: Line) parallel (b: Line)` and `(x: Line) parallel (y: Line)` are the same
definition as far as dispatch is concerned.

Import cycles are an error rather than something to resolve. There is no reason
to allow them yet, and the error names the path.

### 12. `return` designates the result; it is not control flow

A composed body ends with `return x`. The rule it replaced — "the body's value
is its last line's" — worked, but tied the result to the order the body happened
to be written in. With `return`, order is free: `return c` may name something
built three lines up.

`return` may only be the **last** line. Nothing is skipped and there is nothing
to skip; it says which of the things built above comes back, and that is the one
thing left to say once the body is written.

A signature and its body must agree: `=> T` with no `return` is an error, and a
`return` with no `=> T` is an error. What comes back is checked against what was
promised, so reordering a body can no longer quietly change its result.

This makes `return` the fifth word nothing can redefine, and the first addition
to `define` / `import` / `export` / `tsx`. Justified because it is not a
relation over slots — it is the one piece of a definition that talks *about* the
definition.

### 13. A body's own names belong to the call

A name a body writes on its own account — not arriving through a slot — is keyed
per call, so the same definition can be used twice:

```
define dot (n: Name) at (x: Scalar) (y: Scalar) =
    point n at x y
    circle c with center n and radius 1

dot d at 3 4    -- d, d_c
dot e at 1 1    -- e, e_c
```

Locals are identified statically at load: words in a body that are neither its
slots nor any definition's pattern word. **The whole prelude has zero** — all 12
composed definitions use only slot names — which is why this never surfaced
until a user definition did.

The key comes from the `Name` slot, which keeps it readable and tied to
something the caller wrote. A definition with locals and no `Name` slot has
nothing to key by; that wants a per-call counter, deliberately not built, and is
an honest error until it is.

**This is uniquification, not encapsulation.** `d_c` is reachable from the outer
program. Hiding it would need the symbol table split into "what elements exist"
(global — the solver needs every one) and "what names are visible here" (per
scope). Those are conflated today, which is exactly why keying and visibility
are the same thing. Deliberately left as-is.

**Revised (0.3.55): the split is made.** Every element is data in one store,
keyed by the store (`Point#1`, `Circle#2`); every name is a *label* pointing at a
key, held in a scope. The program has one scope, each running call has its own
(a *frame*), and each piece of data has one for its fields. A call's frame starts
with its element slots and gains whatever names its body gives things as its
lines run; it ends when the call returns. So:

- Locals are no longer found by a static scan. What a word is follows from what
  its line does when it runs — a word in a `Name` slot is being named — so a
  pattern word (`set`, `origin`) can be a body's own name.
- A body sees its frame only, not the program's names.
- A `Name` slot's word carries the frame it was written in, so `point n` inside
  `dot` labels `d` where the caller wrote it.
- The thing outlives its label, as decision 14 says: a local's circle stays in
  the store, drawn only if something still labels it.

### 14. Scopes are about naming, never existence

Worth stating because it is where the intuition from other languages misleads.
In C or JS a local dies with the call — name and thing together. Here the thing
**outlives the call by necessity**: when `dot d at 3 4` finishes, the circle is
still in the drawing. It is output, not scratch memory.

So a scope in Tilde can only ever control *visibility*. Every element needs a
unique global key in the solver model regardless, and scoping would not replace
the keying of decision 13 — it would hide it.

The other half of normal scoping — inner code reading outer names — is
**rejected**. A body sees its slots and nothing else. A definition that could
read whatever happened to be declared around it would build different geometry
depending on its surroundings, and could not be moved between files. Closer to a
hygienic macro than to a closure, which is right when definitions are the unit
of reuse.

---

## Composites: the case that needs classes

Where this stops being enough, worked out against three examples.

**`reflect` on a dot works without any of it.** Make the `Name` slot the point
and `d reflect l` reflects a point. Nothing new needed.

**`scale` on a dot breaks that** — scaling needs the circle, and `d` is the
point. The general lesson is the sharp one: *which parts a definition exposes
decides which operations are writable at all*, and the operations are not
knowable when the definition is written.

But `dot` is rescuable without classes: make the `Name` slot the **circle**.
`Circle` already packages a centre and a radius (`{ center, r }` in the solver),
so `d scale 2` and `d reflect l` both work. Which reveals that **the primitives
already are small classes** — `Line` has `a, b, c`; `Circle` has `center, r` —
and what is missing is only a way to *read* a part.

**`triangle` is the case no rearrangement fixes.** A triangle is irreducibly
three points; no single element can stand for it. Measured: after
`triangle t with a b c`, the name `t` appears in **nothing** — not a constraint,
not a segment. It is a tag with a type and zero content. So `centroid of a b c`
is writable and `centroid of t` is not.

Today that is only an *ergonomic* loss, because `triangle t with a b c` forces
the caller to name the vertices, so they always have them. It becomes an
expressive loss the moment a Triangle can arrive without its parts named — a
definition that *returns* one, or a form like `triangle t inscribed in c`.

Two candidate spellings for reading a part, if built:

- `t.a` — cheap. One atom, fits a slot as-is; the lexer needs `.` as a word
  character and resolution splits on it.
- `t holds a b c` read **backwards** — the same pattern that builds a triangle
  takes it apart, separated from the constructing form by slot types
  (`(t: Name) holds (a: Point)…` vs `(t: Triangle) holds (a: Name)…`). This is
  decision 5 taken seriously: a relation, noted for which directions it runs.
  Needs **name aliasing** — binding a caller's name to an element that already
  exists — which is the same table split decision 14 describes.

Neither spelling writes `centroid` itself: averaging three points needs a
propagation rule the solver does not have. Parts solve reaching the vertices,
not the maths.

### 15. A field holds a whole element, never a piece of one

Built. `define type` declares what a type contains; `t.a` reaches it.

```
define type Triangle =
    Point a
    Point b
    Point c
```

Fields are written **type-then-name** — `Point a` — mirroring how a statement
declares an element (`point a`), so the two read alike. Types are capitalised,
pattern words are not.

**The boundary, and the reason for it.** A field may hold any *whole element*
and never a piece of one. `Point a` yes; `Scalar x` inside `Point` no. The
reason is correlated solutions: a line found by two tangency conditions has

```
resolved: [ {a,b,c}, {a,b,c} ]     two whole triples
```

and the correlation survives only because the three coefficients are stored
together. Split them into scalar boxes and two real answers become 2×2×2 = eight
candidates, six fictional. That is why reaching *inside* a primitive needs
solutions to become global branches — the expensive rewrite — while reaching a
*part* costs nothing.

**Access is by path, and everything is public.** `t.a` resolves before matching:
look up `t`, find its type's field `a`, hand back the key that field references.
From there it is an ordinary element, so every existing constraint accepts it and
dispatch sees the *field's* type rather than the owner's. No privacy model — the
alternative considered was making destructuring forms the only door, which
dissolves privacy by making access a definition, but costs a naming line before
every use. Rejected as premature: privacy can only ever *remove* access, so
adding it later cannot invalidate anything written now.

**Fields are set once, when the element is made.** Nothing in Tilde mutates
(decision 6), so a field never needs updating and no assignment form is needed.
`declare` grew an optional third argument rather than gaining a new API call:

```
define (t: Name) holds (a: Point) (b: Point) (c: Point) => Triangle =
    tsx`
    segment(a, b); segment(b, c); segment(c, a)
    return declare(t, 'Triangle', { a, b, c })
    `
```

**Type declarations are global**, not per-module. A type name is already a global
tag (decision 10 — any definition may write `=> Triangle` with nothing declared
anywhere), so scoping the declaration while the tag stays global would be a
distinction without a difference.

### 16. Making and naming are generic; no shape needs its own hatch

`holds` was Triangle-specific and lived in `core`, which put a composite's
construction inside the hatch. Three generic primitives replace it:

```
define new  (ty: Name) (n: Name)  = tsx`mint(n, ty)`
define call (x: Any) (n: Name)    = tsx`alias(n, x)`
define segment (p: Point) (q: Point) = tsx`segment(p, q)`
```

and Triangle moves to `shapes.til`, written entirely in Tilde:

```
define type Triangle =
    Point point1
    Point point2
    Point point3

define triangle (t: Name) with (a: Name) (b: Name) (c: Name) => Triangle =
    new Triangle t
    call t.point1 a
    call t.point2 b
    call t.point3 c
    segment a b
    segment b c
    segment c a
    return t
```

**`new` needs no keyword.** The type name rides in a `Name` slot, because a
`Name` slot is really just "a bare word" — `typesFit` only checks the token is a
WORD, and *declaring* is what a body chooses to do with it. It mints an element
and recurses through the type's declared fields as `<key>.<field>`, stopping at a
type with no declaration — which is exactly where the solver's own primitives
are. So `new Triangle t` reaches three real Points and no further.

**`call`, not `is`.** Decision 8 reserves `is` for predicates by convention, so
`a is t.point1` would read like a question rather than a naming. `call t.point1 a`
also states the direction unambiguously, which neither `a is t.point1` nor
`t.point1 as a` does.

**`Any`, the top type.** `call` works on a thing without caring what kind it is,
and slot types were exact-match. One line in `compatible`. Use sparingly: an
`Any` slot matches every candidate, so it makes ambiguity easier to reach.

**Fields are numbered, not lettered.** `point1`..`point3` carries to shapes with
more corners; `d` would have run out of alphabet and out of convention.

**Consequence: keys became structured, names became labels.** A triangle's
corners are keyed `t.point1` with `a` as a *name for* it — one box, two names,
not a copy kept in step. So the two spellings mix freely:

```
triangle t with a b c
a at 0 0            -- the caller's name
t.point2 at 6 0     -- the path
```

That made the drawing say `t.point1` where the program wrote `a`, so
`buildSceneGraph` takes an optional label map and `solveSource` fills it from the
aliases. Segment labels separate only on dotted paths (`t.a–t.b`), so classic
subscripts keep the plain `t_1t_2` form.

**And it narrowed what counts as a local.** Two things look like new names and
are not: a **path** (`t.a` — you can only reach a field of something that already
exists) and a **type name** (`Triangle` in `new Triangle t` — a kind, not an
element).

### 17. Scalar bindings run both ways

Built. `scalar = element.field` used to fire in one direction only:

| | before | after |
| --- | --- | --- |
| element known, scalar tracks it | `k = 7` ✓ | ✓ |
| scalar known, element free | `p = (0,0)` ✗ | `p.x = 7` ✓ |

The constraint was recorded and silently never applied, which is worse than an
error — the shape drifted to wherever the pick strategy put it.

**Correlation is untouched**, which is why this did not need the pure model. The
write goes *inside* one whole element, so a line's coefficients stay together and
two tangent answers never decompose into eight. An element that already has
multiple discrete solutions has no null fields to write into, so it is skipped by
the existing null check rather than needing a special case.

**The subtlety, worth recording because it cost the debugging.** A raw write to a
point's coordinate is not enough. The gauge fixer pins any point with remaining
freedom at the canonical origin, so it overwrote the axis just fixed — `x` went
in as 7 and came out 0. A known single coordinate has to be spelled as an
**axis-aligned line the point lies on** (`synthesizeAxisLine`), the same route
`point p = (5,)` already takes. Being on a line is what tells the gauge fixer the
point is no longer free to translate that way. The lesson generalises: the model
has one way of saying "partially placed", and a new rule has to use it rather
than invent a second.

**Scalars reached the language too.** The prelude gains `scalar n` and
`scalar n is v`, and a `Scalar` slot now takes either a literal or a named
scalar — the body branches on `typeof`, since a literal can go straight into the
constraint while a name has to be tied to the field. So `point p at k 2` mixes
the two, and two shapes share a dimension by naming it.

**Still not possible:** `scale`, which needs `2 * r`. That is arithmetic, and
there is no expression language — a separate and larger piece.

---

### 18. Outputs are written `new`, and handed back to the caller

Built (0.3.56). A slot written `(n: new Point)` is an **output**: the caller
writes a name there, and gets back, under that name, whatever the body made or
chose. It replaces using `Name` slots for names being given.

```
define point (n: new Point) at (x: Scalar) (y: Scalar) => Point:
    point n
    n at x y
    return n

define triangle (t: new Triangle) with (a: new Point) (b: new Point) (c: new Point) => Triangle:
    new Triangle t
    call t.point1 a
    …
```

**Inside the body an output is just the body's own name.** `point n` labels `n`
in the call's frame, like any local. The caller's word is never written into
the body.

**When the call ends, each output is handed back.** The caller labels the word
it wrote with whatever the body's `n` points at — a call is destructuring:
`point d at 3 4` is `[d] = point_at(3, 4)`. Nested calls hand back one level at
a time, so a name passed through two definitions needs no special treatment:
`inner` hands `m` back to `outer`, `outer` hands it to the program as `d`.

**The body decides what an output is.** Usually something new (`point n`), but
it may be something that already exists — `call t.point1 a`, or `point p = (3, 4)`
naming the bracket's point. That is why the box is not made when the call
starts: a name already pointing at a fresh box could not be pointed anywhere
else (no reassignment), and `a` could never become `t.point1`.

Rules:
- The caller's word must be new where it is written — checked before the body
  runs, so the error points at the right line.
- If the body never labelled the output, a fresh element of the promised type is
  made and handed back. `new Any` has no type to make, so leaving it unlabelled
  is an error.
- What is handed back must be the promised type ("promised a Point for `n` but
  made a Line").
- `=> T` and `return` are unchanged: they give the statement its *value*, for
  brackets. Naming and value are separate — `triangle t with a b c` hands back
  four names and returns `t`.
- For dispatch an output is a plain word, whatever its type: nothing about a new
  name tells `new Point` from `new Line`. So two definitions differing only in an
  output's type are one signature — a redefinition, not an overload.

**`Name` now means only "a word"** — a setting (`set (s: Name) on`) — written
into the body as itself. A type's name has its own slot type, `Type`, which
takes a word only if it is a known type: a built-in, or anything a `define type`
declared. So `new (ty: Type) (n: new Any)` catches `new Triangel t` where it is
written, and `define make (ty: Type) (n: new Any): new ty n` passes `Triangle`
on, while `n` stays the body's own.

A `Type` slot is a word list that grows as files load. Settings could work the
same way, but their list is fixed in the TypeScript, so a `Setting` type would
be privileged. The general form would be word lists anyone can declare
(`define words Setting: grid axes origin subscripts`) — not built.

**For now a `Type` slot is an enum, deliberately.** It asks one thing: is this
word in the list of known types? That is enough while types are flat. It will
likely have to change once there is a type hierarchy (`Square <: Polygon`): a
slot may want "any kind of Polygon" rather than "any type at all", and `new ty n`
may need to know what `ty` is bound by to type `n`. Not designed; noted so the
enum is not mistaken for the final shape.

This retires the `@` marks of 0.3.55, where a Name-slot word was written into
body lines as `d@0` so declaring it could reach the caller's frame. Nothing
reaches into another frame now; the caller does its own labelling.

**Once `=` can merge two elements, this should change.** Today the body has to
*choose* what an output is, because a name cannot be re-pointed. With merging,
the box can be made eagerly instead:

- When a call starts, each `new T` slot gets a fresh box of type `T`, labelled at
  once in both the caller's frame (its word) and the body's (the slot name).
- Naming something that exists becomes `=`: `a = t.point1`, `n = q` — and
  `call` is no longer needed.
- Hand-back, the end-of-call type check and the "never made its `n`" error all
  go: the box exists, with the right type, from the start, and the body can use
  `n` from its first line.

The merge this needs is mostly in evaluation — a "same as" link per key (union-
find), with every key followed to its representative before solving — not the
solver's set semantics. See "Possible values" for the larger picture.

## The big open question: how does a user write the maths?

If a user defines `parallel`, they need to say what it *means*. `l parallel m`
is "the slopes are equal" — so they need to reach inside a line.

**The problem:** the solver has no general equation solver. It's hand-written
propagation rules (`src/lang/solver/propagate/geometric/`) over fixed shapes —
points as `x,y`, lines as `a,b,c`, circles as `center,r`. Give it an arbitrary
equation and there's nothing to hand it to.

Three ways out:

### Option A — compose from built-in primitives (cheap)

Users build new constraints only out of ones that already exist. `parallel`
stays built-in; a user can define `rhombus` from `length` and `parallel`.

- Cheap. Works with the current solver unchanged.
- Covers most of what people actually want to define.
- But it fails the stated goal — `parallel` itself wouldn't be user-definable.

### Option B — expose fields, add a numeric solver underneath (real answer)

Shapes expose their internals (`l.a`, `l.b`, `l.c`, `p.x`, `p.y`). A definition
body is a set of equations. Propagation rules stay as the fast, exact path;
anything they don't cover falls through to a general numeric solve
(Newton / least-squares).

- Actually meets the goal. Any shipped constraint becomes user-definable.
- Big piece of work, and it changes the solver's character — numeric results
  aren't exact, and `dof` / `one` / `multiple` / `infinite` need rethinking for
  numerically-solved constraints.

### Option C — derive propagation rules from equations

Same surface as B, but instead of a numeric solver, generate propagation rules
from the equations symbolically. Hardest of the three; a small computer algebra
system.

**Decided: build A now, stay compatible with B.** A real solver (numeric or
symbolic) is the long-term goal, but it's too big to dig into now. So for now
core definitions are tied to solver primitives, and the most a user can do is
compose them.

Three rules keep that from becoming a dead end:

1. **Built-ins are declared in the same syntax users write.** `parallel` gets a
   pattern and slot types exactly like a user definition. The only difference
   is its body says "solver primitive: parallel" rather than a composition.
   Later a body can say "these equations" and nothing above it changes.
2. **The body is opaque to everything else.** Patterns, dispatch, and
   desugaring must never look inside a definition's body. If that holds,
   swapping bodies from primitives to equations is a local change.
3. **Reserve the field-access syntax now**, even unimplemented. Pick the form
   (`l.a`, `l's slope`, …) so it isn't wedged in later against something else
   that has claimed it.

### How far Option A actually stretches

Prompted by: "the line's y-intercept equals the circle's radius — do I have to
reach into the line's `c`?" Working it through moved the A/B boundary a long way
in A's favour.

**Accessors need no new syntax.** `define y intercept of (l: Line) => Scalar` is
an ordinary mixfix definition — a pattern, a slot, a return type. Dot syntax was
never *required* for accessors; mixfix already is accessor syntax. The type stays
a plain tag (decision 10); nothing about it needs to "expose" structure at the
language level. The body reaches the representation through the tsx hatch, which
is the same privilege `parallel`'s body already has, not a new kind of privilege.

**The real move is constructive, not extractive.** Don't express an accessor as
a read; express it as a construction:

```
define y intercept of (l: Line) => Point
    point q
    q on l
    q at 0 _
    q
```

The y-intercept is *the point where l meets the y-axis*, not a number extracted
from a representation. Written that way it is bidirectional for free —
`on-line` propagation already runs both directions, so a known `l` places `q`
and a known `q` constrains `l`. No solver work at all.

Degenerate cases fall out correctly: a horizontal line has no y-intercept →
no solution; the y-axis itself has infinitely many → infinite. The existing
certainty machinery already models both.

**What is genuinely still blocked**, in order of cost:

| Kind | Status |
| --- | --- |
| Stored structural accessors (`center of c`, `x of p`) | free, already bidirectional |
| Constructible accessors (y-intercept, midpoint, foot of perpendicular) | free — prelude definitions, no solver work |
| Scalar ↔ field in the *constraining* direction | one contained solver gap (below) |
| Derived scalars with no constructive reading (slope-as-a-number) | a propagation rule each, or Option B |

The contained gap: `ScalarEqualityConstraint` already carries
`target: number | { element, field }`, and `tryResolveScalarBindings`
(`src/lang/solver/propagate/geometric/index.ts`) reads `a`/`b`/`c` off lines,
`x`/`y` off points, `r` off circles. But it only fires once the element
`isWorkingComplete` — element → scalar, never scalar → element. So a field can
be *observed* today, not *imposed*. Making that binding run both ways is a local
change, not a general solver.

Also worth noting for the original example: `l.c` is not the y-intercept. A line
is `ax + by + c = 0`, so the intercept is `-c/b` — even the stored field is the
wrong quantity, which is exactly why the constructive framing is the better one.

**Net:** "a type must expose its parameters" is not a language feature that has
to be added. It's a per-accessor solver investment, the same finite kind
everything in `propagate/geometric/` already is. Reframing derived quantities as
named objects converts many would-be equations into constraints that already
exist.

**Direct field access is still wanted** — not everything has a succinct name,
and `y intercept of` is verbose for what it does. But it is not on the critical
path for anything, so it stays reserved-but-unbuilt per rule 3.

## Concrete syntax for definitions

Slots are parenthesised and typed inline. Everything outside parens is a
literal keyword. Parens are holes, bare words are words — readable at a glance,
and slot names and types live in one place rather than a separate signature.

```
define distance between (a: Point) and (b: Point) => Scalar =
    tsx`
    return measureDistance(a, b)
    `

define centroid of (ps: [Point]) => Point =
    tsx`
    return centroidOf(ps)
    `
```

Composed bodies — what users can write today:

```
define (a: Line) perpendicular (b: Line) at (p: Point) => Line =
    a perpendicular b
    p on a
    p on b

define (l: Line) through (p: Point) => Line =
    p on l
```

**Sub-decisions:**
- `define` as the keyword — rare enough that verbosity is free, and a leading
  keyword makes definitions skimmable.
- `=> Type` for the return.
- `tsx\`...\`` as the hatch to TypeScript — see below.
- No `new` marker — superseded by `Name` slots, below. (Reversed by 18: outputs
  are written `new T` again, and `Name` means only a word.)
- `[Point]` for list slots is the one bit that reads like a programming
  language rather than mathematics. Alternative: `many Point`. Unresolved.

**Implemented.** `src/lang/defs/` parses all of this; `src/tests/defs.test.ts`
covers it. A pattern is a flat `PatternPart[]` of `keyword` and `slot` — no
optional or repeated parts, since variants are separate definitions and
comma-lists are handled by distribution at the statement level.

### Shape names are not keywords

`line`, `point`, `circle` are **not** reserved words. They're ordinary keywords
inside a pattern, exactly like `parallel`. Declarations are just definitions:

```
define line (n: Name) => Line = declare n as Line

define line (n: Name) parallel (m: Line) => Line =
    declare n as Line
    n parallel m
    draw n
```

So a user can define `bar`, `ray`, or `arc` with the identical shape. Nothing
about `line` is privileged, and the goal that anything shipped be
user-recreatable now covers declarations too.

**`Name` is a slot type.** `(m: Line)` means "resolve this, error if unbound".
`(n: Name)` means "take the token as-is, it's a declaration site". This replaces
the `var` vs `slot` block-kind split — same concept, moved into the type system.

It is an identifier, not a string. `line "foo" parallel m` is nonsense.

**These definitions are macro-like, deliberately.** A definition with a `Name`
slot injects a binding into its *caller's* scope. Functions don't do that;
macros do. It's the feature that makes multi-declaration statements work:

```
define triangle (a: Name) (b: Name) (c: Name) => Triangle = ...
```

Fine for a hand-written prelude. The guardrail to keep: only `Name` slots can
be bound, so every injected name is visible in the pattern at the call site —
`line l parallel m` shows you `l` right there.

**What users still can't define: types.** `Line` and `Point` as *types* remain
built-in. That's a smaller and more honest boundary than a list of reserved
words — see the split below.

### Primitive vs composite shapes

- **Primitive** — Point, Line, Circle, Scalar. The atoms the solver knows how
  to place (`x,y` / `a,b,c` / `center,r`). Can't be containers; they're the
  bottom. Adding a *new* primitive needs the real solver (Option B), and the
  primitive set for 2D Euclidean geometry is small and basically closed — you
  will almost never want one.

- **Composite** — Triangle, Segment, Polygon, Rhombus. A named container of
  geometry plus constraints. These need **nothing** beyond what's already
  designed:

```
define triangle (a: Name) (b: Name) (c: Name) => Triangle =
    declare a as Point
    declare b as Point
    declare c as Point
    ...
```

The solver never sees "Triangle" — it sees three points and their constraints.

This is most of what users would actually want to define. So the boundary isn't
"user shapes need a real solver", it's "user *primitives* need a real solver".

**Not exposed in v1.** The missing piece is a syntax for declaring the type:
introducing the name `Triangle`, saying what it holds, registering it for
dispatch. That syntax isn't worth designing yet — but the mechanism exists now
and the prelude uses it internally.

**v1 composites need no field access.** `triangle a b c` binds `a`, `b`, `c` in
the caller's scope, so you already hold the names — nothing ever asks a triangle
for its vertices. Field access is only needed when a composite is *passed*
somewhere (`area of t`), and those consumers are `primitive` bodies that reach
the parts in TypeScript. So `l.a` stays deferred, cleanly.

### The hatch into TypeScript

A definition body is either composed Tilde, or a `tsx` block:

```
define (a: Line) parallel (b: Line) => Line =
    tsx`
    constrain({ kind: 'parallel', l1: a, l2: b })
    return a
    `
```

Slots are in scope by name. `emit` appends a Statement; the return value is the
definition's result.

**Why not a named primitive table.** A table (`primitive "parallel"` mapping to
a TS function) keeps one contract point, but splits every builtin across two
files that can drift. The tagged block keeps the pattern in `.til` *and* the
body next to it — one place, no sync problem, and `parallel` is still fully
visible to anyone reading the prelude. That last part is the whole goal.

**Start with runtime eval.** Simplest thing that works. The cost is that the TS
inside is invisible to the typechecker and bundler, so a typo is a load-time
error rather than a compile error.

**A build step is the upgrade, not a rewrite.** A Vite plugin extracting `tsx`
blocks into a real module gets typechecking and bundling back. Deferred.

**And it converges on a table by itself** if the coupling ever hurts: factor a
body into a named function and the block collapses to `tsx\`parallel(a, b)\``.
That's the table, arrived at gradually. No fork to regret.

**Playground note:** users typing definitions in the browser can't have TS
compiled for them — but users only write *composed* definitions, and builtins
ship pre-built. Doesn't bite.

**Editor note:** `.til` files mix two languages. Accepted — these files get
edited in VS Code, not in the Tilde editor, and highlighting is a nice-to-have.

### The prelude

Built-in definitions live in real `.til` files that the language parses at
startup — not a TypeScript table.

```
define (a: Line) parallel (b: Line) => Line =
    tsx`
    ...
    `
```

Pattern, slot types, declaring form, dispatch: all Tilde, all identical to what
a user writes. Only the body is a hatch into the TS solver. The solver is never
written in Tilde.

This is the cheapest dogfooding available. If the prelude is awkward to write,
users will find the language awkward, and we find out immediately rather than
after shipping.

**The prelude is not auto-imported.** A program writes `import prelude` like it
would import anything else. Keeping it unprivileged means it can't accumulate
special-case handling, and dropping or replacing it later costs nothing.

### Imports

`import <module>` — bare names, not quoted paths. Semantics are decision 11:
file-scoped, non-transitive, with `export import` to re-export. This replaced an
earlier plan of *textual inclusion* — each module pasted in once, in order —
which was simpler but transitive, so importing anything silently exposed
everything it imported.

- **Dedup is still required.** A file defining the same signature twice is an
  error, so a diamond import would break without it. `loadModule` caches by
  module name, which handles diamonds; cycles are reported rather than absorbed.
- Modules resolve through a `Registry` (name → source) rather than a filesystem,
  since the playground runs in the browser. Nothing about the prelude is
  privileged in it — a program could be handed a different registry entirely.

Tilde source files use the `.til` extension. The prelude lives in
`src/lang/prelude/` — `core.til`, `shapes.til`, `constraints.til`,
`prelude.til`, with `index.ts` as the registry.

**Formatting rule:** nothing follows `=` on a definition line. The body starts
on the next line, indented; a `tsx` block opens there and its closing backtick
is indented to match. TS inside a `tsx` block sits at the same indent as the
`tsx` itself, not one deeper.

**Where a body ends:** at a blank line, or a line starting at column 0 —
whichever comes first. "Blank" means whitespace-only, not strictly empty.

This is deliberately *not* significant indentation. The lexer needs one bit per
line (indented or not) and no INDENT/DEDENT tokens. `tsx` blocks are exempt
since backticks delimit them, so blank lines inside TS are fine.

Accepting the column-0 half as well as the blank-line half costs nothing and
contains the damage when a stray blank line truncates a body: the next
definition still parses, so the error can be reported where it happened rather
than cascading.

Forward-compatible with whatever comes later — real nested blocks (add
INDENT/DEDENT), an explicit `end`, or braces. Nothing here forecloses them.

### What writing the prelude by hand surfaced

1. **`opt` and `multi` blocks were unnecessary.** `l parallel m at 3` is two
   definitions, not one pattern with an optional tail; comma-lists became the
   statement-level distribution rule. Both block kinds are gone, and with them
   the backtracking matcher — a `Pattern` is now a flat `PatternPart[]`.
2. **One hatch, not two.** The first draft had `declare n as Point` alongside
   `primitive "..."` — two mechanisms for one job. Now everything native is a
   `tsx` block, and `declare`/`as`/`primitive` are all gone as keywords.
3. **Splitting definitions beats a hole marker.** A single `circle-spec` needed
   a way to say "centre known, radius not". Splitting into
   `with center` / `with radius` removes the need for `_` entirely — and they
   compose, so `circle c with center p and radius r` is three lines of Tilde.
4. **The prelude composes itself — about half of it.** `point n at x y` calls
   `point n` then `n at x y`; `l through p` is just `p on l`; the whole
   declaring-forms section is composition only. Measured split is 13 `tsx` to
   12 composed, so an earlier claim here that "most of the prelude composes"
   was wrong. The composed half is the ergonomic surface, the `tsx` half the
   primitive surface. Asserted in `defs.test.ts` so the ratio can't drift
   unnoticed.
5. **Splitting subject-forms from declaring-forms fell out naturally.**
   `(p: Point) at (x) (y)` and `point (n: Name) at (x) (y)` are separate, and
   the second is defined in terms of the first. Same for circles. That pattern
   repeats often enough that deriving it later looks plausible — which is the
   evidence decision 4 wanted before automating anything.
5. **Chaining type-checks.** Each constraint returns its own subject, so
   `line l parallel m through p` is `Line → Line → Line`.

Not yet covered: `segment`, `length`, `pick`, `set unit`. `pick` especially —
it interacts with the multiple-solutions state rather than being an ordinary
definition.

---

## Multiple arguments — distributive vs collective

Two different things that look alike:

- `l, m, n through p` — shorthand for three separate statements. The
  application is repeated.
- `centroid of p, q, r` — one application that genuinely needs all three at
  once.

Resolution is **type-directed**, falling out of dispatch:

**Collective = a real list slot.** The signature says so: `centroid of _:[Point]`.
One application, the slot holds a list. Declared by the definition author.

**Distributive = a statement-level rule, not a slot property.** If a comma list
appears where a *single-value* slot is expected, the statement repeats for each
item. Nothing to declare — it works automatically for every definition,
including user-defined ones, and expands as sugar before anything else runs.

So the parser checks the slot's type: list type → fill it, singular type →
distribute.

Two guardrails:
- **At most one distributing slot per statement.** `l, m parallel n, o` could
  be a cartesian product or a zip; nobody will guess right. Error.
- **Distribution only at statement level, never inside an expression.**
  `(l, m rotated 60)` would have to produce a list, which reintroduces
  collections through the side door.

---

## Multi-valued results — resolved

Two things that look identical on screen but aren't:

- **`l intersect c` → two points that both exist.** The circle really does
  cross the line twice. Nothing is ambiguous; you asked for a set and the set
  has two members. One answer that happens to be a pair.
- **`point p on l; p on c` → one point, two possible positions.** There is a
  single `p` and reality hasn't decided where it is. Two solutions, one value
  each. This is what `pick` is for.

The test: **is the ambiguity in the world, or in the naming?** A set of things
that all exist at once is a collection. One named thing that could be in
several places is multiple solutions.

**For v1: no collections.** The constraint form already covers the use case
through machinery that exists, and `pick` already handles the choice.
`l intersect c` as a value only earns its keep when you want to name both
points at once — it can be added later without disturbing anything.

---

## Still unresolved

- **Subtyping.** `Square <: Polygon <: Shape` is in the philosophy, but the
  only hierarchy in mind is polygons, and polygons don't exist yet. Deferred —
  flat type matching for now. Revisit when polygons land, since dispatch
  specificity is meaningless until then.
- **`define type`.** Settled for now by decision 10: type names are implicit
  tags, introduced by the definitions that use them. Wanted later for typo
  validation (and as the home for composite structure), but nothing is blocked
  on it. User-defined *primitives* still need Option B.
- ~~**Scoping for definitions.**~~ Settled by decision 11 and built.
- ~~**Evaluation.**~~ Built. Composed bodies expand by substitution, `tsx`
  bodies run, and the output is a ConstraintSet the existing solver solves. The
  multi-`Name` deferral is closed — see "Resolution and evaluation interleave".
- **Order-independence choice.** Resolution is declaration-before-use (a name's
  *type* must precede its use). This is deliberately *stricter* than the legacy
  `elaborate.ts`, which forward-collects scalar declarations. That legacy path
  gets superseded once shapes are prelude-defined, so it's left untouched.

---

## Built so far

`src/lang/defs/` — `types.ts` (Pattern, Definition, Import, signature),
`lexer.ts` (line tokens, no keyword table), `parser.ts` (line framing + header
parsing), `modules.ts` (imports → a scope), `match.ts` (statement → candidate
matches), `resolve.ts` (candidates → one definition, by type), `eval.ts` (run a
program → ConstraintSet). Covered by `defs`/`modules`/`match`/`resolve`/`eval`
test files.

The prelude is three modules, not two. `core.til` holds all 13 tsx primitives;
`shapes.til` and `constraints.til` each `import core` and hold the 12 composed
forms; `prelude.til` re-exports all three. The split was forced by decision 11:
under the old two-file layout `constraints` needed `line` from `shapes` and
`shapes` needed `on` from `constraints` — a cycle. Pulling the primitives out
broke it, and *every* composed body turned out to reference only core, which is
the layering working as designed. A test now pins that no tsx body exists
outside `core`.

The pipeline, end to end and working:

**parse definitions → match a statement to its candidates → resolve to one by
type → evaluate → ConstraintSet → the existing solver.**

Matching is purely syntactic and returns a *set* — `p on l` yields both the
Line and Circle `on` definitions. Per-pattern matching is deterministic
(single-atom slots, no backtracking), confirming the old block machinery was
unnecessary.

Resolution is per-statement: it filters candidates by the types of the names
involved, settles `p on l` by the type of `l`, and errors on no-match /
no-fit / ambiguity. It is stateless apart from the symbol table handed to it.

Evaluation drives the program and owns the symbol table. Composed bodies expand
by substituting slot values token-by-token and evaluating each line; the body's
value is its last line's, which is how a composed form returns its subject.
`tsx` bodies run through `new Function` with the slots bound as parameters and a
three-call API in scope: `declare(name, type)`, `constrain(c)`, `segment(a, b)`.

### Resolution and evaluation interleave — they are not two passes

The evaluation slice overturned the return-type declaration rule that resolution
originally used. What a statement declares is decided by its **body**, not its
signature. `triangle t with a b c` declares four names, and nothing short of
running `point a` / `point b` / `point c` / `t holds a b c` reveals that — the
signature returns one Triangle and says nothing about the vertices being Points.

So declaration lives in the primitives' `tsx` bodies (`declare(n, 'Point')`),
composed forms inherit it by delegation, and the symbol table fills as the
program runs. Each statement resolves against the table as it stands at that
point. This closes the multi-`Name` deferral properly rather than by special
case, and makes declaration-before-use fall out naturally instead of being
imposed.

### Types split into solver-known and language-only

`declare` routes Point / Line / Circle / Scalar into the ConstraintSet's element
sets. Anything else — Triangle today — is a purely language-level tag: it types
names for dispatch, and its body emits the primitives the solver actually sees
(three points and three segments). The solver never learns the word "Triangle".
This is the composite story working exactly as designed, with no solver change.

### A program is a module

A `.til` file holds imports, definitions and statements together, and the layout
rule already separates them: **a column-0 line that is not `define` or an import
is a statement**, since bodies are indented and definitions are not. No new
syntax was needed — the earlier note calling this "the next real design
question" overestimated it.

Definitions in a file are order-independent (they are a table); statements run
in order (declaration-before-use). Any module may hold statements, entry or not,
and they run when that module loads — dependencies first, entry last, the same
rule Python uses. `runSource(src, registry)` loads the text as a module named
`main` and runs the tree.

This is the first point at which the whole thing is demonstrable end to end:

```
import prelude

define right triangle (t: Name) with legs (u: Scalar) (v: Scalar) => Triangle =
    point p at 0 0
    point q at u 0
    point r at 0 v
    t holds p q r

right triangle t with legs 3 4
circle c with center p and radius 1
```

solves to `p = (0,0)`, `q = (3,0)`, `r = (0,4)`, `c` centred on `p` with radius
1, every element at `dof 0`, with segments `p:q q:r p:r`. `right triangle … with
legs …` is not built in and its body uses nothing a user could not write, which
is the goal from the top of this document, working.

### What evaluation surfaced about the prelude

`distance between p and q => Scalar` was not implementable. `DistanceConstraint`
carries a numeric `value`; the solver stores a length for a pair of points and
has no way to hand a measurement *back* as a scalar. So the form became
`distance between (p) and (q) is (d: Scalar)`, taking the length rather than
returning it, and returning nothing — the sole prelude definition with no return
type. Distance-as-a-value waits on the accessor work above.

Prelude loads via Vite `?raw` rather than the filesystem, so it bundles into the
browser playground. Type declaration in `src/til.d.ts`.

Removed: `blocks.ts`, `blocks.test.ts`, `constraint-defs.ts`, `constraints.ts`,
`constraint-grammar.ts` — all superseded.

---

## Where things stand

Built recently, each covered by tests and the changelog:

- **Brackets group**, worked out from the inside alone: `line l through (1,2)
  (3,4)`, `point p = (3, 4)`. A statement is a tree; groups run innermost first.
  Brackets around one word are always just that word.
- **Elements are data, names are labels.** The store keys every element
  (`Point#1`); the program, each running call and each element's fields have a
  scope of labels. A call's names end when it returns; a local escapes only by
  being returned. Unlabelled shapes are kept but not drawn. (Revises 13.)
- **Outputs are written `(n: new Point)`** and handed back to the caller when a
  call ends; `Name` means only a plain word. (Decision 18.)
- **No reassignment; primes in names** (decision 6, revised). `=` only narrows.
- **Definition headers end in `:`**; `=` is an ordinary pattern word, defined
  per shape in the prelude.
- **Arithmetic on written numbers**, `+ - * /`, as prelude definitions. Negative
  numbers lex. No precedence — brackets required.
- **`print`**, reported after solving. How each kind prints lives in TypeScript.
- **Text**, `"…"`, joined only to text. No implicit number-to-text conversion.

## Open — needs a decision

- **`Type` slots under a type hierarchy.** Today a `Type` slot is an enum of
  known type names (decision 18). With subtypes it may need a bound — "a type of
  Polygon" — and outputs whose type follows a `Type` slot. Waits on the hierarchy.

- **What `=` means.** Whether naming something and saying two things are the
  same are one feature or two. Leaning: one — declaring makes an empty shape and
  every `=` narrows it — but not settled. On the roadmap.
- **Letting the slot decide (brackets piece 2).** `(2, 1)` as a point in one slot
  and a line in another. Planned shape: groups report the set of types they could
  produce, the outer statement picks, the choice passes back down (how Ada does
  it). Needs definitions that differ only by return type to stop colliding, and
  groups resolved before any run. Also what `is a parallel b` needs.
- **Arithmetic on named numbers.** `k + 1` is refused today: evaluation only
  builds facts, and the solver decides `k` later. Needs arithmetic the solver runs
  in both directions, and care with numbers that have several possible values.
- **A stage after solving.** Where printing a point could be written in terms of
  printing its numbers, and measurements could return a value. Depends on `p.x`
  and on running once per version of the drawing.
- **Point equality and partly-known points.** `p = (2, 3)` when `p` is `(2, )`.
  The partly-known point is an infinite set with shape; one route is to express
  "x is 2" only as a constraint, so a point's own state matches a scalar's.
- **`draw`.** Agreed design, not built: top-level names draw by default; inside a
  definition `draw` is needed, and may only draw what the caller can reach (the
  `Name`-slot thing or its fields), so labels are always unique and usable.
- **Using a no-argument definition's result.** `define greeting => Text` runs as a
  statement, but its value cannot be passed anywhere.

## Smaller, whenever

- Precedence for `+ - * /`, as automatic bracket insertion.
- `(c: Circle) with center (p) and radius (r)` for an existing circle.
- `print` for declared types, through their fields.
- `pick`, `set unit`, `set grid` in the definition syntax.
- Retiring the classic front end (`solve()`, `elaborate.ts`).
- The pure scalar model — deliberately deferred.
