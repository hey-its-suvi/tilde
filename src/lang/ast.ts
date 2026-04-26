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
  name: string   // line name (multi-char lowercase recommended)
  a: number      // ax + by + c = 0
  b: number
  c: number
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
  name: string           // 'abc' (explicit) or 'ABC' (named)
  named: boolean         // true if all-uppercase (named mode)
  polygonSides?: number  // only for polygon
  constraints: Constraint[]
}

export type ConstraintStmt = {
  kind: 'ConstraintStmt'
  constraint: Constraint
}

export type PrintStmt = {
  kind: 'PrintStmt'
  target: Printable
}

export type PickStmt = {
  kind: 'PickStmt'
  vertex: VertexRef
  index: number  // 1-based solution index
}

export type SettingStmt =
  | { kind: 'SetUnitLength'; unit: LengthUnit }
  | { kind: 'SetUnitAngle'; unit: AngleUnit }
  | { kind: 'SetWinding'; dir: 'clockwise' | 'counterclockwise' }
  | { kind: 'SetGrid'; on: boolean }

// ─── Constraints ─────────────────────────────────────────────────────────────

export type Constraint =
  | MeasureConstraint
  | RelationConstraint
  | EqualityConstraint
  | PointCoincidence
  | OnConstraint

/** point p on line l  |  point p on segment ab  |  p on l  |  p on ab */
export type OnConstraint = {
  kind: 'OnConstraint'
  point: string   // vertex name
  target: string  // line name or segment vertex pair — solver resolves which
}

/** ab = 5  |  angle abc = 60 */
export type MeasureConstraint = {
  kind: 'MeasureConstraint'
  target: SegmentRef | AngleRef
  value: MeasureValue
}

/** ab parallel cd  |  ab perpendicular cd */
export type RelationConstraint = {
  kind: 'RelationConstraint'
  relation: 'parallel' | 'perpendicular'
  left: SegmentRef
  right: SegmentRef
}

/** ab = cd  (same length, no numeric value) */
export type EqualityConstraint = {
  kind: 'EqualityConstraint'
  left: SegmentRef
  right: SegmentRef
}

/** a = b  (point coincidence) */
export type PointCoincidence = {
  kind: 'PointCoincidence'
  left: VertexRef
  right: VertexRef
}

// ─── References ──────────────────────────────────────────────────────────────

/** ab  |  ABC_12 */
export type SegmentRef =
  | { kind: 'ExplicitSegment'; v1: string; v2: string }
  | { kind: 'SubscriptSegment'; shape: string; i: number; j: number }

/** abc (angle at b)  |  ABC_2 (angle at 2nd vertex) */
export type AngleRef =
  | { kind: 'ExplicitAngle'; v1: string; v2: string; v3: string }
  | { kind: 'SubscriptAngle'; shape: string; i: number }

/** a  |  ABC_1 */
export type VertexRef =
  | { kind: 'ExplicitVertex'; name: string }
  | { kind: 'SubscriptVertex'; shape: string; i: number }

export type Printable = SegmentRef | AngleRef | VertexRef

// ─── Values ──────────────────────────────────────────────────────────────────

export type MeasureValue = {
  value: number
  unit: LengthUnit | AngleUnit | null  // null = use current default
}

export type LengthUnit = 'unit' | 'cm' | 'mm' | 'm' | 'in' | 'inches'
export type AngleUnit = 'degrees' | 'deg' | 'radians' | 'rad'
