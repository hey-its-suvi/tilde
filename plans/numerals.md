# Plan: Numerals, and brackets as literal pattern words

Tried on its own branch, `worktree-numerals-and-brackets`, so it can be dropped
in one go. See decision 21 in `LANGUAGE_DESIGN.md` for the design and why each
piece is shaped the way it is. Ordered riskiest-first and split so the
riskiest piece — removing literal numbers' direct `Scalar` compatibility, and
making restart recurse to cover for it — lands and is fully tested in
isolation before anything about brackets changes. This exact area caused
timeouts/infinite computation in an earlier, abandoned attempt; going step by
step with the full test suite run after each one is the point.

## Status

| # | Step | State |
|---|------|-------|
| 0 | Plan written | done |
| 1 | `Numeral` type, additive: lexer exponents, the conversion definition, nothing existing changed | todo |
| 2 | Literals stop satisfying `Scalar` directly; restart recurses | todo |
| 3 | Brackets as literal pattern words: lexer `{`/`}`, header `(` lookahead | todo |
| 4 | Nesting by depth, not paired characters; span resolution is one reader pass; identity definition | todo |
| 5 | Point's bracket constructor retyped to `Numeral` | todo |
| 6 | The four Scalar interval constructors | todo |

## Steps

### 1. `Numeral`, additive

- `BUILT_IN_TYPES` gains `'Numeral'`.
- Lexer: both number-scanning branches (the plain one and the
  leading-`-` one) also consume an optional `e`/`E`, optional `+`/`-`, and
  digits, so `1.7e2` and `-1.7e2` lex as one `NUMBER` token instead of
  splitting at `e`.
- `resolve.ts`'s `typesFit`: a `NUMBER` token keeps satisfying `Scalar` or
  `Any` exactly as today, and *also* satisfies `Numeral`. No existing
  behaviour changes — this step only adds a new type nothing requires yet.
- `core.til` gains:

  ```
  define (x: Numeral) => Scalar:
      tsx`
      return { scalar: exactScalar(x) }
      `
  ```

  callable explicitly but not yet reached by anything automatically.
- Test: existing suite unchanged; new tests confirm `Numeral` is matched for
  a bare number and that the conversion definition runs and produces a
  singleton `ScalarValue`.

### 2. Literals stop satisfying `Scalar` directly; restart recurses

The flip. Two changes, landed together because neither is meaningful alone:

- `typesFit`'s `NUMBER` branch drops `Scalar` — a literal now satisfies only
  `Numeral` or `Any`.
- Restart (`read.ts`): today, on a failed full read, it tries successive
  starting words once, takes the first single longest match, substitutes,
  and re-reads from the start. Revise so that if *that* re-read also fails,
  restart runs again on the new line — scanning from word 2 again — rather
  than giving up. Terminates because each successful restart step
  permanently turns one raw `NUMBER` piece into a value piece, which can
  never be read as a bare literal again, so the count of unconverted
  literals strictly decreases every pass.

Test: the full existing suite, unchanged in behaviour but now reaching every
literal through restart — `point p at 3 4`, `scalar n is 2`, arithmetic with
multiple numbers on one line, composed bodies with several literals, nested
calls. This is the step to watch for the timeout/non-termination failure
mode; if anything hangs, the bug is here, not in a later step.

### 3. Brackets as literal pattern words

- Lexer: `{`/`}` join `PUNCT` as `LBRACE`/`RBRACE`.
- `parser.ts`'s `parsePart`: `(` opens a slot only when the next two tokens
  are `WORD COLON`; otherwise it is read as an ordinary keyword part, the
  same fallback `)`/`[`/`]` already use outside the slot and list-type
  positions.
- Test: new parser tests only — a header can now declare a pattern with a
  literal `(`, `)`, `[`, `]`, `{`, or `}` as a keyword part. Nothing in the
  prelude uses this yet, and no statement-reading behaviour changes, since
  `groupTokens` still strips `(`/`)` before matching ever sees them.

