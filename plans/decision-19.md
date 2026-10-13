# Build plan: decision 19 — reading a line

The design is decision 19 in `LANGUAGE_DESIGN.md`. This file is the build: the
steps, in order, and for each finished step what changed file by file and why.
Each step is one commit, keeps every test passing, and is reviewed before the
next starts.

| # | Step | Status |
|---|------|--------|
| 1 | A bracket's result stays a value, never text | done — `7c3f240` |
| 2 | Remove `substitute`: a call's frame holds its values | done — see below |
| 3 | Return type joins the signature; every fitting overload kept, exactly one must remain | next |
| 4 | The fold and the restart (one search) | |
| 5 | `=` returns nothing | |
| 6 | The slot picks between return-type overloads; `Any` slots error | |
| 7 | Shrink the prelude: delete the "make it, then say this about it" forms | |

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

**After.** `signature()` includes the return type (none counts as its own
kind). `(x: Scalar) , (y: Scalar) => Point` and `… => Line` are two
definitions. Duplicate checks and shadowing (`modules.ts`) use the full
signature, so a local `=> Point` shadows only the imported `=> Point`.
Resolution keeps every overload that fits; more than one is an ambiguity
error, as today. No prelude definition differs only by return type, so no
program changes.

**Planned changes:** `types.ts` (`signature`), `modules.ts` (duplicate check,
shadowing), tests in `modules.test.ts` / `types.test.ts` with a small fixture
table.

## Step 4 — the fold and the restart

**After.** A line is read by one search:
1. Start at the first word.
2. Fold left to right: the longest pattern that matches from the start; its
   result goes into the first slot of the next pattern (patterns that begin
   with a slot); repeat. If the longest match fails its types, or the rest of
   the line cannot continue from it, back off to the next shorter one.
3. If the fold from the first word uses up the line, that is the reading.
4. Otherwise start at the next word: whatever folds into a value there replaces
   those words as a value piece, and reading starts again from the first word.
5. If nothing works, the error is the one from the plain left-to-right attempt.

Readings are type-checked before anything runs, using declared `=> T` return
types; a name a call gives (an output, `new T`) is typed for the rest of the
line. Then the chosen reading runs, inner calls first.

**Planned changes:** a new `read.ts` (the search) beside `match.ts`;
`resolve.ts` keeps per-pattern type fitting; `eval.ts` runs a reading tree
instead of one match. `matchStatement` probably becomes "patterns matching a
prefix of these pieces".

**Tests to add:** `line l parallel m through p`; `l parallel m through p`;
`(line l) parallel m` read without brackets once declaring forms are absent
(fixture table); a user override `line (l: new Line) parallel (m: Line)` winning
by longest match; backing off from a Circle-only override; `print greeting`
for a no-argument definition; `print 1 + 2`; `1 + 2 * 3` is 9; every existing
test unchanged.

## Step 5 — `=` returns nothing

**After.** The prelude's `=` definitions stop returning a value:
`(s: Scalar) = (v: Scalar)`, `(p: Point) = (q: Point)`, `(p: Point) = (x) (y)`,
and the declaring `point … =` / `scalar … =` forms. The restart then reads
`scalar k = 2 + 3` and `line n = l rotated 60` as meant.

**Planned changes:** `core.til`, `shapes.til`, `constraints.til`; any body that
relied on `=` handing something back (`return` after an `=` line) adjusted.

**Tests to add:** `scalar k = 2 + 3`; `line n = l rotated 60` with a fixture
`rotated`; `a = b = c` is an error; `point p = (3, 4) on l`.

## Step 6 — the slot picks between return-type overloads

**After.** When a value piece or a restart span could be produced by several
overloads differing only in return type, the slot it lands in decides. An
`Any` slot cannot decide: an error asking for the value to be named first.
`=` stays on that error until templating exists.

**Planned changes:** the search in `read.ts` carries the expected slot type
into a group or span before it is settled. Brackets go through the same path,
so `(2, 1)` with Point and Line overloads becomes possible.

**Tests to add:** fixture `(x) , (y) => Point` and `=> Line`;
`line l through (1,2) (3,4)` picks Point; a Line slot picks Line; `2 , 1` alone
is ambiguous; `print (2, 1)` asks for a name.

## Step 7 — shrink the prelude

**After.** Delete the forms that only mean "make it, then say this about it",
now read as composition: `point … at`, `point … on` (Line and Circle),
`circle … with center`, `circle … with radius`, `line … parallel`,
`line … perpendicular`, `scalar … is`. Keep `line n through p q`,
`circle … with center … and radius`, `triangle`, and the `=` forms until `=`
merges.

**Planned changes:** `shapes.til`, `constraints.til`, `core.til`; the
tsx/composed ratio test in `defs.test.ts`; `docs/` pages that list the forms.

**Tests:** every program using a deleted form still reads and solves the same.
