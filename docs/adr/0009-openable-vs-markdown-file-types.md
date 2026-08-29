# ADR-0009: Openable is a wider set than Markdown

## Status
Accepted

## Context
`isMarkdown` was the single gate for "can the editor open this", covering
`.md .markdown .mdown .mkd .mkdn .mdwn .mdx .txt`. The user wanted `.json`,
`.toml`, and `.yaml` to open too. Adding them to that set would make the name
lie: a `.json` file is openable but is not markdown, and must not go through
the markdown renderer or the markdown syntax mode.

## Decision
Two distinct concepts, documented in `CONTEXT.md`:
- **Openable file** — markdown family plus plain text/config: `.json`, `.toml`,
  `.yaml`, `.yml`. This is what the editor will open.
- **Markdown file** — the original eight extensions. Only these get markdown
  syntax in the editor and a rendered preview.

The two sets live in `MARKDOWN_EXTS` / `TEXT_EXTS` (`src/lib/constants.ts`) and
`OPENABLE_EXTS` (`src-tauri/src/commands.rs`), with `isMarkdown()` and
`isOpenable()` on the frontend. `FileEntry.isMarkdown` was renamed to
`isOpenable` in both languages. Native open/save dialog filters are derived
from the same arrays (`OPENABLE_FILTER_EXTS`) so they cannot drift.

## Consequences
- A non-markdown openable file renders as a `<pre>` of the raw text in the
  preview pane instead of being run through `marked` (which would mangle it).
- Its editor mode is resolved by filename from `@codemirror/language-data`
  (already a dependency, loaded on demand) and swapped through a compartment;
  unknown types stay unhighlighted.
- Find-in-Folder's content scan now covers the new text types as well, since
  it shares the "is this readable text" notion.
- The extension list is deliberately duplicated across the Rust and TS sides:
  the tree needs a per-entry decision from the backend, and there is no IPC
  seam that would let one side own it. Both sides carry a pointer to the other.
