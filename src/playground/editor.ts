// ─── Tilde CodeMirror Editor ──────────────────────────────────────────────────

import { EditorView, basicSetup } from 'codemirror'
import { EditorState } from '@codemirror/state'
import { StreamLanguage, syntaxHighlighting, HighlightStyle } from '@codemirror/language'
import { linter, Diagnostic } from '@codemirror/lint'
import { tags } from '@lezer/highlight'
import { runSource } from '../lang/defs/eval.js'
import { loadModule } from '../lang/defs/modules.js'
import { parseFile } from '../lang/defs/parser.js'
import { slotColumns } from '../lang/defs/highlight.js'
import { PRELUDE } from '../lang/prelude/index.js'
import { DefinitionError, type Definition } from '../lang/defs/types.js'

// ─── Tilde syntax highlighting ────────────────────────────────────────────────
// Tilde has four words of its own, and only four: `define`, `import`, `export`,
// `tsx`.
// Everything else a program says — `point`, `parallel`, `with` — comes from the
// prelude, and a user can define or redefine it with the same tools, so
// colouring those like built-ins would claim a privilege they do not have.
//
// What *is* worth separating is pattern words from the values filling slots. In
// `circle c on l`, `circle` and `on` are the pattern and `c` and `l` are the
// arguments — but nothing lexical says so. Only the definition the line matches
// does. So each line is aligned against the definition table and the slot
// columns are read off it. Four buckets:
//
//     define / import / export / tsx   the language's own words
//     slot fillers — names, numbers    the values, in purple
//     pattern words                    the sentence around them
//     punctuation, comments, types     scaffolding

/** The whole of Tilde's own vocabulary. Everything else is defined, not built in. */
const TILDE_WORDS = new Set(['define', 'import', 'export', 'tsx'])

/** The prelude's definitions, fixed for the session. */
const PRELUDE_DEFS: Definition[] = (() => {
  try {
    return [...loadModule('prelude', PRELUDE).scope]
  } catch {
    return [] // a broken prelude is the linter's problem to report, not this one
  }
})()

/** Plus whatever the open document defines, so a user's own patterns get their
 *  slots marked too. Refreshed by the linter, which parses on every change. */
let table: Definition[] = PRELUDE_DEFS

const refreshTable = (source: string) => {
  try {
    table = [...parseFile(source).definitions, ...PRELUDE_DEFS]
  } catch {
    // Keep the previous table rather than dropping all colour mid-edit.
  }
}

type TokenState = {
  /** Slot columns for the line being tokenised. */
  slots: Set<number>
  /** Inside a `define type` body, where each line reads `Type name`. */
  inType: boolean
  /** Inside a tsx block — TypeScript, not Tilde, so it is not highlighted. */
  inTsx: boolean
  /** This line is a `define` header, where slots are written out explicitly. */
  isDefine: boolean
  /** The next word is a slot name (just saw `(`) or a type (just saw `:`/`=>`). */
  expect: 'none' | 'slotName' | 'type'
}

