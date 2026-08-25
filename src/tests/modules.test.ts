import { describe, expect, it } from 'vitest'
import { loadModule, type Registry } from '../lang/defs/modules.js'
import { runProgram } from '../lang/defs/eval.js'
import { signature } from '../lang/defs/types.js'
import { PRELUDE } from '../lang/prelude/index.js'

const sigs = (entry: string, registry: Registry) =>
  loadModule(entry, registry).scope.map(d => signature(d.pattern)).sort()

// The scenario from the design discussion: A defines p and q; B imports A and
// defines r, whose body uses q; C imports B. C can call r — which reaches q —
// but cannot write q itself.
const abc: Registry = {
  a: `
define p (n: Name) => Point =
    tsx\`
    return declare(n, 'Point')
    \`

define q (x: Point) => Point =
    tsx\`
    constrain({ kind: 'position', point: x, x: 1, y: 1 })
    return x
    \`
`,
  b: `
import a

define r (n: Name) => Point =
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
    expect(sigs('b', abc)).toEqual(['p «Name»', 'q «Point»', 'r «Name»'])
  })

  it('does not pass an import on to the next file', () => {
    // C sees r, and neither p nor q.
    expect(sigs('c', abc)).toEqual(['r «Name»'])
  })

  it('lets an indirect call reach what the caller cannot name', () => {
    // `r x` runs p and q even though C can write neither.
    const { constraints, types } = runProgram(['r x'], loadModule('c', abc))
    expect(types.get('x')).toBe('Point')
    expect(constraints.constraints).toEqual([{ kind: 'position', point: 'x', x: 1, y: 1 }])
  })

  it('rejects the caller naming an indirect dependency', () => {
    expect(() => runProgram(['p x'], loadModule('c', abc))).toThrow(/no definition matches "p x"/)
  })
})

describe('re-export', () => {
  const barrel: Registry = { ...abc, bar: 'export import a\n' }

  it('passes on what it re-exports', () => {
    expect(sigs('bar', barrel)).toEqual(['p «Name»', 'q «Point»'])
  })

  it('is what makes a barrel module work at all', () => {
    // A barrel can always *use* what it imports — scope is the same either way.
    // The difference is what it hands on, so the check has to be from outside.
    const via = (barrelSrc: string) =>
      sigs('outer', { ...abc, bar: barrelSrc, outer: 'import bar\n' })

    expect(via('export import a\n')).toEqual(['p «Name»', 'q «Point»'])
    expect(via('import a\n')).toEqual([]) // defines nothing, exports nothing
  })

  it('carries through the real prelude', () => {
    const scope = loadModule('prelude', PRELUDE).scope.map(d => signature(d.pattern))
    expect(scope).toContain('point «Name»')          // core
    expect(scope).toContain('triangle «Name» with «Name» «Name» «Name»') // shapes
    expect(scope).toContain('line «Name» parallel «Line»')               // constraints
    expect(scope).toHaveLength(27)
  })
})

describe('shadowing', () => {
  const shadowed: Registry = {
    base: `
define greet (n: Name) => Point =
    tsx\`
    return declare(n, 'Point')
    \`
`,
    user: `
import base

define greet (n: Name) => Line =
    tsx\`
    return declare(n, 'Line')
    \`
`,
  }

  it('lets a file redefine what it imported', () => {
    // One `greet`, not two — otherwise every use would be ambiguous.
    expect(sigs('user', shadowed)).toEqual(['greet «Name»'])
  })

  it('uses the local definition, not the imported one', () => {
    const { types } = runProgram(['greet x'], loadModule('user', shadowed))
    expect(types.get('x')).toBe('Line')
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
define twice (n: Name) => Point =
    tsx\`
    return declare(n, 'Point')
    \`

define twice (m: Name) => Line =
    tsx\`
    return declare(m, 'Line')
    \`
`,
    }
    // Slot names differ; the signature does not.
    expect(() => loadModule('d', dup)).toThrow(/defines `twice «Name»` twice/)
  })

  it('rejects `export` without `import`', () => {
    expect(() => loadModule('e', { e: 'export a\n' })).toThrow(/'export' must be followed by 'import'/)
  })

  it('rejects an import with no module name', () => {
    expect(() => loadModule('e', { e: 'import\n' })).toThrow(/import needs a module name/)
  })
})
