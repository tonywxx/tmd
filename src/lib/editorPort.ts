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

/**
 * Replace the editor document only when the target tab is the one mounted.
 * Used when content arrives from outside the editor (external change, merge
 * result): pushing it into the wrong editor would clobber another tab's doc.
 */
export function replaceContentForTab(tabId: number, content: string): void {
  const port = activePort;
  if (port && port.tabId === tabId) port.replaceContent(content);
}
