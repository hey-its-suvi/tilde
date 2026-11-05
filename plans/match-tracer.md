# Plan: a match tracer in the playground

Tried on its own branch, `worktree-match-tracer`, since it is additive and
separable: nothing about how a line actually reads should change, only what
can be seen of it. Every step is one commit that keeps the tests passing.

## The problem

Matching a statement is deliberately expressive (decision 9, decision 19): a
word can belong to several definitions, the reader tries the longest match
first, backs off to a shorter one if that does not pan out, and restarts from
a later word if nothing from the first works. That is what lets `line l
parallel m through p` read the way a geometry book would say it — but it also
means a line's meaning is the result of a small search, and when that search
does something surprising there is no way to see why short of reading
`read.ts` itself.

## The design being tried

**A toolbox panel in the playground**, collapsed by default, that can hold
more than one tool over time. The first tool is a **match tracer**: type one
statement, trace it against whatever the current program has defined (the
prelude plus anything typed in the editor), and see, step by step:

- where the reader is in the line,
- how many definitions match there by shape alone,
- how many of those survive the type check,
- how many survive precedence,
- which one (if any) was kept — or that more than one was, which is what
  "ambiguous" means,
- and, when the longest match does not lead anywhere, that it backed off to a
  shorter one, or restarted from a later word.

**The reader is instrumented, not reimplemented.** A second, separate
algorithm that only approximates what `read.ts` does would drift from it and
mislead exactly when it matters most. Instead `Reader` gains an optional sink
it reports its own decisions to; with no sink, its behaviour and performance
are unchanged, so every existing test is the proof nothing moved.

**One statement at a time, not a whole program.** The tracer answers "why did
*this line* read the way it did," taken against the names already in scope.
It does not replay a multi-line program step by step — that is a different,
larger tool, left for later if it turns out to be wanted.

## Status

| # | Step | State |
|---|------|-------|
| 0 | Plan written | done |
| 1 | `Reader` reports its decisions to an optional sink; `matchesAt`'s three-stage breakdown (shape / typed / kept) | done — `27f4b59` |
| 2 | `traceStatement`; `Program`/`solveSource` expose the final `store`/`scope` | done — `7a93b4e` |
| 3 | Playground: collapsed-by-default toolbox panel; first tool is the match tracer (input + trace button + rendered steps) | done — `f01525e` |
| 4 | Changelog entry, version bump | done |
| 5 | Name the actual precedence conflict (which call, which levels), not just that there was one | done — `f8f5f89` |

## Step 1 — `read.ts`

`Reader` takes an optional fourth constructor argument, a `sink?: (e: TraceEvent) => void`, threaded in from `readLine`'s new optional fourth parameter. `foldFromStart` (used only to build error messages) does not take one — nothing needs to trace an error path twice.

`matchesAt` used to build `byLength: Map<number, Match[]>`, keeping only matches that survived `typesFit` and `levelsFit`. It now builds `Map<number, Breakdown>`, where a `Breakdown` is `{ length, shape: Match[], typed: Match[], kept: Match[] }` — every definition matching that spot by shape, the ones among those whose types fit, and the ones among *those* precedence still allows. The method's return value is unchanged (`kept`, filtered to non-empty groups); the full breakdown is only ever handed to `sink`, once per call, as a `candidates` event carrying the spot's `Piece` and its groups, longest length first.

The restart loop (trying a single match from word 2, then 3, …) reports a `restart` event naming the word it is about to try, before calling `once`.