### 4. Nesting by depth; one reader pass; the identity definition

The big one for the statement-reading path.

- `tree.ts`: replace `groupTokens`'s `(`/`)`-specific stack with depth
  counting over any opener (`LPAREN`/`LBRACKET`/`LBRACE`) and any closer
  (`RPAREN`/`RBRACKET`/`RBRACE`) — a closer decrements depth regardless of
  which opener is open. The two structural errors that remain: a closer with
  depth already 0 ("closes nothing"), and depth not back to 0 at the end
  ("never closed"). A span's boundary tokens are kept as ordinary `token`
  nodes flanking its children, not discarded.
- `eval.ts`'s `settleGroups`: resolve a span by handing its full piece list —
  boundary brackets included — to the same line-reader (`readLine` plus the
  now-recursive restart) used for any top-level statement. Delete the
  `settled.length === 1` shortcut entirely.
- `core.til` (or wherever the identity's natural home turns out to be — see
  open questions) gains:

  ```
  define ( (x: Any) ) => Any:
      tsx`
      return x
      `
  ```

- Test: every existing bracketed form (`(1,2)` as a Point — still via the
  *old* Scalar-slotted definition until step 5 — `line l through (1,2)
  (3,4)`, `(2 + 3) * 4`, redundant parens `(((1,2)))`, single-name wraps
  `(p)`) against the full suite, since this is the path every bracketed
  statement in the language goes through.

### 5. Point's bracket constructor retyped

```
define ( (x: Numeral) , (y: Numeral) ) => Point:
    point pt at x y
    return pt
```

replacing the `Scalar`-slotted version — see decision 21 for why `Scalar`
slots here would always lose to the interval constructors once step 6 lands.
Test: `(1,2)` still means a Point everywhere it did before, including nested
in `through`, `=`, etc.

### 6. The four Scalar interval constructors

```
define ( (a: Numeral) , (b: Numeral) ) => Scalar:   -- open both ends
define [ (a: Numeral) , (b: Numeral) ] => Scalar:   -- closed both ends
define [ (a: Numeral) , (b: Numeral) ) => Scalar:   -- closed-open
define ( (a: Numeral) , (b: Numeral) ] => Scalar:   -- open-closed
```

Each a `tsx` body over `values/interval.ts`'s `bound`/`interval`, wrapping the
result as `{ scalar: [iv] }`; `a` past `b` for the openness given (`interval`
returns `null`) becomes `{ scalar: [] }`.

Test: each combination standalone (`scalar s = (1, 5)`, `[1, 5]`, `[1, 5)`,
`(1, 5]`), the degenerate/empty case, and — the one genuinely new ambiguity
this introduces — that a bare `(1, 5)` with no disambiguating slot still
errors asking for a name, the same way any other same-shape, different-return
overload already does.

## Open questions, not decided here

- **Where the identity definition and the `Numeral → Scalar` conversion
  actually live.** Both are `tsx`, so `core.til` by the existing rule ("tsx is
  confined to core") — but neither is really about the solver the way
  `parallel` or `declare` are. Not worth a new module for two definitions; may
  be worth one once there are more of this kind.
- **Performance.** Restart recursing, and every bracketed span going through
  a full reader pass instead of a cheap strip, both add work per statement.
  Not measured yet — revisit if it's actually a problem rather than guessing
  now.
- **Guarding `scalar s is (...)` and arithmetic against a `ScalarValue`.** Left
  out of scope per decision 21 — whatever happens today when one reaches
  those `tsx` bodies' `typeof` checks stays as it is (most likely a confusing
  crash) until a later step gives it a real "ranges aren't supported yet"
  error.
- **Wiring an interval `Scalar` into the solver's own constraints.** Not this
  plan — the solver keeps its `number[] | undefined` representation
  untouched (the earlier revert on `worktree-interval-value-layer`).
