// ---- Native input port ----
//
// The outside interface the app shell and editor port use to read or write a
// focused <input>/<textarea>, and to arbitrate clipboard gestures. This used
// to be split: the editable-snapshot/insert logic lived inside appCommands and
// the editor's clipboard claim lived inside editorPort. Concentrating both
// here gives locality — the controlled-input + gesture-dedup logic now has one
// home and can be unit tested without a running Tauri window.

// When focus is on a native <input>/<textarea> (e.g. the Open from URL /
// Open from Path dialogs), Tauri's menu accelerator (⌘C/⌘V/⌘X) is consumed by
// the app and the webview does NOT perform a native clipboard action, so we
// must do it ourselves. Two hazards to avoid:
//   1. A single gesture can reach us twice (the accelerator's menu event AND,
//      on platforms where the webview also emits a native paste, that native
//      paste) — both would insert, doubling the text.
//   2. The field is a controlled React input; writing it via setRangeText
//      alone leaves React's state stale, so the next render resets it to ""
//      and the text vanishes. We re-dispatch an `input` event so onChange
//      syncs React state.
// `pasteGestureActive` collapses a single user gesture into one operation
// regardless of which paths fire, and `activeNativeEditable` finds the field.
const PASTE_GESTURE_MS = 400;
let lastPasteGesture = 0;
export function markPasteGesture(): void {
  lastPasteGesture = Date.now();
}
export function pasteGestureActive(): boolean {
  return Date.now() - lastPasteGesture < PASTE_GESTURE_MS;
}

export function activeNativeEditable(): HTMLInputElement | HTMLTextAreaElement | null {
  const el = document.activeElement as HTMLElement | null;
  if (!el) return null;
  if (el.tagName === "INPUT" || el.tagName === "TEXTAREA") {
    return el as HTMLInputElement | HTMLTextAreaElement;
  }
  return null;
}

// Sync a programmatic DOM edit of a controlled input back into React state by
// re-emitting the `input` event that React's onChange listens for.
export function syncControlledInput(el: HTMLInputElement | HTMLTextAreaElement): void {
  el.dispatchEvent(new Event("input", { bubbles: true }));
}

// Snapshot of a native <input>/<textarea> taken synchronously when a paste is
// claimed. The clipboard read is async, and on some platforms the native paste
// default action still fires despite preventDefault (moving the caret/inserting
// text). Reconstructing the value from this snapshot — instead of the live
// value and selection at insert time — guarantees one gesture inserts once.
export interface EditableSnapshot {
  el: HTMLInputElement | HTMLTextAreaElement;
  before: string;
  start: number;
  end: number;
}

export function snapshotEditable(
  el?: HTMLInputElement | HTMLTextAreaElement | null,
): EditableSnapshot | null {
  const target = el ?? activeNativeEditable();
  if (!target) return null;
  return {
    el: target,
    before: target.value,
    start: target.selectionStart ?? target.value.length,
    end: target.selectionEnd ?? target.value.length,
  };
}

// Insert `text` into the editable described by `snap`, replacing the snapshot's
// original [start, end) range, then sync React state (controlled inputs ignore
// raw DOM edits otherwise). The value is written via setRangeText (not a direct
// `el.value = …`) so React's value tracker isn't updated out-of-band: otherwise
// the re-dispatched `input` event looks like a no-op and onChange never fires,
// leaving the controlled input's state stale (e.g. Open stays disabled).
export function insertIntoEditable(snap: EditableSnapshot, text: string): void {
  const { el, before, start, end } = snap;
  const next = before.slice(0, start) + text + before.slice(end);
  el.setRangeText(next, 0, el.value.length, "end");
  el.setSelectionRange(start + text.length, start + text.length);
  syncControlledInput(el);
}

// True when the current DOM text selection lives inside a CodeMirror editor.
// CodeMirror manages its own clipboard via the editor port, so a selection
// there must NOT be copied as raw DOM text.
function selectionInsideEditor(sel: Selection): boolean {
  const node = sel.anchorNode;
  if (!node) return false;
  const el =
    node.nodeType === Node.ELEMENT_NODE
      ? (node as Element)
      : node.parentElement;
  return !!el && !!el.closest(".editor-host, .cm-editor");
}

// Copy the current non-editor DOM text selection (e.g. selected prose in the
// preview). Returns false when there is no usable selection outside the editor
// so the caller can fall back to the editor port. This is what makes selecting
// text in the preview and pressing ⌘C work, since the Tauri "Copy" menu
// accelerator otherwise always routes clipboard ops to the editor.
export function copyDomSelection(): boolean {
  const sel = window.getSelection();
  if (!sel || sel.isCollapsed || selectionInsideEditor(sel)) return false;
  const text = sel.toString();
  if (!text) return false;
  void navigator.clipboard.writeText(text);
  return true;
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
