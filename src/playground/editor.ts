// ─── Tilde CodeMirror Editor ──────────────────────────────────────────────────

import { EditorView, basicSetup } from 'codemirror'
import { EditorState } from '@codemirror/state'
import { StreamLanguage, syntaxHighlighting, HighlightStyle } from '@codemirror/language'
import { linter, Diagnostic } from '@codemirror/lint'
import { tags } from '@lezer/highlight'
import { lex, LexError } from '../lang/lexer.js'
import { parse, ParseError } from '../lang/parser.js'

// ─── Tilde syntax highlighting ────────────────────────────────────────────────

const KEYWORDS = new Set([
  'let', 'triangle', 'square', 'rectangle', 'segment', 'polygon', 'point',
  'parallel', 'perpendicular', 'angle',
  'print', 'set', 'unit', 'length', 'anchor', 'winding',
  'clockwise', 'counterclockwise', 'degrees', 'radians',
  'with', 'and', 'grid', 'on', 'off', 'pick', 'line',
])

const tildeLanguage = StreamLanguage.define({
  token(stream) {
    if (stream.eatSpace()) return null
    if (stream.match(/#.*/)) return 'comment'
    if (stream.match(/[0-9]+(\.[0-9]+)?(cm|mm|m|in|inches|deg|rad)?/)) return 'number'
    if (stream.match(/[=]/)) return 'operator'
    if (stream.match(/[a-zA-Z_][a-zA-Z0-9_]*/)) {
      return KEYWORDS.has(stream.current()) ? 'keyword' : 'variableName'
    }
    stream.next()
    return null
  },
})

const tildeHighlight = HighlightStyle.define([
  { tag: tags.keyword,       color: '#5c7cfa', fontWeight: 'bold' },
  { tag: tags.number,        color: '#f08c00' },
  { tag: tags.comment,       color: '#868e96', fontStyle: 'italic' },
  { tag: tags.variableName,  color: '#2f9e44' },
  { tag: tags.operator,      color: '#aaa' },
])

// ─── Tilde linter ─────────────────────────────────────────────────────────────

function lineColToOffset(doc: EditorView['state']['doc'], line: number, col: number): number {
  const lineObj = doc.line(Math.max(1, Math.min(line, doc.lines)))
  return Math.min(lineObj.from + col - 1, lineObj.to)
}

const tildeLinter = linter((view) => {
  const source = view.state.doc.toString()
  const diagnostics: Diagnostic[] = []
  try {
    const tokens = lex(source)
    parse(tokens)
  } catch (e) {
    if (e instanceof LexError || e instanceof ParseError) {
      const from = lineColToOffset(view.state.doc, e.line, e.col)
      const to   = Math.min(from + 1, view.state.doc.length)
      diagnostics.push({ from, to, severity: 'error', message: e.message })
    }
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
