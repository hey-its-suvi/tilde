# Reading a Line

A line in Tilde is a sentence about a figure. Nothing in it is a keyword of the
language: `line`, `parallel` and `through` mean what definitions say they mean.
So reading a line means working out which definitions it is made of. Tilde does
that the way you would read it aloud — from left to right.

## Left to right

Tilde takes the longest definition that matches from the start of the line. What
that gives back becomes the subject of whatever comes next:

```
line m
point p at 1 1
line l parallel m through p
```

The last line reads as *make a line l parallel to m, and it passes through p*.
`line l` only makes a line; `parallel m` is said about the line it made, and so
is `through p`, because each gives back the line it was said about. Nothing
defines `line l parallel m` as a whole — it is `line l`, then `… parallel m`.
The same works on lines that already exist:

```
l parallel m through p
```

This is why a constraint gives back its subject: so that the next one in the
sentence is about the same thing.

## The longest match wins

If two definitions could start the line, the one that takes more of it is used.
That is how you replace a reading with your own:

```
define line (n: new Line) parallel (m: Line) => Line:
    line n
    n parallel m
    return n
```

With this in your file, `line l parallel m` uses it, rather than `line l` and
then `… parallel m`.

If the longest one does not fit — say yours takes a circle, and `m` is a line —
Tilde falls back to the next shorter reading instead of giving up.

## When the start does not lead anywhere

Sometimes no reading from the first word makes sense:

```
print 1 + 2
```

`print 1` is a complete sentence, but nothing can follow it with `+ 2`. So Tilde
tries from a later word: `1 + 2` reads, gives 3, and `print 3` is what the line
means. A definition that takes nothing is used the same way:

```
define greeting => Text:
    return "hello"

print greeting
```

A line that already reads from the start is never re-read this way.

## `=` takes everything after it

`=` gives nothing back — it states a fact rather than making something — so
nothing can follow on from it. That means whatever comes after `=` is worked out
first:

```
scalar k = 2 + 3          -- k is 5
point p = (3, 4) on l     -- p is that point, and it is on l
```

Read strictly left to right, the first would add 3 to `scalar k = 2`. Because `=`
has nothing to add to, Tilde reads `2 + 3` first instead.

One thing this rules out is `a = b = c`: neither half gives anything back, so
there is nothing to chain. Write it as two lines.

## How tightly things bind

A definition can say how tightly it holds what is next to it, with a number after
what it gives back — higher holds tighter:

```
define (a: Scalar) * (b: Scalar) => Scalar at 7:
define (a: Scalar) + (b: Scalar) => Scalar at 6:
```

Everything that says nothing is at 5. When a line could be grouped more than one
way, Tilde never reads a looser definition as sitting inside a tighter one. So
arithmetic reads as it does in any book — `2 + 3 * 4` is `2 + (3 * 4)`, which is
14 — and equal ones still go left to right: `10 - 2 - 3` is 5.

A definition matched as a whole is never split up by this. If you define
`(a) * (b) + (c) * (d)` yourself, `a * b + c * d` uses yours, because it is the
longest match.

Use brackets to say otherwise: `(2 + 3) * 4` is 20.

## Brackets

Brackets say what goes together when left to right is not what you mean:

```
line l through (1, 2) (3, 4)
print 2 + (3 * 4)
```

What is inside a bracket is worked out first and stands in for it.

## Where it lands decides what it is

Two definitions can share their words and differ only in what they give back. A
pair of numbers, say, could be a point `(x, y)` — the prelude's reading — or, if
you add one, a line in slope-intercept form `(m, k)`:

```
define (m: Scalar) , (k: Scalar) => Line:
    line l
    return l
```

Tilde does not guess between them: the place a pair lands decides.

```
line k through (1, 2) (3, 4)   -- through wants points: two points
l parallel (2, 1)              -- parallel wants a line: the line
```

## When a line can mean two things

If nothing around a thing says which it is — it stands alone, or it lands where
anything would do, like `print` — the line is refused rather than guessed at, and
nothing in it runs. Name it first (`point p = (2, 1)`), then use the name.
