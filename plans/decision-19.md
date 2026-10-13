# Build plan: decision 19 — reading a line

The design is decision 19 in `LANGUAGE_DESIGN.md`. This file is the build: the
steps, in order, and for each finished step what changed file by file and why.
Each step is one commit, keeps every test passing, and is reviewed before the
next starts.

| # | Step | Status |
|---|------|--------|
| 1 | A bracket's result stays a value, never text | done — `7c3f240` |
| 2 | Remove `substitute`: a call's frame holds its values | done — see below |
| 3 | Return type joins the signature; every fitting overload kept, exactly one must remain | done — see below |
| 4 | The fold and the restart (one search) | done — see below |
| 5 | `=` returns nothing | done — see below |
| 6 | The slot picks between return-type overloads; `Any` slots error | done — see below |
| 7 | Shrink the prelude: delete the "make it, then say this about it" forms | done — see below |

---

## Step 1 — a bracket's result stays a value, never text

**Before.** `line l through (1,2) (3,4)`: each group ran, its value was turned
into a token (`WORD "Point#1"`, `NUMBER "5"`, `STRING "\"hi\""`), the whole tree
was rendered back to a string (`line l through Point#1 Point#2`), and that
string was lexed and matched again. Name lookup (`keyOf`) recognised `Point#1`
as a key, which is why `#` had to be a word character — and why a user could
type `Point#1`.

**After.** A line being matched is a list of *pieces*. A piece is a word as
written, or a value already worked out. Brackets produce value pieces; the
outer line is matched with them in place. Nothing is rendered or re-read.

**Behaviour that must not change:** every existing program reads the same.
**Behaviour that does change:** `Point#1` can no longer be typed; errors show
the bracket as written (`"l parallel (1 , 2)"`) instead of a key.

### File by file

**`src/lang/defs/values.ts`** (new)
- `Value`, `Text`, `isText` moved here from `eval.ts`, unchanged.
- Why: `match.ts` and `resolve.ts` now talk about values. Importing them from
  `eval.ts` would make a cycle (eval already imports both).

**`src/lang/defs/match.ts`**
- New `Piece` type: `{ kind: 'word'; token }` or
  `{ kind: 'value'; value; text; col }`. `text` is what was written, only for
  error messages.
- New helpers: `piecesOf(string)` (lex → one word piece per token),
  `pieceText`, `showPieces` (for messages), `literalType` (number → `Scalar`,
  text → `Text`).
- `Binding.token` → `Binding.piece`.
- `isAtom` takes a piece: a value piece is always an atom.
- `matchStatement` accepts a string *or* pieces (string kept so tests and
  callers that have text still work).
- `matchPattern`: a keyword only matches a *word* piece — a value is never a
  keyword, whatever it would print as.

**`src/lang/defs/resolve.ts`**
- `resolveStatement` accepts a string or pieces; error text comes from
  `showPieces`.
- `keyOf` no longer checks `store.data.key(word)` — a key is never a word now.
- `wordsOf(pieces)` replaces re-lexing the statement in `endedProblem` and the
  path checks.
- `typesFit`: a value piece fits by its own type (`valueType`): refused by
  output, `Name` and `Type` slots (those take a word as written), otherwise
  `compatible(actual, slotType)`. Word pieces behave exactly as before.
- New exported `valueType(value, store)`: a literal's type by shape, an
  element's from the store.
- `unknownType` reads `b.piece` instead of `b.token`.

**`src/lang/defs/eval.ts`**
- Re-exports `Value`/`Text`/`isText` from `values.ts` so other importers are
  unaffected.
- `evalStatement` builds pieces (via `settleGroups` when there are brackets,
  else `piecesOf`) and hands them to new `evalPieces`, which resolves and runs.
- `settleGroups` returns `Piece[]`: a token node becomes a word piece; a group
  is evaluated with `evalPieces` and becomes a value piece with
  `text: "(inner)"`. A group of one piece is still just that piece. It now does
  its own depth check, since it no longer goes through `evalStatement`.
- `evalMatch`: a value piece puts its value straight into the call — a string
  value (an element key) is also recorded as an element slot, like a name
  would be. Word pieces as before.
- `checkReturn` reads a returned key's type from the store directly. It used to
  go through `typeOfWord` → `keyOf`, which only worked because `keyOf`
  recognised keys. `typeOfWord` removed.
- `alias` (behind `call`): the `existing` it gets is normally a key; checked
  against the store first, falling back to a name lookup.
