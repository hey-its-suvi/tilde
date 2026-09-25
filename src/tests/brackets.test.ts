import { describe, expect, it } from 'vitest'
import { groupTokens, render } from '../lang/defs/tree.js'
import { lexHeader } from '../lang/defs/lexer.js'
import { runSource } from '../lang/defs/eval.js'
import { solveSource } from '../lang/solver/index.js'
import { PRELUDE } from '../lang/prelude/index.js'

const tree = (s: string) => groupTokens(lexHeader(s, 0))
const draw = (src: string) => solveSource(`import prelude\n${src}`).scene
const run = (src: string) => runSource(`import prelude\n${src}`, PRELUDE)

describe('brackets nest', () => {
  it('builds a tree, innermost groups inside outer ones', () => {
    const nodes = tree('f ((1, 2), 3)')
    expect(nodes.map(n => n.kind)).toEqual(['token', 'group'])
    const outer = nodes[1]!
    if (outer.kind !== 'group') throw new Error('expected a group')
    expect(outer.children.map(n => n.kind)).toEqual(['group', 'token', 'token'])
  })

  it('writes a tree back out as text', () => {
    expect(render(tree('line l through (1,2) (3,4)'))).toBe('line l through ( 1 , 2 ) ( 3 , 4 )')
  })

  it('reports an unclosed bracket where it opened', () => {
    expect(() => tree('point p = (3, 4')).toThrow(/'\(' at column 11 is never closed/)
  })

  it('reports a closing bracket with nothing to close', () => {
    expect(() => tree('point p = 3, 4)')).toThrow(/'\)' at column 15 closes nothing/)
  })

  it('rejects empty brackets', () => {
    expect(() => tree('point p = ()')).toThrow(/empty brackets at column 11/)
  })
})

describe('a bracketed group fills a slot with its value', () => {
  it('makes a point where one is expected', () => {
    const scene = draw('line l through (1,2) (3,4)\n')
    expect(scene.lines.map(l => l.label)).toEqual(['l'])
  })

  it('works in any slot, not just one form', () => {
    const c = draw('circle c with center (0,0) and radius 2\n').circles[0]!
    expect({ cx: c.cx, cy: c.cy, r: c.r }).toEqual({ cx: 0, cy: 0, r: 2 })
  })

  it('names the point when asked', () => {
    expect(draw('point p = (3, 4)\n').points).toMatchObject([{ label: 'p', x: 3, y: 4 }])
  })

  it('makes a separate point each time', () => {
    const pts = draw('point p = (3, 4)\npoint q = (5, 6)\n').points
    expect(pts.map(p => [p.label, p.x, p.y])).toEqual([['p', 3, 4], ['q', 5, 6]])
  })

  it('takes named numbers inside', () => {
    expect(draw('scalar k = 7\npoint p = (k, 2)\n').points).toMatchObject([{ label: 'p', x: 7, y: 2 }])
  })

  it('treats brackets around one thing as that thing', () => {
    expect(draw('point p = ((3), (4))\n').points).toMatchObject([{ label: 'p', x: 3, y: 4 }])
  })

  it('leaves unnamed intermediates undrawn', () => {
    // The two points the groups make have no names, so only the line appears.
    expect(draw('line l through (1,2) (3,4)\n').points).toEqual([])
  })

  it('refuses a group that produces nothing', () => {
    expect(() => run('point a\npoint b\npoint p = (distance between a and b is 5)\n'))
      .toThrow(/produces nothing, so it cannot stand where a value is expected/)
  })

  it('works inside a definition body too', () => {
    const scene = draw(`
define unit square corner (n: Name) => Point:
    point n = (1, 1)
    return n

unit square corner z
`)
    expect(scene.points).toMatchObject([{ label: 'z', x: 1, y: 1 }])
  })
})
