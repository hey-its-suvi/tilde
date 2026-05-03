// ─── Tilde AST ───────────────────────────────────────────────────────────────
// Every node has a `kind` discriminant for exhaustive pattern matching.

export type Program = {
  kind: 'Program'
  statements: Statement[]
}

// ─── Statements ──────────────────────────────────────────────────────────────

export type Statement =
  | ShapeDecl
  | LineDecl
  | PointDecl
  | ConstraintStmt
  | PrintStmt
  | SettingStmt
  | PickStmt

export type LineDecl = {
  kind: 'LineDecl'
  name: string
  a: number | null      // ax + by + c = 0; null = unknown (partial line)
  b: number | null
  c: number | null
  constraints: Constraint[]  // from `through p and q` — stored as OnConstraints
}

export type PointDecl = {
  kind: 'PointDecl'
  name: string
  x: number | null  // null = bare declaration, no coordinates
  y: number | null
}

export type ShapeKind = 'triangle' | 'square' | 'rectangle' | 'segment' | 'polygon'

export type ShapeDecl = {
  kind: 'ShapeDecl'
  shapeKind: ShapeKind
  name: string           // declaration label — not a ref
  named: boolean         // true = subscript mode
  polygonSides?: number
  constraints: Constraint[]
}

export type ConstraintStmt = {
  kind: 'ConstraintStmt'
  constraint: Constraint
}

export type PrintStmt = {
  kind: 'PrintStmt'
  target: Ref
  angle: boolean  // true if `print angle ...` — signals angle measurement
}

export type PickStmt = {
  kind: 'PickStmt'
  vertex: Ref
  index: number  // 1-based solution index
}

export type SettingStmt =
  | { kind: 'SetUnitLength'; unit: LengthUnit }
  | { kind: 'SetUnitAngle'; unit: AngleUnit }
  | { kind: 'SetWinding'; dir: 'clockwise' | 'counterclockwise' }
  | { kind: 'SetGrid'; on: boolean }

// ─── Refs ─────────────────────────────────────────────────────────────────────
// The parser never knows the semantic type of a name — that's the solver's job.
// SubscriptRef is the only structurally distinct form (t_1, t_1_2).

/** A plain name — solver resolves what entity it refers to */
export type NameRef = { kind: 'NameRef'; name: string }

/** A subscript reference — structurally unambiguous due to _ separator
 *  indices.length === 1  →  vertex (t_1) or angle vertex (angle t_2)
 *  indices.length === 2  →  segment (t_1_2)
 */
export type SubscriptRef = { kind: 'SubscriptRef'; shape: string; indices: number[] }

export type Ref = NameRef | SubscriptRef

// ─── Constraints ─────────────────────────────────────────────────────────────

export type Constraint =
  | LengthConstraint
  | AngleConstraint
  | RelationConstraint
  | EqualityConstraint
  | OnConstraint
  | PositionConstraint

/** ab = 5  |  t_1_2 = 5 */
export type LengthConstraint = {
  kind: 'LengthConstraint'
  target: Ref
  value: MeasureValue
}

/** angle abc = 60  |  angle t_2 = 60 */
export type AngleConstraint = {
  kind: 'AngleConstraint'
  target: Ref
  value: MeasureValue
}

/** ab parallel cd  |  ab perpendicular cd */
export type RelationConstraint = {
  kind: 'RelationConstraint'
  relation: 'parallel' | 'perpendicular'
  left: Ref
  right: Ref
}

/** ab = cd  (equal length)  |  a = b  (coincidence)  — solver resolves which */
export type EqualityConstraint = {
  kind: 'EqualityConstraint'
  left: Ref
  right: Ref
}

/** a = (1, 2)  — place vertex at exact coordinates */
export type PositionConstraint = {
  kind: 'PositionConstraint'
  vertex: Ref
  x: number
  y: number
}

/** point p on line l  |  p on ab  |  p on t_1_2  |  p on l and m */
export type OnConstraint = {
  kind: 'OnConstraint'
  point: Ref
  targets: Ref[]
}

// ─── Values ──────────────────────────────────────────────────────────────────

export type MeasureValue = {
  value: number
  unit: LengthUnit | AngleUnit | null  // null = use current default
}

export type LengthUnit = 'unit' | 'cm' | 'mm' | 'm' | 'in' | 'inches'
export type AngleUnit = 'degrees' | 'deg' | 'radians' | 'rad'