- `valueSource` comment updated: it is now only used by `substitute`.

**`src/lang/defs/tree.ts`**
- `render` removed — nothing turns a tree back into text any more.

**`src/lang/defs/lexer.ts`**
- `#` removed from word characters; comment updated.

**`src/lang/defs/parser.ts`**
- The "has a `#`" name check removed — the lexer now refuses `#` outright
  (`unexpected character '#'`).

**`src/lang/defs/data.ts`**
- `DataStore.key(s)` removed — it existed only to recognise keys written into
  text. Header comment updated.

**Tests**
- `brackets.test.ts`: removed the `render` test; added five — a group's value
  goes straight into a slot (`print (2 + 3)` → 5); text keeps its quotes;
  a value cannot be a name being given (`point (1, 2)`); a value is never a
  keyword (`a ("on") l`); errors show the bracket as written.
- `data.test.ts`: `point Point#1` now expects `unexpected character '#'`.
- `match.test.ts`: helper reads `pieceText(b.piece)` instead of
  `b.token.value`.

**Docs:** `docs/changelog.md` 0.3.60, `package.json` version bump. No user docs
mention keys.

### Things worth a reviewer's eye
- `matchStatement` / `resolveStatement` taking `string | Piece[]` — kept for
  tests; could become pieces-only later.
- `alias` falling back to a name lookup — only reachable if a tsx body passes a
  name rather than a slot value.
- `substitute` still writes numbers and words into body lines as text; that is
  step 2.

---

Steps below are **planned**, not built. Each section is rewritten as a
file-by-file record, like step 1's, once its commit lands.

## Step 2 — remove `substitute`: a call's frame holds its values

**Before.** When a composed definition ran, `substitute` rewrote each body line
as text: a slot holding a number, text or a `Name`/`Type` word had its name
replaced by that value (`n at x y` → `n at 3 4`), and the line was lexed again.
Element slots were already labels in the call's frame and were not rewritten.

**After.** The frame holds every parameter that is not an element in a new
`params` map. A body line is read as written; when it is resolved, a word that
names a param stands for it — a number or text becomes a value piece (step 1's
mechanism), a `Name`/`Type` word becomes the word the caller wrote. Nothing is
written into a line.

**Behaviour that must not change:** everything. No changelog entry — no
language behaviour changed.

### File by file

**`src/lang/defs/resolve.ts`**
- `Frame` gains `params: ReadonlyMap<string, Param>`.
- New exported `Param` type: `{ kind: 'value'; value: number | Text }` or
  `{ kind: 'word'; word: string }`.

**`src/lang/defs/eval.ts`**
- The program's frame starts with an empty `params`.
- `evalPieces` maps every piece through new `withParam` before resolving: a
  word naming a param becomes a value piece (number/text, with the slot name as
  its `text` for errors) or a word piece holding the caller's word.
- `evalMatch` fills `params` while binding slots: numbers and text (written or
  from a bracket) as values; `Name`/`Type` slots as words. Elements and outputs
  are unchanged. The new frame is built with these `params`.
- `runComposed` takes the frame instead of `env` + `elements`; body lines go to
  `evalStatement` untouched. `return x` with `x` a param returns what the caller
  passed (a value, or the word).
- `substitute` and `valueSource` deleted, along with the "path rooted at a Name
  slot" case (`n.from`) — dead since decision 18, as a `Name` slot is only a
  word and a body cannot see the caller's names.
- Header comment rewritten: bodies run in a frame holding their slots.

**`src/lang/defs/parser.ts`**
- `checkNames` comment no longer claims statements are re-read after names
  are filled in.

**Tests**
- New `params.test.ts`, six tests: a number passed on to a nested call; text
  passed on; a `Name` word passed on to `set`; a `Type` word passed on to
  `new`; `return x` of a number; a slot `x` leaves the name `xs` alone.
  Checked that five fail with the param lookup disabled (the sixth goes
  through `runComposed`'s own lookup).
- `resolve.test.ts`: its hand-built frame gets `params: new Map()`.
- Renamed, no logic change: `types.test.ts` "substitutes the root of a dotted
  path" → "reaches a field through a path rooted at a slot" (and two
  comments); `eval.test.ts` "substitutes slots into each body line" → "reads
  its slots in each body line".

**`LANGUAGE_DESIGN.md`**
- Decision 19's pieces section says bodies now read params too.
- The old "Built so far" note on substitution marked as replaced.

