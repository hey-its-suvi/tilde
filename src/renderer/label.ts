// ─── Subscripted labels ──────────────────────────────────────────────────────
// With `set subscripts on`, the part of a name after `_` is drawn as a
// subscript: `t_1` is t₁. Further underscores separate subscripts with commas,
// the way an edge is written (`t_1_2` is t₁,₂), primes follow the subscript
// (`l_1'` is l₁'), and each part of a path is its own name (`t_1.point_2` is
// t₁.point₂).
//
// Labels and printed lines are plain text that may hold several names and
// numbers (`t_1–t_2`, `r = 3.5`), so this finds the names inside the text
// rather than treating the whole of it as one. A number is never a name, so the
// `.` in 3.5 stays where it is.

export type LabelRun = { text: string; sub: boolean }

const NAME = /[A-Za-z][A-Za-z0-9_.]*'*/g

/** Split `text` into runs of normal and subscript text. Adjacent runs of the
 *  same kind are merged, so plain text comes back as a single run. */
export function labelRuns(text: string): LabelRun[] {
  const runs: LabelRun[] = []
  const push = (t: string, sub: boolean) => {
    if (t === '') return
    const last = runs[runs.length - 1]
    if (last !== undefined && last.sub === sub) last.text += t
    else runs.push({ text: t, sub })
  }

  let at = 0
  for (const m of text.matchAll(NAME)) {
    // A letter straight after a digit belongs to a number (`2e5`) or is not a
    // name we wrote; leave it alone.
    if (m.index > 0 && /[0-9_]/.test(text[m.index - 1]!)) continue
    push(text.slice(at, m.index), false)
    nameRuns(m[0], push)
    at = m.index + m[0].length
  }
  push(text.slice(at), false)
  return runs
}

function nameRuns(name: string, push: (t: string, sub: boolean) => void): void {
  name.split('.').forEach((part, i) => {
    if (i > 0) push('.', false)
    const primes = /'*$/.exec(part)![0]
    const bare = part.slice(0, part.length - primes.length)
    const cut = bare.indexOf('_')
    if (cut <= 0) {
      push(part, false)
      return
    }
    push(bare.slice(0, cut), false)
    push(bare.slice(cut + 1).replaceAll('_', ','), true)
    push(primes, false)
  })
}
