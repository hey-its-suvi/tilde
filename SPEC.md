# Tilde Language Specification
> Version 0.1 — Draft

---

## 1. Overview

Tilde is a declarative language for describing and solving geometric figures. Programs describe shapes and constraints; the runtime solves for unknown quantities and renders a live visual.

File extension: `.tilde`

---

## 2. Lexical Structure

### 2.1 Comments
```
# this is a comment
```

### 2.2 Whitespace
Spaces and tabs are ignored except as token separators. Newlines end statements.

### 2.3 Tokens

| Token type   | Pattern                   | Examples           |
|--------------|---------------------------|--------------------|
| UPPER_NAME   | `[A-Z][A-Z0-9]*`          | `ABC`, `RED`, `T1` |
| LOWER_NAME   | `[a-z][a-z0-9]*`          | `abc`, `red`       |
| SUBSCRIPT    | `UPPER_NAME _ NUMBER`     | `ABC_1`, `RED_12`  |
| NUMBER       | `[0-9]+(\.[0-9]+)?`       | `5`, `3.14`        |
| UNIT_SUFFIX  | attached to NUMBER        | `5cm`, `3.14mm`    |
| KEYWORD      | reserved words (see §2.4) | `triangle`, `print`|
| OPERATOR     | `=`                       |                    |

### 2.4 Keywords
```
triangle  square  rectangle  segment  polygon
parallel  perpendicular
angle
print
set
with  and
clockwise  counterclockwise
unit  length  anchor  winding  degrees  radians
```

`unit`, `length`, `anchor`, `winding`, `degrees`, `radians`, `clockwise`, `counterclockwise` are only valid as arguments to `set`. They are reserved but not standalone statements.

---

## 3. Naming Conventions

### 3.1 Explicit vertex mode (lowercase)
A lowercase name is interpreted as a sequence of individual vertex labels.

```
triangle abc    # vertices: a, b, c
line pq         # vertices: p, q
```

Each character is a distinct vertex. Must be all lowercase. Length is validated against shape type — a triangle name must be exactly 3 chars, square/rectangle 4, line 2.

### 3.2 Named shape mode (uppercase)
An uppercase name declares a named shape. Vertices are auto-generated with subscripts.

```
triangle ABC    # shape named ABC, vertices: ABC_1, ABC_2, ABC_3
square RED      # shape named RED, vertices: RED_1, RED_2, RED_3, RED_4
line L          # shape named L,   vertices: L_1, L_2
```

Mixed case (e.g. `Triangle Abc`) is a parse error (`CasingError`).

### 3.3 Subscript notation
`NAME_N` refers to the Nth vertex of a named shape. `NAME_NM` refers to the side between vertex N and vertex M.

```
ABC_1       # 1st vertex of ABC
ABC_12      # side from vertex 1 to vertex 2 of ABC
```

In output and canvas labels, underscore renders as subscript: ABC₁, ABC₁₂.

---

## 4. Grammar (EBNF)

```ebnf
program         := statement* EOF

statement       := shape_decl
                 | constraint_stmt
                 | print_stmt
                 | setting_stmt
                 | comment

(* Shape declarations *)
shape_decl      := shape_kw shape_name ("with" constraint_list)?
shape_kw        := "triangle" | "square" | "rectangle" | "line" | "polygon" NUMBER
shape_name      := UPPER_NAME | LOWER_NAME

(* Constraints *)
constraint_stmt := constraint
constraint_list := constraint ("and" constraint)*

constraint      := measure_constraint
                 | relation_constraint
                 | equality_constraint
                 | point_coincidence

measure_constraint  := segment "=" measure_value
                     | "angle" angle_ref "=" measure_value

relation_constraint := segment "parallel" segment
                     | segment "perpendicular" segment

equality_constraint := segment "=" segment     (* same length, no numeric value *)

point_coincidence   := vertex "=" vertex        (* two vertices are the same point *)

(* References *)
segment         := LOWER_NAME LOWER_NAME              (* e.g. ab — exactly 2 chars *)
                 | UPPER_NAME "_" NUMBER NUMBER        (* e.g. ABC_12 *)

angle_ref       := LOWER_NAME LOWER_NAME LOWER_NAME   (* abc = angle at b, exactly 3 chars *)
                 | UPPER_NAME "_" NUMBER               (* ABC_2 = angle at 2nd vertex *)

vertex          := LOWER_NAME                          (* single char, e.g. a *)
                 | UPPER_NAME "_" NUMBER               (* e.g. ABC_1 *)

(* Values *)
measure_value   := NUMBER unit_suffix?
unit_suffix     := "cm" | "mm" | "m" | "in" | "inches" | "deg" | "rad"

(* Output *)
print_stmt      := "print" printable
printable       := segment | angle_ref | vertex | UPPER_NAME | LOWER_NAME

(* Settings *)
setting_stmt    := "set" setting

setting         := "unit" "length" length_unit
                 | "unit" "angle" angle_unit
                 | "anchor" vertex
                 | "winding" ("clockwise" | "counterclockwise")

length_unit     := "unit" | "cm" | "mm" | "m" | "in" | "inches"
angle_unit      := "degrees" | "radians"
```

