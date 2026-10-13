# Reading a Line

_This page is about the definition syntax — the playground's `syntax: definitions`._

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

The last line reads as *make a line l parallel to m, and it passes through p* —
`through p` is said about `l`, because `l` is what `line l parallel m` gave back.
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

## Arithmetic

Arithmetic is read left to right like everything else, for now: `2 + 3 * 4` is
`(2 + 3) * 4`, which is 20. Use brackets to say otherwise.

## Brackets

Brackets say what goes together when left to right is not what you mean:

```
line l through (1, 2) (3, 4)
print 2 + (3 * 4)
```

What is inside a bracket is worked out first and stands in for it.

## When a line can mean two things

If two definitions fit the same words equally well and nothing around them says
which is meant, the line is refused rather than guessed at — and nothing it
mentions is drawn. Naming the thing first, or bracketing, settles it.