### Things worth a reviewer's eye
- A `Name`/`Type` param is turned into a word piece holding the caller's word —
  so it can also match a keyword, exactly as the rewritten text could before.
  Same behaviour, but it is the one place a word is still swapped.
- A slot named like a pattern word (a slot called `at`) would shadow that
  keyword inside the body. Also true before; no prelude definition does it.
- tsx bodies are unaffected: they still receive `env` directly.

## Step 3 — return type joins the signature

**Before.** A signature was the keywords plus slot types. Two definitions with
the same words and slot types were the same definition: a duplicate in one
file, a shadow across an import — whatever they returned.

**After.** The return type is part of the signature; returning nothing is its
own kind (no arrow). Same words with different return types are two
definitions. Resolution is unchanged: every overload that fits is kept, and
more than one is an ambiguity error. Nothing yet carries a slot's expected type
inward to pick between them — that is step 6.

**Behaviour that changes:** a file may now define the same words with
different return types; a local definition shadows only an import with the
same return type; "defined twice" errors show the return type. No prelude
definition differs only by return type, so no existing program changes.

### File by file

**`src/lang/defs/types.ts`**
- `signature` takes the definition (`pattern` and `returns`) instead of the
  pattern, and appends ` => T` when there is a return type. Comment explains
  the change and that outputs still count as a plain word.

**`src/lang/defs/modules.ts`**
- The duplicate check and the shadowing filter pass the definition to
  `signature`. No other change: the table is still a flat `Definition[]` per
  module (`own`, `exports`, `scope`).

**Tests (`modules.test.ts`)**
- Listings of signatures now include ` => T`; the prelude check also confirms
  `print «Any»` (no return) is listed without an arrow.
- Shadowing fixture: the user's `greet` now returns a Point, like the base one,
  and is told apart by placing its point at (7, 7). Previously it returned a
  Line, which under the new rule is no longer a shadow.
- New: a `greet => Line` beside an imported `greet => Point` is not a shadow —
  both are in scope and `greet x` alone is ambiguous.
- Duplicate fixture: both `twice` definitions return a Point (they returned
  Point and Line, which is now legal); the error text includes `=> Point`.
- New: the same words returning Point and Scalar load as two definitions.
- New: returning nothing and returning a Scalar are two definitions.

**Docs:** decision 11's definition of a signature notes the return type;
changelog 0.3.61; version bump.

### Things worth a reviewer's eye
- Two definitions differing only in an *output's* type and returning the same
  thing are still one signature (decision 18) — unchanged.
- The ambiguity at statement level is deliberate until step 6; standing alone,
  a line that fits two return types stays an error even after it.

## Step 4 — the fold and the restart

**Before.** A line had to match one pattern word for word, end to end. Anything
nested had to be in brackets, so `line l parallel m through p` never worked.

**After.** A line is read into a tree of calls by one search, then run:

1. From the first piece, find every pattern that matches there and fits the
   types, grouped by how many pieces it takes, longest first.
2. Take one: its pieces become a single *call* piece. Keep folding from the
   same place, so that call fills the first slot of the next pattern.
3. If a fold from the first piece leaves one call, that is the reading.
   Otherwise back off — try the next shorter match at each step.
4. If nothing from the first piece works, try from the second, third…: a fold
   there that produces a value becomes one call piece, and the line is read
   again from the start.
5. Nothing reads: report the plain error, exactly as before.

Nothing runs while reading. Types come from what each definition promises
(`=> T`); a name an output on the same line will give is typed by its `new T`.
Before running, every call in the tree must be one definition — otherwise the
line is ambiguous and nothing runs. Then the tree runs inner calls first, left
to right.

**Behaviour that changes:** chains read; `print 1 + 2` and `print greeting`
work; arithmetic folds left to right (`2 + 3 * 4` is 20); `scalar r = 2 + 3`
reads as `(scalar r = 2) + 3` and fails on the named number (step 5 fixes it).
Every line that matched whole before reads the same, since a whole-line match
is the longest match from the first piece.

### File by file

**`src/lang/defs/match.ts`**
- `Piece` gains a third kind, `call`: matches (usually one; several when
  overloads that differ by return type all fit), the text it was read from, and
  its column.
- `callTypes(call)`: the return types its matches promise.
- `isAtom`: a call piece can fill a slot.
- New `matchAt(pieces, start, defs)`: patterns matching from `start`, not
  necessarily to the end, with how many pieces each took. `matchPattern` takes a
  start and no longer insists on reaching the end; `matchStatement` checks the
  length itself, so whole-line matching is unchanged.

