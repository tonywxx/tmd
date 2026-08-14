# ADR-0006: Native menu wired to the frontend via an event bus

## Status
Accepted

## Context
tmd exposes nearly all actions through the native macOS menu (File, Edit,
Format, View, Window, Help). A Tauri menu item's callback runs on the Rust
side, but the action (e.g. "Undo", "Export PDF", "Toggle Focus Mode") must
affect React state in the webview.

## Decision
The Rust `on_menu_event` handler maps each menu id to a semantic event name
(`menu-undo`, `menu-save`, `menu-export-pdf`, `toggle-fullscreen`, …) and emits
it to the webview via `emit_menu(app, event, payload)` on the main
`WebviewWindow`. The frontend (`App.tsx`) subscribes to these event names and
calls the corresponding store/editor action. This keeps menu wiring declarative
and avoids per-action Rust↔JS plumbing.

## Consequences
- One place (`on_menu_event`) enumerates every menu command.
- Frontend owns all side-effecting logic; Rust stays a thin emitter.
- Adding a menu item = add Rust id + emit name + frontend listener.
- The same event names are reused for deep links and global shortcuts.