---

## 5. Types

Tilde is strongly typed. Types are fully inferred — no annotations needed.

| Type     | What it is              | Produced by                  |
|----------|-------------------------|------------------------------|
| `Length` | distance measurement    | segment ref, numeric + unit  |
| `Angle`  | angle measurement       | `angle` ref, numeric + `deg`/`rad` |
| `Point`  | a geometric vertex      | single vertex ref            |

Type mismatches are errors:
```
angle abc = ab    # TypeError: Angle ≠ Length
a = 5             # TypeError: Point ≠ Length
```

Angles are in degrees by default. Use `rad` suffix for radians: `angle abc = 1.57rad`

---

## 6. Semantics

### 6.1 Vertex namespace
All vertex labels are global. If vertex `a` appears in two shape declarations, it refers to the same geometric point. This is how shared sides work automatically:

```
triangle abc
square abxy   # a and b are the same points — side ab is shared, length inherited
```

### 6.2 Constraint solving
The runtime maintains a constraint graph. Each constraint reduces the degrees of freedom (DOF) of the system.

- A triangle in 2D has 6 DOF (3 points × 2 coordinates).
- Fixing the anchor removes 2 DOF (position). Default winding removes 1 (rotation).
- Each independent geometric constraint removes 1 DOF.
- A fully constrained triangle needs 3 constraints (SSS, SAS, ASA, AAS, etc.).

If **underconstrained**: a representative valid configuration is shown with squiggly rendering on the canvas. Unconstrained quantities show as `~` prefixed in hover measurements.

If **overconstrained** (contradictory): a `ConstraintError` is reported.

### 6.3 Units
All values stored internally in abstract units. Unit suffixes convert at parse time.
`print` outputs in the current default unit unless an explicit suffix was given on the original value.

Defaults:
- Length: `unit` (dimensionless)
- Angle: `degrees`

```
set unit length cm
set unit angle radians
```

Explicit suffixes (`5cm`, `90deg`, `1.5rad`) always override the current default.

### 6.4 Winding
Vertex order implies winding direction. Default: counterclockwise.
```
set winding clockwise
```

### 6.5 Anchor
The anchor is fixed at the canvas origin. Default: first defined vertex.
```
set anchor b       # fixes b at origin
set anchor ABC_2   # fixes ABC_2 at origin
```

---

## 7. Examples

### Basic triangle solve
```
triangle abc with ab = 5 and angle abc = 60 and angle bca = 45
print angle bac
print ac
print bc
```

### Shared side
```
triangle abc with ab = 4 and angle abc = 90
square abxy
print xy        # equals 4 (inherited from ab)
```

### Named shapes
```
triangle RED with RED_12 = 6 and angle RED_2 = 45 and angle RED_3 = 60
print angle RED_1
print RED_13
```

### Parallel lines
```
line ab with ab = 10
line cd with cd parallel ab and ac = 3
print cd        # equals 10
```

### Units
```
set unit length cm
set unit angle degrees
triangle abc with ab = 5 and angle abc = 60 and angle bac = 45
print ac
print bc
```

### Standalone constraints
```
triangle abc
ab = 5
angle abc = 60
angle bca = 45
print angle bac
```

---

## 8. Errors

| Error                  | Meaning                                                   |
|------------------------|-----------------------------------------------------------|
| `ParseError`           | Invalid syntax                                            |
| `CasingError`          | Mixed case in shape name                                  |
| `NameError`            | Unknown vertex or shape reference                         |
| `TypeError`            | Incompatible types (e.g. Angle assigned to Length)        |
| `ConstraintError`      | Overconstrained — contradictory constraints               |
| `UnderconstrainedError`| `print` called on a quantity not yet solvable             |
| `ShapeSizeError`       | Wrong number of vertices for shape type                   |

---

## 9. Shape Layer (future)

A higher-level layer above the GeomModel that tracks which vertices/segments belong to which named shape declaration. Enables:
- **Code↔canvas highlighting**: hover on `triangle abc` in the editor → canvas highlights sides ab, bc, ca and vertices a, b, c
- **Shape-level error reporting**: "triangle ABC is underconstrained" rather than just "point ABC_2 is unknown"
- References the global GeomModel — does not duplicate data, just maps shape names to sets of vertex/segment keys

Not needed for the solver. Build after the core pipeline works.

## 10. Reserved for Future

- `as ... from ... to ...` — parametric sweep / animation
- `circle`, `ellipse` shape types
- `intersect` — intersection points of two shapes
- Shorthand operators: `||` for parallel, `⊥` for perpendicular
- `import` — include another `.tilde` file
- Functions and variables for computed values
- Drawing tools → code generation (bidirectional canvas)