**`src/lang/defs/resolve.ts`**
- `typesFit` exported, and takes `given` — names an earlier call on the line
  will give, with their promised type. A word not in the store is looked up
  there.
- A call piece fits if any type it could return is compatible with the slot;
  like a value, it never fills an output, `Name` or `Type` slot.

**`src/lang/defs/read.ts`** (new)
- `readLine(pieces, store, defs)` → the root call, or null.
- `Reader.read`: from the first piece, the first fold leaving one call wins;
  else restart from each later piece, requiring the folded call to return
  something. Failed half-read states are remembered (`stateKey`: words, values,
  call return types, names given), so a failing line is not retried
  exponentially often.
- `Reader.fold`: a generator — for each fitting match at `k`, longest first,
  first the longer chains that grow from it, then the state with just it folded.
- `matchesAt`: groups fitting matches by length; skips a one-slot pattern
  applied to a call (it would wrap forever); spends one unit of a 20,000-step
  budget, past which it throws `ReadError` ("too many possible readings — add
  brackets").
- `give`: after a settled call, names its outputs promise (not `new Any`) join
  `given`.

**`src/lang/defs/eval.ts`**
- `evalPieces`: after the params swap, `readLine`. No reading → the old
  `resolveStatement` path, which throws today's error. A reading → `settled`
  (every call one definition, or `"…" is ambiguous`, before anything runs) →
  `runCall`.
- `runCall`: runs the calls in a match's slots first, left to right, turning
  each result into a value piece, then `evalMatch`.
- `evalMatch` refuses a call piece that was never run (cannot happen; a guard).

**Tests**
- New `read.test.ts`, 13 tests: chaining with a declaring form and on existing
  lines; `(line l) parallel m` with only `core` imported; an override winning
  by longest match; backing off from a Circle-only override; arithmetic left to
  right; a name given earlier on the line typed for a later slot; `print 1 + 2`;
  `print greeting`; an ordinary line untouched; the plain error for no reading;
  the plain error for a long failing line (not the budget error); ambiguity
  between return-type overloads reported before running.
- Checked by breaking things: without `given`, the same-line-name test fails;
  with shortest-first instead of longest-first, the override test fails.
- `arithmetic.test.ts`: "needs brackets" replaced by "folds left to right"
  (`(2 + 3 * 4)` is 20, `(10 - 2 - 3)` is 5) and a test pinning
  `scalar r = 2 + 3` failing on the named number until step 5.

**Docs:** `limitations.md` and `roadmap.md` no longer say arithmetic needs
brackets; `roadmap.md` no longer says same-words-different-return is rejected
(stale since step 3). Changelog 0.3.62, version bump. Decision 19 points here.

### Follow-up (same review round): highlighting and docs

**`src/lang/defs/highlight.ts`** — marks a line the way it is read. From the
start, the pattern that aligns best (met in full beats partway; then the one
taking more tokens); its slot words are marked; if it was met in full, the next
pattern must start with a slot, which the previous result fills without taking a
token; repeat. A half-typed tail is marked as far as it aligns, then marking
stops. Still words only, never types. Keywords match by what they read as, so
`=` and `+` are pattern words (they never were here before). A bracketed group
fills one slot, and its inside is marked as a line of its own.

**Tests (`highlight.test.ts`)** — `circle c on l` now marks `l` (it lines up
as `(circle c) on l` by words; types are not the highlighter's business); the
"stops where it stops aligning" case uses `circle c frobnicate l` instead. New:
chains, `=` and `+` as pattern words, marking inside brackets.

**`docs/reading.md`** (new, in the Language sidebar) — left to right, the
longest match winning (and overriding), backing off, restarting from a later
word, arithmetic left to right, brackets, ambiguous lines refused. Every example
on the page was run. Linked from `limitations.md`. Changelog 0.3.63.

### Things worth a reviewer's eye
- **Highlighting is greedy, with no backing off** — a line whose longest first
  pattern is a dead end colours less than it reads. Fine for colouring.
- **The restart only takes a fold that returns something.** A span returning
  nothing cannot stand in for words — that is what lets step 5's `=` work.
- **`given` only records settled calls.** If a call is still ambiguous, its
  outputs are not typed for the rest of the line.
- **The memo keys calls by return types, not by how they were built.** Safe
  because only failures are remembered, and whether a half-read line can still
  be read depends only on those types.
- **Timing:** a 17-piece failing arithmetic line takes ~11 ms; without the memo
  it ran out of budget.

## Step 5 — `=` returns nothing

**Before.** Every `=` in the prelude returned its subject. Under the fold,
`scalar r = 2 + 3` read as `(scalar r = 2) + 3` and failed on adding to a named
number; a user `line n = l rotated 60` would silently make `n` the same as `l`.

**After.** Every `=` returns nothing. The fold `(scalar r = 2) + 3` then has
nothing for `+` to take, so the restart reads `2 + 3` first. No change to the
reader — only to the prelude.

**Behaviour that changes:** `scalar k = 2 + 3` works without brackets;
`point p = (3, 4) on l` reads as *p is that point, and it is on l*; `a = b = c`
is refused; an `=` line can no longer stand in a slot or be `return`ed as a
statement (nothing in the prelude or tests did either).

### File by file

**`src/lang/prelude/core.til`**
- `(s: Scalar) = (v: Scalar)` and `scalar (n: new Scalar) = (v: Scalar)`: `=> Scalar`
  and `return` removed. The equality comment says why `=` gives nothing back.

**`src/lang/prelude/shapes.til`**
- `(p: Point) = (x) (y)`, `point (n: new Point) = (x) (y)`,
  `point (n: new Point) = (q: Point)`: `=> Point` and `return` removed.

**`src/lang/prelude/constraints.til`**
- `(p: Point) = (q: Point)`: `=> Point` and `return` removed.

**Tests**
- `defs.test.ts`: the list of prelude definitions with no return type gains the
  six `=` forms; its comment gives the reason.
- `arithmetic.test.ts`: the test pinning `scalar r = 2 + 3` as a failure now
  checks it is 5, and `scalar r = 2 + 3 * 4` is 20.
- `read.test.ts`, three new: `line n = l rotated 60` (with a stand-in `rotated`
  that makes a new line, and a `line … =` that names it) names the new line,
  not `l`; `point p = (3, 4) on l`; `a = b = c` refused with the plain error.
- Checked by hand: with that `line … =` returning its Line instead, `n` comes
  out as `l` — the silent wrong reading decision 19 describes.

**Docs:** `docs/reading.md` gains "`=` takes everything after it"; changelog
0.3.64; version bump.

### Things worth a reviewer's eye
- **`is` is unchanged.** `(s: Scalar) is (v: Scalar)` and `scalar n is v` still
  return their subject, so `scalar k is 2 + 3` still reads as
  `(scalar k is 2) + 3`. Whether `is` follows `=` was asked and left open.
- **There is still no `=` for lines or circles** in the prelude; the general
  `(n: Any) = (m: Any)` waits on merging and templating.

## Step 6 — the slot picks between return-type overloads

**Before.** Overloads differing only by return type could be written (step 3),
but a call that fit several stayed ambiguous wherever it was. Brackets ran
before the slot around them was known, so a group had to mean one thing on its
own.

**After.** Types flow both ways. Inside-out (step 4): a call's type is what its
definition promises. Outside-in (this step): when such a call lands in a typed
slot, only the overloads whose return fits are kept. A bracket that could be
several overloads differing only by return type is read but not run, so its slot
can pick; any other bracket still runs first, as before. An `Any` slot cannot
pick — the error asks for a name.

### File by file

**`src/lang/defs/read.ts`**
- `matchesAt` passes each fitting match through new `narrowed`: for each binding
  holding a call with several matches, in a slot that is not `Any`, keep the
  matches whose return type is compatible with the slot.

**`src/lang/defs/resolve.ts`**
- `compatible` exported for the reader.

**`src/lang/defs/eval.ts`**
- `settled` takes the slot type it is checking under. For overloads that differ
  only by return type it says `"…" is ambiguous: it could give a Line or a
  Point, and nothing around it says which`, adding `— give it a name first` in
  an `Any` slot. Types are sorted so the message does not depend on load order.
  Other ambiguity keeps the old message listing the forms.
- New `differsOnlyByReturn(matches)`: same signature with the return left out,
  and every match returns something.
- `settleGroups`: before running a group, reads it; if its root is overloads
  differing only by return type, returns that call piece unrun (text
  `(inner)`), for the outer line to narrow. Otherwise runs it as before.

**Tests**
- New `slot.test.ts` (6), with a `(m) , (k) => Line` beside the prelude's
  Point one: `line k through (1, 2) (3, 4)` takes points; `l parallel (2, 1)`
  takes the line; `l parallel 2 , 1` likewise, with no brackets;
  `point p = (2, 1)` names a point; `2 , 1` alone is ambiguous;
  `print (2, 1)` asks for a name.
- Checked by breaking it: with narrowing off, the four choosing tests fail.

**Docs:** `reading.md` — "Where it lands decides what it is" and the rewritten
"When a line can mean two things", examples run; `limitations.md` — the
"worked out from the inside alone" limitation replaced by the `Any`/`=` one;
`roadmap.md` — *Letting the slot decide* marked built, *Asking as well as
asserting* explains why asking forms stay `is …` definitions; decision 19's
open item marked built; changelog 0.3.65.

### Things worth a reviewer's eye
- **Only return-type overloads at a group's root are deferred.** A group whose
  inside is ambiguous for any other reason still errors when it is read.
- **A deferred group runs when the line around it runs**, not before. Lines
  that mixed a two-way group with a name made by an earlier group on the same
  line would see a different order; nothing in the prelude or tests does.
- **`=` does not pass a type across** — `(n: Any) = (m: Any)` needs templating.

## Step 7 — shrink the prelude

**Before.** The prelude defined seven declaring forms that only made a thing and
then said something about it. Under the fold each reads the same without its own
definition.

**After.** Deleted:

| Deleted | Now reads as | via |
|---|---|---|
| `point (n: new Point) at (x) (y)` | `(point n) at x y` | `(p: Point) at (x) (y)` |
| `circle (n: new Circle) with center (p)` | `(circle n) with center p` | `(c: Circle) with center (p)` |
| `circle (n: new Circle) with radius (r)` | `(circle n) with radius r` | `(c: Circle) with radius (r)` |
| `line (n: new Line) parallel (m)` | `(line n) parallel m` | `(a: Line) parallel (b: Line)` |
| `line (n: new Line) perpendicular (m)` | `(line n) perpendicular m` | `(a: Line) perpendicular (b: Line)` |
| `point (n: new Point) on (l: Line)` | `(point n) on l` | `(p: Point) on (l: Line)` |
| `point (n: new Point) on (c: Circle)` | `(point n) on c` | `(p: Point) on (c: Circle)` |

Kept: `line n through p q` and `circle … with center … and radius` (no subject
form covers them), `triangle`, the `=` forms (until `=` merges), and
`scalar n is v` (left alone with the rest of `is`, as asked).

**Checked before and after:** 17 programs using these forms — placements,
circles, chains, triangles, a redeclaration and an unknown name — were run
before the deletion and after, comparing constraints, solved positions and
errors. All identical except one error message (below).

### File by file

**`src/lang/prelude/shapes.til`** — `point … at`, `circle … with center`,
`circle … with radius` deleted; a comment says why the circle forms need no
definitions and the combined one does.

**`src/lang/prelude/constraints.til`** — the "Declaring forms" section (four
definitions) deleted; the header comment now explains that `line l parallel m`
reads as `(line l) parallel m`.

**`src/lang/defs/read.ts`** — new `foldFromStart`: the line after its longest
first fold, for errors only.

**`src/lang/defs/eval.ts`** — new `noReading`. The error for a line with no
reading is still the whole-line one first; but when no pattern spans the line
at all, it reports from as far as left to right got. Found by the comparison:
`point p on q` with `q` unknown had fallen back to "no definition matches"; it
now says no `on` fits `point p on q`, listing `(p: Point) on (l: Line)` and
`(p: Point) on (c: Circle)` — the same message as before, naming the general
forms instead of the deleted ones. Also improves any chained line failing
partway.

**Tests**
- Updated to name forms that still exist: `defs.test.ts` (constraints.til
  contents; the split is now 25 primitive to 13 composed),
  `modules.test.ts` (prelude has 38 definitions, not 45), `resolve.test.ts`
  and `match.test.ts` (whole-line examples use `line l through p q` and
  `p at 3 5`).
- `match.test.ts`: "every composed body line matches something" became
  "starts a reading" — `point n at x y` is now read by folding.
- `read.test.ts`: `a = b = c` now fails with "no definition of … fits"; new
  test for the `point p on q` error.

**Docs:** `reading.md` says `line l` only makes a line and the rest is said
about it; decision 19 marks the deletion done; changelog 0.3.66.

### Things worth a reviewer's eye
- **`point p at 3 4` now runs as two calls** at the top level instead of one
  call with its own frame. No difference in what is made or named — the
  comparison covered it.
- **Error messages name the general forms** (`(p: Point) on (l: Line)`) where
  they used to name declaring ones.
