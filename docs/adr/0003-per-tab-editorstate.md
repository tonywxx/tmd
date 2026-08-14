# ADR-0003: Per-tab CodeMirror EditorState outside React state

## Status
Accepted

## Context
We want a separate editor buffer per open tab. We need independent
undo/redo history per tab and must avoid re-rendering React on every keystroke.

## Decision
Each tab owns a `EditorState` stored in a `Map<tabId, EditorState>` held in a
`useRef` (non-reactive). Switching tabs destroys the old `EditorView` and
recreates it from the stored state, preserving cursor, history, and gutter
markers. Theme/line-numbers/git-gutter are `Compartment`s reconfigured on
demand. React only holds lightweight tab *metadata* (title, saved flag, path).

## Consequences
- Undo/redo is isolated per tab.
- No React reconciliation on content edits (perf).
- `goto-line` is dispatched via a custom DOM event (`tmd:goto-line`) to the
  active view.
- Autosave is debounced per tab via per-tab timers.
