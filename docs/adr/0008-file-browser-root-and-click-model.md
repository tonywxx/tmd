# ADR-0008: File browser is rooted at `~` and never follows the active tab

## Status
Accepted

## Context
The browser's root was derived: `recentDirectories[0]` at boot, then the
session's folder, then — on every tab switch — `dirname(activeTab.filePath)`.
Because `setFolderPath` clears `dirChildren` and `expandedDirs`, opening a
nested file collapsed the whole tree and re-rooted the sidebar. The user could
never predict where the sidebar would point next, and browsing was constantly
interrupted by the tree rebuilding itself underneath them.

Opening also required a double click, while a single click only selected — so
the common action cost two clicks and the cheap action did nothing.

## Decision
- The root is the user's home directory at every launch. It changes only on an
  explicit user action: the folder button, Open Folder, a favorite directory,
  or the context menu.
- Opening a file never re-roots and never expands the tree.
- One exception: at launch, the restored file's ancestors are expanded once
  (`revealPath`) so its selection highlight is visible under a home-rooted
  tree.
- Single click opens an **openable** file. Directories still toggle on single
  click. The file branch of `onDoubleClick` is gone.
- Clicks on files over 10 MB are refused with a toast, before any read.

## Consequences
- Restoring "where I was last time" is gone from the browser. `recentFiles` /
  `recentDirectories` are still recorded (the Open Recent menu needs them), but
  only the *selected file* — not the root — is restored.
- `Session.folderPath` was removed from the persisted session; the root is no
  longer part of session state.
- A file opened via `File > Open`, a deep link, or a drag-drop may sit outside
  the visible tree. Accepted: the alternative is the unpredictable re-rooting
  this ADR removes.
- The launch-time reveal expands one directory per path segment. The rejected
  alternative — never expanding — would leave the restored selection invisible
  for every file that is not directly under `~`.
