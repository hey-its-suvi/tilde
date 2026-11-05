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
| 1 | `Reader` reports its decisions to an optional sink; `matchesAt`'s three-stage breakdown (shape / typed / leveled) exported as a pure, reusable piece | pending |
| 2 | `traceStatement`: runs a statement through the instrumented reader and turns the sink's events into a flat list of steps plus a final outcome (read call tree, or the same "no reading" diagnosis `eval.ts` already gives) | pending |
| 3 | Playground: collapsed-by-default toolbox panel; first tool is the match tracer (input + trace button + rendered steps) | pending |
| 4 | Changelog entry | pending |

Each step below is written up once it lands.
