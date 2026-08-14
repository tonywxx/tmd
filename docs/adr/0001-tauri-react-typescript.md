# ADR-0001: Tauri 2 + React 19 + TypeScript instead of Electron

## Status
Accepted

## Context
We are building a native, lightweight markdown editor from scratch. Electron
bundles a full Chromium + Node runtime, which is heavy (~150MB+ per app) and has
a large attack surface. We want a native, lightweight macOS app.

## Decision
Rebuild on **Tauri 2** (Rust backend + WebView) with a **React 19 + TypeScript**
frontend (Vite). All filesystem/OS behavior lives in Rust commands; the UI
talks to them via `tauri::ipc`.

## Consequences
- Native WebView (≈10MB app) instead of bundled Chromium.
- Rust backend for file watching, security allowlist, git baseline, export,
  deep links, global shortcut, updater, multi-window.
- Some web-only helpers (e.g. `Webview.print()`) are unavailable in this Tauri
  API version, so PDF export is done via a Rust `print_window` command and a
  print stylesheet.
- macOS-only target.
