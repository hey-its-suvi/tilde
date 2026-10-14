# Language Reference

Everything Tilde accepts. The language itself has very few words; nearly all of
what a program says comes from definitions, most of them in the prelude.

## General

- One statement per line. A line that starts at the left edge is a statement or
  the start of a definition; indented lines belong to the definition above.
- `--` starts a comment, to the end of the line.
- Names are letters, digits and `_`, may end in primes (`l'`, `A''`), and may be
  paths into a shape's parts (`t.point1`).
- Text is written in double quotes: `"hello"`.
- Numbers may be negative and have a decimal point: `-2.5`.
- Brackets group: what is inside is worked out first.
- A line is read left to right — see [Reading a Line](/reading).

---

## The language's own words

| Word | Use |
|---|---|
| `import m` | use the definitions module `m` exports |
| `export import m` | use them, and pass them on to whoever imports this file |
| `define …:` | a new definition |
| `define type T:` | a new kind of shape, made of named parts |
| `return x` | the last line of a definition: what it gives back |
| `tsx` | a definition body written in TypeScript, for what the solver does itself |

### Definitions

```
define right triangle (t: new Triangle) with legs (u: Scalar) (v: Scalar) => Triangle:
    triangle t with a b c
    a at 0 0
    b at u 0
    c at 0 v
    return t
```

The words outside brackets are the pattern; each `(name: Type)` is a slot.
`=> T` says what the definition gives back, and `return` on the last line says
which thing that is. A definition with no `=> T` gives back nothing.

| Slot type | Takes |
|---|---|
| `Point`, `Line`, `Circle`, `Scalar`, `Text`, or a `define type` | a thing of that kind, by name, by bracket, or as a number or text |
| `new T` | a new name: the definition makes something under it and hands it back |
| `Name` | a plain word, passed on as itself (a setting's name) |
| `Type` | the name of a type |
| `Any` | anything |

### Types

```
define type Triangle:
    Point point1
    Point point2
    Point point3
```

Each part is written type, then name. `new Triangle t` makes a triangle and its
parts, reached as `t.point1` and so on.

---

## The prelude

`import prelude` brings in all of these.

### Making things

```
point p                               line l
circle c                              scalar k
scalar k = 5                          scalar k is 5
point p = 3 5                         point p = (3, 5)
line l through p q
circle c with center p and radius r
triangle t with a b c
(x, y)                                a point, unnamed
```

### Saying things about them

```
p at x y                              -- position
p = q                                 -- the same point
p = x y                               -- p at (x, y)
k = 5                                 k is 5
distance between p and q is d         -- also draws the segment
p on l                                p on c
l through p
c with center p                       c with radius r
l parallel m                          l parallel m at d
l perpendicular m                     l perpendicular m at p
```

Each of these gives back what it was said about, so they chain:
`line l parallel m through p`.

### Numbers and text

```
a + b     a - b     a * b     a / b   -- on numbers written out
"a" + "b"                             -- joins text
```

### Other

```
print x                               -- shown below the figure, once solved
segment p q                           -- draws the segment
set grid on     set axes off     set origin on     set subscripts off
new Triangle t                        -- make a shape and its parts
call x n                              -- give x a second name, n
```

---

## What is not valid

- Giving a name to something when the name is already taken.
- Using a name before the line that makes it.
- A line that no definition can read — or that two can read equally well, with
  nothing to choose between them.
- Two different values for the same number, or two different places for the same
  point: these are contradictions, not changes.
