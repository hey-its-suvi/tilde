# Getting Started

## What you need

Nothing to install: the <a href="/playground/">playground</a> runs in the browser. Type on
the right and the figure is drawn on the left as you go.

To run it locally, clone the repository and run:

```
npm install
npm run dev
```

The docs open on port 5173 and the playground on 5174.

## Your first figure

Every program starts by bringing in the prelude — the definitions of `point`,
`line`, `circle` and the rest:

```
import prelude
```

Then name things, and say how they relate. A right triangle with legs 3 and 4:

```
import prelude

triangle t with a b c
a at 0 0
b at 3 0
c at 0 4
```

`triangle t with a b c` makes the triangle and names its corners; the next three
lines put them in place. Leave one out — delete `c at 0 4` — and `c` is drawn
wavy: the program no longer says where it is.

Say it with lengths instead, and Tilde works out the rest:

```
import prelude

triangle t with a b c
distance between a and b is 3
distance between b and c is 4
distance between c and a is 5
```

Now `c` could be on either side of `ab`, so both places are drawn.

## Next steps

- [Elements](/elements) — points, lines, circles, segments, triangles
- [Constraints](/constraints) — everything you can say about them
- [Reading a Line](/reading) — how Tilde reads what you write
- [Solver](/solver/) — how Tilde figures out where things go
