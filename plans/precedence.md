# Plan: precedence per definition (option B)

Tried on its own branch, `precedence`, so it can be dropped in one go if it
turns out badly. Every step is one commit that keeps the tests passing.

## The design being tried

**Words have no precedence; definitions do.** Each definition may declare a
number — how tightly it holds what is next to it. Higher holds tighter. A
definition that declares none gets the default.

**The reader is unchanged.** It still reads left to right: from the first word,
the longest pattern that matches; its result fills the first slot of what comes
next; backing off when that fails; restarting from a later word when nothing
from the first works (decision 19).

**One new check.** Each time the reader would put a call, unbracketed, into
another call's slot at an edge of the outer pattern, the inner call's number
must be at least the outer one's. Equal numbers are allowed only in the outer
pattern's first slot — that is what keeps chains reading left to right. A
grouping that breaks this is thrown away, and the reader tries its next one.
Brackets written by hand are never checked.

The check only ever bites at a pattern's first and last slots: a slot with
words on both sides (`(a) parallel (b) at (d)`) is fenced in, and nothing can be
fought over there.

```
1 + 2 * 3          (+ is 6, * is 7)

  (1 + 2) * 3   →  + (6) inside * (7)          thrown away
  1 + (2 * 3)   →  * (7) inside + (6)  ✓       used: 7

line n = l rotated 60          (line (n) = (m) is 1, rotated is 5)

  (line n = l) rotated 60   →  1 inside 5      thrown away
  line n = (l rotated 60)   →  5 inside 1  ✓   used

a * b + c * d      with a user's (a) * (b) + (c) * (d)

  the longest match from the start is the user's whole definition:
  one call, nothing nested inside it at an edge, nothing to check   used
```

## Why this and not the others

| Option | Why not |
|---|---|
| Levels on words, the line split before matching | The split happens before any definition is chosen, so a word with a level overrides every definition using it: a user's `(a) * (b) + (c) * (d)` never sees `a * b + c * d`. Makes those words special — against Rule 0. |
| Operators only (patterns starting and ending with a slot) | Shuts out `line (n: new Line) = (m: Line)`, which starts with a word. |
| Splitting, tried rather than forced | Fixes most shapes, but the case above remains whenever both readings work. |

## Known costs, to watch for

- Two definitions with the same words can declare different numbers, so a line
  may group differently depending on which one the types pick.
- A definition that should be loose but declares nothing gets the default. Safe
  for `=` while `=` returns nothing — the wrong grouping fails anyway and the
  restart finds the right one.
- `p on l through q` stops reading as `p on (l through q)`: equal numbers are
  refused in a last slot. Arguably better — that reading added a constraint on
  `l` in the middle of a sentence about `p`.
- `2 + 3 * 4` becomes 14, not 20; the test and docs that pin left-to-right
  arithmetic change.
- Unanticipated ones — the reason for the branch.

## Decided

1. **The number trails the return type:** `define (a: Scalar) + (b: Scalar) =>
   Scalar at 6:`. Nothing can follow `=> T`, so `at 6` there is never part of
   the pattern — unlike `at` before the arrow, as in `(a) parallel (b) at (d)`.
   A definition that gives back nothing writes `=> Null` to have somewhere to
   put it: `define (a: Any) = (b: Any) => Null at 1:`. `=> Null` means exactly
   what no arrow means.
   Considered: `binds 6` (fine, but `at` was preferred); a number first,
   `define at 6 …` (needs numbers banned from patterns, since any token can be a
   pattern word today); `define [at 6] …` (a symbol).
2. **The default is 5.** A definition that declares nothing gets it — including
   a user's arithmetic-like pattern, which then cannot sit unbracketed in an
   arithmetic slot until it declares a number.
3. **`a = b = c` chains**, meaning a = b and b = c. Still open: whether `=` hands
   back its left side or its right. For `=` either works, since equality is
   transitive; for `<` later only the right side reads the maths way
   (a < b < c is a < b and b < c).

## Steps

Each is small and separable; dropping the branch removes them all.

1. **A number on a definition.** The parser reads it; `Definition` carries
   `level` (default when absent). No behaviour change. Tests: parsing,
   default, refusal of a malformed number.
2. **The check in the reader.** One function, applied where the reader places a
   call in a slot (`matchesAt` in `read.ts`), comparing levels at the edges.
   No prelude definition declares a level yet, so nothing changes. Tests with a
   fixture table: `1 + 2 * 3`, `(a * b + c) * d` refused, equal levels allowed
   in the first slot and refused in the last, a user's four-slot pattern
   winning, brackets never checked.
3. **Arithmetic gets its numbers.** `* /` at 7, `+ -` at 6 in `core.til`. Tests:
   `2 + 3 * 4` is 14, `10 - 2 - 3` still 5, `print 1 + 2 * 3`. Update the
   left-to-right arithmetic test, `reading.md`, `limitations.md`, `roadmap.md`,
   decision 19's interim note, changelog.
4. **`=` gets its number** (only if wanted, per question 3). `=` definitions at 1;
   whether `=` keeps returning nothing or hands back its right side.

## Status

| Step | Status |
|---|---|
| 1 | done — see below |
| 2 | |
| 3 | |
| 4 | waiting on which side `=` hands back |

---

## Step 1 — a number on a definition

**After.** `Definition` carries `level`. The header parser reads `at N` after
the return type, and turns `=> Null` into "returns nothing". Nothing reads the
level yet, so no line reads differently.

**`src/lang/defs/types.ts`** — `level` on `Definition`; `DEFAULT_LEVEL` (5);
`NULL` (the written name for returning nothing).

**`src/lang/defs/parser.ts`** — `parseHeader` returns `level`. After the return
type: `=> Null` becomes `returns: null`; `at` followed by a number sets the
level; anything else before `:` is the existing "expected ':'" error. The
definition is built with its level.

**Tests (`defs.test.ts`, 8 new)** — the default; `=> Scalar at 6`; `=> Null at
1`; `=> Null` alone is the same as no arrow; `at` before the arrow stays a
pattern word; a non-number after `at`; anything after the level; a `=> Null`
definition with a `return` line refused.

**Not changed:** `Null` is not a type a slot can take — it is only ever turned
into "returns nothing" at the arrow, so `(x: Null)` is still "no type called
Null".
