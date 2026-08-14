# ADR-0004: Focus Mode implemented in-app

## Status
Accepted

## Context
tmd has a "Focus Mode" that hides the file browser, toolbar, and tabs and
centers the editor. We considered a separate fullscreen window, but that
complicates state sync (tab/scroll/content) between windows.

## Decision
Focus Mode is a CSS class / React layout state that hides chrome (file browser,
toolbar, tab bar) and widens the editor+preview split, all within the same
window and same React tree. The native menu toggles it via a `toggle-fullscreen`
(event name is shared with OS fullscreen to keep the menu simple).

## Consequences
- No duplicated state across windows.
- Keeps the same WebView/window label, so session restore and IPC stay simple.
- Distinct from OS-level fullscreen; both can be active independently.