No existing test changed; the whole suite (369 tests, now 374 with step 2's) stayed green throughout, since nothing changes with no sink attached.

## Step 2 — `trace.ts`, and exposing a program's final state

`Program` (and so `solveSource`'s return) gained two read-only fields: `store` (the `Store` evaluation ended with — every element declared, by the time the last statement ran) and `scope` (the entry module's own definitions — what a further top-level statement reads against). Both come straight out of `run()`'s existing `ctx` and `units`; nothing new is computed.

`eval.ts` exports two functions that were already there, unchanged: `noReading` (why a line failed to read, used to build its error message) and `settled` (checks a read call tree has exactly one definition per call, throwing the same ambiguity error evaluation throws). `trace.ts` reuses both rather than re-deriving "why didn't this work" in a second way that could drift from the first.

`traceStatement(statement, store, defs)`:
1. Refuses outright if the statement has brackets — `(`/`)` content is *run*, not matched (decision 19), and a trace that didn't actually run it would be guessing. Outcome `has-brackets`.
2. Otherwise calls `readLine` with a sink that turns every `TraceEvent` into a `TraceStep` (`look`, with each group's three stages rendered via `form`; or `restart`).
3. No reading → outcome `no-reading`, message from `noReading`.
4. A reading, but `settled` throws → outcome `ambiguous`, its message.
5. A reading that settles → outcome `read`, with the call tree flattened to one line per call, inner calls before the calls holding them (the order the reader built them in).

Tested against the real prelude (`src/tests/trace.test.ts`): a two-fold read with an overriding definition chosen by length; a restart (`print 1 + 2` — `print 1` is complete, so nothing from the first word spans the line, and the reader restarts from `1`); no reading; two same-shape, different-return overloads producing `ambiguous`; and the bracket refusal.

## Step 3 — the playground panel

`index.html`: a `.toolbox` panel, `hidden` by default, absolutely positioned over the right side of the canvas pane (not the editor pane — a trace can run long, and the canvas is the wider of the two). A "tools" button joins "reset" in the editor toolbar; a "×" in the panel's own header closes it. Inside, for now, one tool: a text input, a "Trace" button, and an output area styled like the console (dark, monospace).

`main.ts`: `compile()` now keeps the last program's `store`/`scope` (from `solveSource`, which passes through what step 2 added to `Program`) in two module-level variables — stale after a broken edit, rather than gone, so the tracer still has something to trace against. The trace button (and Enter in the input) calls `traceStatement` and renders its `Trace` as plain lines: one per step (`N. at "<spot>"` then each length group's shape/typed/kept forms, or `↻ … restart`), then the outcome — a `reads as:` list, or the failure message. Built with `textContent`, never `innerHTML`, on the same reasoning the console already uses: nothing a user types should ever be read as markup.

Verified: `vite build` bundles the playground clean; the dev server serves the new markup and script without a transform error, and the DOM ids in `main.ts` match `index.html` exactly. `traceStatement` run directly (a throwaway script, not kept) against the playground's own default program confirmed a real multi-group fold-then-match success and a real "no reading" failure both render sensibly. Browser automation (click-through, screenshot) wasn't available in this environment — no `chromium-cli`, no Playwright installed, and installing one just to self-check felt like the wrong tradeoff for a worktree-scoped feature. Worth a manual look in a real browser before merging.

## Step 4 — changelog

`docs/changelog.md`: new `0.3.73` entry. `package.json` version bumped to match.

## Step 5 — naming the precedence conflict

Trying it out surfaced a real gap: when a group fit the types but lost on precedence, the trace just said "fits the types, but not the precedence here" — true, but not an explanation. `1 + 2 * 3` is exactly the case that matters: `+` folds "1 + 2" first (the only shape at word 1); trying to extend with `*` fits the types (the call returns a Scalar) but `levelsFit` throws it out, because `+`'s level (6) is looser than what `*`'s open slot needs (7) — and the old message didn't say any of that.

`levelsFit` now returns `{ match: Match | null; conflict?: LevelConflict }` instead of a bare `Match | null`. On the rejection path it already had (`fitting.length === 0`), it also picks out the first inner match that lost the facing-edge check and reports its form, its level, the outer definition's level, and which slot/edge was contested. `Breakdown` gained a fourth array, `conflicts`, collected in `matchesAt` alongside `shape`/`typed`/`kept`. `trace.ts` passes it straight through; the playground's renderer uses it only when a group has `typed` but no `kept`, naming the actual call and the actual numbers instead of gesturing at "precedence."

New test in `trace.test.ts` pins the exact conflict shape for `1 + 2 * 3`. Checked by hand (throwaway script, not kept) that the rendered playground text now reads:

```
2. at "1 + 2"
   3 words:  (a: Scalar) * (b: Scalar)  — fits the types, but not taken here:
     "(a: Scalar) + (b: Scalar)" is level 6; this slot needs at least level 7 (as tight, or tighter) — 6 is looser, so it's left as its own call
```
