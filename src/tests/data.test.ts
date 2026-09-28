import { describe, expect, it } from 'vitest'
import { runSource } from '../lang/defs/eval.js'
import { solveSource } from '../lang/solver/index.js'
import { PRELUDE } from '../lang/prelude/index.js'

const run = (src: string) => runSource(`import prelude\n${src}`, PRELUDE)
const scene = (src: string) => solveSource(`import prelude\n${src}`).scene

describe('elements are data, names are labels', () => {
  it('keys each element by its type and a count of that type', () => {
    const { globals } = run('point a\npoint b\nline l\n')
    expect(globals.get('a')).toBe('Point#1')
    expect(globals.get('b')).toBe('Point#2')
    expect(globals.get('l')).toBe('Line#1')
  })

  it('labels a field only inside its owner', () => {
    const { globals, data } = run('new Triangle t\n')
    const t = data.get(globals.get('t')!)!
    expect(t.type).toBe('Triangle')
    expect([...t.scope.labels()].map(l => l.name)).toEqual(['point1', 'point2', 'point3'])
    // The points have no name of their own in the program — only a path.
    expect([...globals.labels()].map(l => l.name)).toEqual(['t'])
  })

  it('refuses a key written as a name', () => {
    expect(() => run('point Point#1\n')).toThrow(/has a '#'/)
  })

  it('refuses declaring a path', () => {
    expect(() => run('new Triangle t\npoint t.point1\n')).toThrow(/is a path to something that already exists/)
  })
})

describe('what is drawn', () => {
  it('draws a field under its path when nothing else names it', () => {
    const points = scene('new Triangle t\nt.point1 at 0 0\nt.point2 at 1 0\nt.point3 at 0 1\n').points
    expect(points.map(p => p.label).sort()).toEqual(['t.point1', 't.point2', 't.point3'])
  })

  it('draws a point under the name the program gave it, not its path', () => {
    const points = scene('triangle t with a b c\na at 0 0\nb at 1 0\nc at 0 1\n').points
    expect(points.map(p => p.label).sort()).toEqual(['a', 'b', 'c'])
  })

  it('does not draw what nothing names', () => {
    // The two points made by the brackets are nobody's: only the line is drawn.
    const s = scene('line l through (0, 0) (1, 1)\n')
    expect(s.points).toEqual([])
    expect(s.lines.map(l => l.label)).toEqual(['l'])
  })
})
