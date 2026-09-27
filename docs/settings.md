# Settings

Settings configure the figure environment. They must appear before any geometry declarations.

---

## Unit

Sets the default unit for all length values in the program. Unitless numbers are interpreted in this unit. If omitted, the first unit used in any constraint becomes the default — or lengths stay abstract if no units appear at all.

```
set unit cm
set unit mm
set unit m
set unit in
```

Available units: `cm`, `mm`, `m`, `in`, `inches`.

Mixed units are supported — values convert automatically relative to the active unit:

```
set unit cm
segment ab = 5       # 5 cm
segment cd = 50mm    # also 5 cm internally
```

---

## Grid

Toggles the background grid.

```
set grid on
set grid off
```

Default: `on`.

---

## Subscripts

_Definition syntax only._ Draws the part of a name after `_` as a subscript, on the canvas and in printed output.

```
set subscripts on
set subscripts off
```

Default: `off`.

| Written | Shown |
|---|---|
| `t_1` | t₁ |
| `t_abc` | t<sub>abc</sub> |
| `t_1_2` | t₁,₂ |
| `l_1'` | l₁' |
| `t_1.point_2` | t₁.point₂ |

Everything after the first `_` is the subscript, and each further `_` becomes a comma. Primes come after the subscript. In a path, each part is its own name.

Unlike the settings above, this one can go anywhere in the program: it changes how the figure is shown, not what it is. Setting it both `on` and `off` is an error.

Names are always written with the underscore, whether this is on or off — `t_1` is the name, and subscripts only change how it looks. An underscore must sit between a name and its subscript: a name cannot start or end with `_`, or have two in a row, in any part of a path.

---

## Coming soon

| Setting | Syntax | Description |
|---|---|---|
| Winding | `set winding clockwise` | Default winding direction for shape construction |
| Unit angle | `set unit degrees` | Default unit for angle values |
