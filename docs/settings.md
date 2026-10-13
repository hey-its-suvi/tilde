# Settings

Settings change how the figure is shown, not what it is. Each is on or off, and
can go anywhere in the program. Saying a setting twice the same way is fine;
setting it both `on` and `off` is an error.

---

## Grid

Toggles the faint background lines at every whole unit.

```
set grid on
set grid off
```

Default: `on`.

---

## Axes

Toggles the x and y axes, separately from the grid.

```
set axes on
set axes off
```

Default: `on`.

---

## Origin

Marks the point (0, 0) with a dot, labelled O.

```
set origin on
set origin off
```

Default: `off`.

---

## Subscripts

Draws the part of a name after `_` as a subscript, on the canvas and in printed
output.

```
set subscripts off
set subscripts on
```

Default: `on`.

| Written | Shown |
|---|---|
| `t_1` | t₁ |
| `t_abc` | t<sub>abc</sub> |
| `t_1_2` | t₁,₂ |
| `l_1'` | l₁' |
| `t_1.point_2` | t₁.point₂ |

Everything after the first `_` is the subscript, and each further `_` becomes a
comma. Primes come after the subscript. In a path, each part is its own name.

Names are always written with the underscore, whether this is on or off — `t_1`
is the name, and subscripts only change how it looks. An underscore must sit
between a name and its subscript: a name cannot start or end with `_`, or have
two in a row, in any part of a path.

---

## Coming back

Units (`set unit cm`, `set unit degrees`) and winding (`set winding clockwise`)
take a value rather than on or off, and went with Tilde's older syntax. They are
on the [roadmap](/roadmap#to-bring-back-from-the-classic-syntax).