const tildeLanguage = StreamLanguage.define<TokenState>({
  startState: () => ({ slots: new Set(), inTsx: false, inType: false, isDefine: false, expect: 'none' }),

  token(stream, state) {
    if (stream.sol()) startLine(stream.string, state)
    if (stream.eatSpace()) return null

    // A tsx body is TypeScript. Highlighting it as Tilde would be nonsense, so
    // it reads as scaffolding until the closing backtick.
    if (state.inTsx) {
      stream.skipToEnd()
      return 'punctuation'
    }

    if (stream.match(/"(?:[^"\\]|\\.)*"?/)) return 'string'
    if (stream.match(/--.*/)) return 'comment'

    // A type body is `Type name` per line: the type reads as scaffolding, the
    // field name as a value, matching how both look everywhere else.
    if (state.inType) {
      if (stream.match(/[[\]]/)) return 'punctuation'
      if (stream.match(/[a-zA-Z_][a-zA-Z0-9_]*/)) {
        const first = state.expect !== 'type'
        state.expect = 'type'
        return first ? 'punctuation' : 'propertyName'
      }
      stream.next()
      return null
    }

    if (stream.match(/=>/) || stream.match(/:/)) {
      state.expect = 'type'
      return 'punctuation'
    }
    if (stream.match(/\(/)) {
      // Only in a header does `(` introduce a slot declaration.
      state.expect = state.isDefine ? 'slotName' : 'none'
      return 'punctuation'
    }
    if (stream.match(/[)[\]=,;`+\-*/]/)) return 'punctuation'

    const col = stream.pos

    if (stream.match(/[0-9]+(\.[0-9]+)?/)) {
      state.expect = 'none'
      return 'propertyName' // a literal is a value like any other
    }

    if (stream.match(/[a-zA-Z_][a-zA-Z0-9_.']*/)) {
      const expect = state.expect
      state.expect = 'none'

      if (expect === 'type') return 'punctuation'
      if (expect === 'slotName') return 'propertyName'
      if (TILDE_WORDS.has(stream.current())) return 'definitionKeyword'
      return state.slots.has(col) ? 'propertyName' : 'atom'
    }

    stream.next()
    return null
  },
})

const isIndentedLine = (line: string) => /^[ \t]/.test(line)

/** Decide what kind of line this is before tokenising any of it. */
function startLine(line: string, state: TokenState) {
  state.expect = 'none'
  state.slots = new Set()

  const trimmed = line.trim()

  if (state.inTsx) {
    // The closing backtick ends the block and is punctuation in its own right.
    if (trimmed === '`') state.inTsx = false
    state.isDefine = false
    return
  }

  if (trimmed === 'tsx`') {
    state.inTsx = true
    state.isDefine = false
    return
  }

  state.isDefine = /^define\b/.test(trimmed)
  if (!isIndentedLine(line)) state.inType = /^define\s+type\b/.test(trimmed)
  if (state.inType && isIndentedLine(line)) return // a field line, handled above

  // A `define` header writes its slots out as `(n: Type)`, so it needs no
  // alignment. Every other line is a statement, and only the table can say
  // which of its words are values.
  if (!state.isDefine && trimmed !== '' && !trimmed.startsWith('--')) {
    state.slots = slotColumns(line, table)
  }
}

const tildeHighlight = HighlightStyle.define([
  { tag: tags.comment,       color: '#868e96', fontStyle: 'italic' },
  { tag: tags.definitionKeyword, color: '#2f9e44', fontWeight: 'bold' }, // define, import, export, tsx
  { tag: tags.propertyName,  color: '#c2255c' }, // slot fillers: names and numbers
  { tag: tags.atom,          color: '#343a40' }, // pattern words
  { tag: tags.punctuation,   color: '#868e96' }, // brackets, types, tsx bodies
  { tag: tags.string,        color: '#c2255c' }, // text is a value, like a number
])

// ─── Tilde linter ─────────────────────────────────────────────────────────────

function lineColToOffset(doc: EditorView['state']['doc'], line: number, col: number): number {
  const lineObj = doc.line(Math.max(1, Math.min(line, doc.lines)))
  return Math.min(lineObj.from + col - 1, lineObj.to)
}

/** The definition pipeline reports positions two ways: a DefinitionError carries
 *  `.line`, and a statement error is prefixed `[main:N]` by evaluation. Anything
 *  else has no position, so it lands on line 1 rather than nowhere. */
function definitionErrorLine(e: unknown): number {
  if (e instanceof DefinitionError) return e.line
  const match = e instanceof Error ? /^\[main:(\d+)\]/.exec(e.message) : null
  return match ? Number(match[1]) : 1
}

const tildeLinter = linter((view) => {
  const source = view.state.doc.toString()
  const doc = view.state.doc
  const diagnostics: Diagnostic[] = []

  const report = (line: number, col: number, message: string) => {
    const from = lineColToOffset(doc, line, col)
    diagnostics.push({ from, to: Math.min(from + 1, doc.length), severity: 'error', message })
  }

  try {
    refreshTable(source)
    runSource(source, PRELUDE)
  } catch (e) {
    if (e instanceof Error) report(definitionErrorLine(e), 1, e.message)
  }
  return diagnostics
})

// ─── Editor theme ─────────────────────────────────────────────────────────────

const tildeTheme = EditorView.theme({
  '&': {
    height: '100%',
    fontSize: '14px',
    fontFamily: 'monospace',
    backgroundColor: '#fafaf8',
  },
  '.cm-content': { padding: '16px 0' },
  '.cm-line':    { padding: '0 16px' },
  '.cm-focused': { outline: 'none' },
  '.cm-editor':  { height: '100%' },
  '.cm-scroller':{ overflow: 'auto' },
  '.cm-gutters': { backgroundColor: '#f0f0ec', borderRight: '1px solid #ddd', color: '#999' },
})

// ─── Factory ──────────────────────────────────────────────────────────────────

export function createEditor(
  parent: HTMLElement,
  initialDoc: string,
  onChange: (value: string) => void,
): EditorView {
  const state = EditorState.create({
    doc: initialDoc,
    extensions: [
      basicSetup,
      tildeLanguage,
      syntaxHighlighting(tildeHighlight),
      tildeLinter,
      tildeTheme,
      EditorView.updateListener.of((update) => {
        if (update.docChanged) onChange(update.state.doc.toString())
      }),
    ],
  })

  return new EditorView({ state, parent })
}
