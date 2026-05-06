// ─── Tilde AST ───────────────────────────────────────────────────────────────
// Every node has a `kind` discriminant for exhaustive pattern matching.

import type { Point, Line, Nullable } from './solver/interface.js'

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

/** Element declaration — declares a named geometric primitive with optional params.
 *  Constraints that appear as inline sugar (e.g. `through`, `perpendicular`)
 *  are expanded by the parser into separate ConstraintStmts. */
export type ElementDecl<K extends string, T> = {
  kind: K
  name: string
  params: Nullable<T>
}

export type LineDecl = ElementDecl<'LineDecl', Line>
export type PointDecl = ElementDecl<'PointDecl', Point>

export type ShapeKind = 'triangle' | 'square' | 'rectangle' | 'segment' | 'polygon'

export type ShapeDecl = {
  kind: 'ShapeDecl'
  shapeKind: ShapeKind
  name: string           // declaration label — not a ref
  named: boolean         // true = subscript mode
  polygonSides?: number
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

/** An inline numeric tuple — e.g. (1, 2) or (1, -1, 0).
 *  The optional hint keyword (point/line/circle) disambiguates when
 *  the tuple length is ambiguous for the context. */
export type TupleRef = { kind: 'TupleRef'; values: number[]; hint?: 'point' | 'line' | 'circle' }

export type Ref = NameRef | SubscriptRef | TupleRef

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

/** ab parallel cd  |  ab perpendicular cd  |  l perpendicular m at p  |  l parallel m at 3 */
export type RelationConstraint = {
  kind: 'RelationConstraint'
  relation: 'parallel' | 'perpendicular'
  left: Ref
  right: Ref
  at?: Ref        // perpendicular: intersection point (sugar for point on both lines)
  distance?: number  // parallel: distance between the lines (produces two solutions)
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
