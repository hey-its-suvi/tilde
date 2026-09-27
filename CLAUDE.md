# Tilde — Claude Code Instructions

## Rule 0: write it the way geometry is written

Tilde should read like a geometry text. For any syntax or design decision, the
test is: **would a geometry book say it this way?** It's easy to drift towards
how programming languages do things — check against this before adding syntax.

What that has meant in practice:

- **A program is a set of facts, not a sequence of steps.** Statement order must
  not change what a figure means.
- **`=` means "is the same as", never "now becomes".** No reassignment: a second,
  different value for a name is a contradiction. Narrowing is fine.
- **A new object gets a new name.** Rotating `l` gives `l'`, it doesn't change
  `l`. Primes are allowed in names for exactly this.
- **Words over symbols**, except where geometry itself uses the symbol (`=`,
  later `<=` for inequalities).
- **Nothing is privileged just because we wrote it.** What the language ships —
  `parallel`, `on`, shapes — should be definable by a user with the same tools.
  Only things about names and definitions themselves (`define`, `import`,
  `return`) are built in.

The full reasoning lives in `LANGUAGE_DESIGN.md`.

## Changelog rule

After every commit (or group of related commits), add an entry to `docs/changelog.md` under a new patch version and bump the version in `package.json` to match. Use patch versions liberally — we are far from 1.0 so `0.x.y` versions are cheap. Format: `## 0.x.y` with bullet points describing user-visible changes. Implementation details that don't affect language behaviour don't need entries.

## Docs sync rule

After every code change, check whether the docs need to be updated.

- If the change is small and the doc fix is obvious (wrong syntax, stale description, removed feature still listed, new feature not mentioned) — just fix it inline without asking.
- If the doc change is non-trivial (new page needed, significant restructure, design decision about how to explain something) — ask before writing.

Docs live in `docs/`. The pages are:
- `elements.md` — segment, triangle, line, point
- `constraints.md` — length, coincidence, on-line, on-segment, coming-soon stubs
- `pick.md` — pick statement and multiple solutions
- `settings.md` — set unit, set grid, coming-soon stubs
- `solver.md` — internal solver flow
- `certainty.md` — one / multiple / infinite solution states
- `changelog.md` — version history

Internal terminology (`solutions`, `one`, `infinite`, `multiple`, `free`) must not leak into user-facing docs. Docs should describe behaviour in plain geometric terms.

## General

- The language is called **Tilde** or **~tilde**. The playground is at `/playground/`, docs at `/`.
