# Types

## Point

A point is a pair of coordinates in the plane.

```ts
type Point = { x: number; y: number }
```

## Line

A line is the implicit equation `ax + by + c = 0`.

```ts
type Line = { a: number; b: number; c: number }
```

The three coefficients cover all line orientations without special-casing verticals. A few common forms:

| Equation | `a` | `b` | `c` |
|---|---|---|---|
| `y = x` | `1` | `−1` | `0` |
| `y = 2x + 1` | `2` | `−1` | `1` |
| `x = 3` | `1` | `0` | `−3` |
| `y = 4` | `0` | `1` | `−4` |

The direction vector of the line is `(−b, a)` and the normal is `(a, b)`.

### Partial declarations

When a line is declared with some parameters left open (e.g. `line l = (1,)` — slope known, intercept unknown), the missing coefficients are `null` during solving and filled in as constraints are applied or canonical defaults are chosen.
