# ADR-0005: Security model — path allowlist + sensitive-dir denylist

## Status
Accepted

## Context
The app reads/writes arbitrary files (open dialog, file browser, deep links,
copy-with-path, image resolution). We must prevent traversal into system /
secret locations while still allowing the user's documents and mounted volumes.

## Decision
A single `is_path_allowed(path)` helper enforces:
- **Allow:** anywhere under the user home dir, and under `/Volumes`.
- **Deny (override):** sensitive prefixes — `Library/Application Support`,
  `Library/Keychains`, `Library/Caches`, `$TMPDIR`, `.ssh`, `.git`,
  `node_modules`, `target`, and all dotfiles at a folder root.
The same check guards IPC commands (`file_open`, `file_resolve_path`,
`image_data_uri`) and deep-link (`tmd://`) handling, so there is one chokepoint.

## Consequences
- Uniform policy across native UI, IPC, and deep links.
- Local images pass through the same allowlist (resolves to base64), so the
  CSP `img-src 'self' data:` rule holds.
- Opening a file outside the allowlist is rejected with a clear message rather
  than silently failing.
