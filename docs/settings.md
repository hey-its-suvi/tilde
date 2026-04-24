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

## Coming soon

| Setting | Syntax | Description |
|---|---|---|
| Winding | `set winding clockwise` | Default winding direction for shape construction |
| Unit angle | `set unit degrees` | Default unit for angle values |
