import { describe, expect, it } from 'vitest'
import { loadModule, type Registry } from '../lang/defs/modules.js'
import { runProgram } from '../lang/defs/eval.js'
import { byName } from './named.js'
import { signature } from '../lang/defs/types.js'
import { PRELUDE } from '../lang/prelude/index.js'

const sigs = (entry: string, registry: Registry) =>
  loadModule(entry, registry).scope.map(d => signature(d)).sort()

// The scenario from the design discussion: A defines p and q; B imports A and
// defines r, whose body uses q; C imports B. C can call r — which reaches q —
// but cannot write q itself.
const abc: Registry = {
  a: `
define p (n: new Point) => Point:
    tsx\`
    return declare(n, 'Point')
    \`

define q (x: Point) => Point:
    tsx\`
    constrain({ kind: 'position', point: x, x: 1, y: 1 })
    return x
    \`
`,
  b: `
import a

define r (n: new Point) => Point:
    p n
    q n
    return n
`,
  c: `
import b
`,
}

describe('imports are file-scoped', () => {
  it('gives an importer the module’s own definitions', () => {
    expect(sigs('b', abc)).toEqual(['p «Name» => Point', 'q «Point» => Point', 'r «Name» => Point'])
  })

  it('does not pass an import on to the next file', () => {
    // C sees r, and neither p nor q.
    expect(sigs('c', abc)).toEqual(['r «Name» => Point'])
  })

  it('lets an indirect call reach what the caller cannot name', () => {
    // `r x` runs p and q even though C can write neither.
    const { constraints, typeOf } = byName(runProgram(['r x'], loadModule('c', abc)))
    expect(typeOf('x')).toBe('Point')
    expect(constraints.constraints).toEqual([{ kind: 'position', point: 'x', x: 1, y: 1 }])
  })

  it('rejects the caller naming an indirect dependency', () => {
    expect(() => runProgram(['p x'], loadModule('c', abc))).toThrow(/no definition matches "p x"/)
  })
})

describe('re-export', () => {
  const barrel: Registry = { ...abc, bar: 'export import a\n' }

  it('passes on what it re-exports', () => {
    expect(sigs('bar', barrel)).toEqual(['p «Name» => Point', 'q «Point» => Point'])
  })

  it('is what makes a barrel module work at all', () => {
    // A barrel can always *use* what it imports — scope is the same either way.
    // The difference is what it hands on, so the check has to be from outside.
    const via = (barrelSrc: string) =>
      sigs('outer', { ...abc, bar: barrelSrc, outer: 'import bar\n' })

    expect(via('export import a\n')).toEqual(['p «Name» => Point', 'q «Point» => Point'])
    expect(via('import a\n')).toEqual([]) // defines nothing, exports nothing
  })

  it('carries through the real prelude', () => {
    const scope = loadModule('prelude', PRELUDE).scope.map(d => signature(d))
    expect(scope).toContain('point «Name» => Point')          // core
    expect(scope).toContain('triangle «Name» with «Name» «Name» «Name» => Triangle') // shapes
    expect(scope).toContain('line «Name» parallel «Line» => Line')               // constraints
    expect(scope).toContain('print «Any»')                    // returns nothing
    expect(scope).toHaveLength(45)
  })
})

describe('shadowing', () => {
  const shadowed: Registry = {
    base: `
define greet (n: new Point) => Point:
    tsx\`
    return declare(n, 'Point')
    \`
`,
    user: `
import base

define greet (n: new Point) => Point:
    tsx\`
    const p = declare(n, 'Point')
    constrain({ kind: 'position', point: p, x: 7, y: 7 })
    return p
    \`
`,
  }

  it('lets a file redefine what it imported', () => {
    // One `greet`, not two — otherwise every use would be ambiguous.
    expect(sigs('user', shadowed)).toEqual(['greet «Name» => Point'])
  })

  it('uses the local definition, not the imported one', () => {
    const { constraints } = byName(runProgram(['greet x'], loadModule('user', shadowed)))
    expect(constraints.constraints).toEqual([{ kind: 'position', point: 'x', x: 7, y: 7 }])
  })

  it('does not shadow a definition that returns something else', () => {
    // Same words, different return type: two definitions, both in scope. Alone
    // on a line nothing says which is meant, so it is ambiguous.
    const other: Registry = {
      ...shadowed,
      user: `
import base

define greet (n: new Line) => Line:
    tsx\`
    return declare(n, 'Line')
    \`
`,
    }
    expect(sigs('user', other)).toEqual(['greet «Name» => Line', 'greet «Name» => Point'])
    expect(() => runProgram(['greet x'], loadModule('user', other))).toThrow(/"greet x" is ambiguous/)
  })

  it('leaves two colliding imports ambiguous rather than picking one', () => {
    // No principled winner between two imports, so the collision is loud.
    const collide: Registry = {
      ...shadowed,
      other: shadowed.user!.replace('import base\n', ''),
      both: 'import base\nimport other\n',
    }
    expect(() => runProgram(['greet x'], loadModule('both', collide))).toThrow(
      /"greet x" is ambiguous/,
    )
  })
})

describe('errors', () => {
  it('names the known modules when one is missing', () => {
    expect(() => loadModule('nope', abc)).toThrow(/no module named "nope" \(known: a, b, c\)/)
  })

  it('reports an import cycle with the path', () => {
    const cyclic: Registry = { x: 'import y\n', y: 'import x\n' }
    expect(() => loadModule('x', cyclic)).toThrow(/import cycle: x → y → x/)
  })

  it('rejects a file defining the same signature twice', () => {
    const dup: Registry = {
      d: `
define twice (n: new Point) => Point:
    tsx\`
    return declare(n, 'Point')
    \`

define twice (m: new Line) => Point:
    tsx\`
    return declare(m, 'Point')
    \`
`,
    }
    // Slot names and output types differ; the signature does not.
    expect(() => loadModule('d', dup)).toThrow(/defines `twice «Name» => Point` twice/)
  })

  it('accepts the same words with different return types', () => {
    const two: Registry = {
      d: `
define pair (x: Scalar) (y: Scalar) => Point:
    point p at x y
    return p

define pair (x: Scalar) (y: Scalar) => Scalar:
    return x
`,
    }
    expect(sigs('d', two)).toEqual(['pair «Scalar» «Scalar» => Point', 'pair «Scalar» «Scalar» => Scalar'])
  })

  it('tells returning nothing apart from returning something', () => {
    const two: Registry = {
      d: `
define note (x: Scalar):
    tsx\`
    print(x)
    \`

define note (x: Scalar) => Scalar:
    return x
`,
    }
    expect(sigs('d', two)).toEqual(['note «Scalar»', 'note «Scalar» => Scalar'])
  })

  it('rejects `export` without `import`', () => {
    expect(() => loadModule('e', { e: 'export a\n' })).toThrow(/'export' must be followed by 'import'/)
  })

  it('rejects an import with no module name', () => {
    expect(() => loadModule('e', { e: 'import\n' })).toThrow(/import needs a module name/)
  })
})
