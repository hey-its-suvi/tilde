import { describe, expect, it } from 'vitest'
import { solveSource } from '../lang/solver/index.js'

const run = (src: string) => solveSource(`import prelude\n${src}`)

describe('set', () => {
  it('shows the grid and axes and hides the origin by default', () => {
    const { config } = run('point a at 0 0\n')
    expect(config).toMatchObject({ grid: true, axes: true, origin: false })
  })

  it('turns each one on or off', () => {
    const { config } = run('set grid off\nset axes off\nset origin on\n')
    expect(config).toMatchObject({ grid: false, axes: false, origin: true })
  })

  it('says which settings there are when given one that is not', () => {
    expect(() => run('set colour on\n')).toThrow(
      /there is no setting called colour \(there are grid, axes, origin, subscripts\)/,
    )
  })

  it('leaves setting names free to name things with', () => {
    // A pattern word cannot be a body's own name, which is why the setting's
    // name sits in a slot: `origin` and `grid` here are still new each call.
    const src = `define corner:
    point origin at 0 0
    point grid at 1 1
corner
corner
point axes at 2 2
`
    expect(() => run(src)).not.toThrow()
  })
})
