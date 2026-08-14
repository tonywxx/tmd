# CONTEXT — tmd (TONy Markdown App)

tmd is a native **Tauri 2 + React 19 + TypeScript** markdown editor for macOS.
This file is the single source of ubiquitous language for the project.

## Domain glossary

- **Tab** — an open document. A tab has a `name`, an optional `filePath`, the
  current `content`, and the `savedContent` last written to disk. `dirty` is true
  when `content !== savedContent`. Each tab owns its own CodeMirror `EditorState`
  so undo/redo history is isolated per tab.
- **Active tab** — the tab currently shown in the editor/preview panes.
- **File browser** — a sidebar showing the contents of the current folder plus
  the user's **favorites** (pinned files or directories). Entries can be sorted
  and (optionally) show modification dates.
- **Favorite** — a pinned file or directory path shown above the folder listing.
- **Markdown preview** — a sanitized HTML rendering of the active tab's content
  (GFM via `marked`, sanitized via `DOMPurify`). Scroll position is kept in sync
  with the editor (proportional, cooldown-guarded).
- **Git gutter** — a marker in the editor gutter on lines that differ from a
  baseline (the file's git HEAD version, or the saved content when untracked).
- **Formatting action** — a smart toggle (bold, italic, heading, list, quote,
  code, link, task, hr, strikethrough) applied to the selection or current line;
  applying it again removes the formatting.
- **Text transform** — a unicode/case transformation (unicode italic/bold/etc.,
  small-caps, strikethrough, uppercase, lowercase, title-case).
- **Three-way merge / DiffView** — when a file changes on disk while the tab has
  unsaved local edits, the user resolves conflicts hunk-by-hunk (mine vs theirs)
  and applies a merged result.
- **Focus Mode** — a distraction-free, fullscreen editing layout (in-app; chrome
  hidden) toggled with ⌘⇧F.
- **Deep link** — a `tmd://open?path=…&line=…` URL that opens a file (and
  optionally jumps to a line). Handled by the single-instance plugin, which
  forwards the URL to the running window.
- **Global hotkey** — a system-wide shortcut (default ⌘⇧Space) that opens the
  "Open from Path" dialog even when the app is unfocused.
- **Session** — the set of open files, the active file, and the current folder,
  persisted per window and restored on launch.
- **Recent files / directories** — most-recently-used paths, persisted in
  settings and shown in the menu and browser.
- **Settings** — user preferences (theme, accent, fonts, auto-save, sort,
  dates, hotkeys, beta-updates) persisted as JSON in the app data dir.
- **Allowed path** — a filesystem path within the user's home directory or
  `/Volumes`, excluding a denylist of sensitive directories (`.ssh`, `.gnupg`,
  `.aws`, `.docker`, `.kube`, `.config/gcloud`, `.config/gh`). Enforced uniformly
  for both IPC commands and deep links.

## Bounded contexts

- **Editor context** — CodeMirror document, formatting actions, gutter, undo.
- **Preview context** — markdown rendering, image resolution, scroll sync.
- **File system context** — browser, favorites, watchers, security allowlist.
- **App shell context** — windows, menu, tabs, dialogs, session, settings.

## Invariants

- A tab is `dirty` iff its content differs from the last content written to disk.
- External (disk) changes to a non-dirty tab replace the editor content silently;
  external changes to a dirty tab trigger the DiffView.
- All filesystem access goes through the security allowlist.
