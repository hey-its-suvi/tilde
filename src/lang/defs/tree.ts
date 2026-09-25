// ─── Statement trees ─────────────────────────────────────────────────────────
// Brackets group. `line l through (1,2) (3,4)` is one statement with two smaller
// statements nested in it, each of which fills a slot once it has been worked
// out.
//
// A tree rather than evaluate-as-you-scan, because working out a group will not
// always be possible from the inside alone. `(2, 1)` could be a point or a line
// in slope-intercept form, and only the slot it sits in can say which. That needs
// the expected type carried *down* into the group before it is settled, which in
// turn needs the group to still exist as a group — not to have been run already
// while scanning.

import type { Token } from './lexer.js'

export type Node =
  | { kind: 'token'; token: Token }
  | { kind: 'group'; children: Node[]; col: number }

export class GroupError extends Error {
  constructor(message: string) {
    super(`[Brackets] ${message}`)
  }
}

/** Nest a flat token list by its brackets. Throws on a bracket that is never
 *  closed, one that closes nothing, or an empty group. */
export function groupTokens(tokens: readonly Token[]): Node[] {
  const stack: { children: Node[]; col: number }[] = [{ children: [], col: 0 }]

  for (const token of tokens) {
    if (token.kind === 'EOF') continue

    if (token.kind === 'LPAREN') {
      stack.push({ children: [], col: token.col })
      continue
    }

    if (token.kind === 'RPAREN') {
      if (stack.length === 1) {
        throw new GroupError(`')' at column ${token.col + 1} closes nothing`)
      }
      const closed = stack.pop()!
      if (closed.children.length === 0) {
        throw new GroupError(`empty brackets at column ${closed.col + 1}`)
      }
      stack.at(-1)!.children.push({ kind: 'group', children: closed.children, col: closed.col })
      continue
    }

    stack.at(-1)!.children.push({ kind: 'token', token })
  }

  if (stack.length > 1) {
    throw new GroupError(`'(' at column ${stack.at(-1)!.col + 1} is never closed`)
  }
  return stack[0]!.children
}

export const hasGroups = (nodes: readonly Node[]): boolean =>
  nodes.some(n => n.kind === 'group')

/** Write nodes back out as statement text. Only meaningful once every group has
 *  been replaced by the token standing for its value. */
export function render(nodes: readonly Node[]): string {
  return nodes
    .map(n => (n.kind === 'token' ? n.token.value : `( ${render(n.children)} )`))
    .join(' ')
}
