import type { SelectionInfo } from "./refs";

// ---- Editor port ----
//
// The editor's outside interface: a typed, tab-aware port instead of a raw
// grab-bag singleton. One port is active at a time (the active tab's editor).
// `tabId` lets callers refuse to poke a stale editor when a command targets a
// background tab.

export interface EditorPort {
  readonly tabId: number;
  applyFormatting: (action: string, opts?: Record<string, unknown>) => void;
  getSelection: () => SelectionInfo;
  updateGitMarkers: () => void;
  replaceContent: (content: string) => void;
  focus: () => void;
  undo: () => void;
  redo: () => void;
  selectAll: () => void;
  copySelection: () => void;
  cutSelection: () => void;
  paste: (text: string) => void;
  navigateToLine: (line: number) => void;
}

let activePort: EditorPort | null = null;

export function setActiveEditorPort(port: EditorPort | null): void {
  activePort = port;
}

export function getActiveEditorPort(): EditorPort | null {
  return activePort;
}

// ---- Clipboard de-duplication ----
//
// In the editor, a single copy/cut/paste user action can reach us through two
// paths at once: CodeMirror's own native DOM handler and the menu-driven
// `executeCommand(...)`. Both would insert (paste) or write (copy/cut) the
// text, which doubles the result. Only one path may act per gesture, so the
// first path to run claims the operation for a short window and later arrivals
// bail out. Also guards the menu command against CodeMirror's native handler
// when a Tauri menu accelerator is not consumed by the OS.
const CLIPBOARD_CLAIM_MS = 400;
let lastClipboardClaim = 0;

export function claimClipboardOp(): boolean {
  const now = Date.now();
  if (now - lastClipboardClaim < CLIPBOARD_CLAIM_MS) return false;
  lastClipboardClaim = now;
  return true;
}

/**
 * Replace the editor document only when the target tab is the one mounted.
 * Used when content arrives from outside the editor (external change, merge
 * result): pushing it into the wrong editor would clobber another tab's doc.
 */
export function replaceContentForTab(tabId: number, content: string): void {
  const port = activePort;
  if (port && port.tabId === tabId) port.replaceContent(content);
}
