import { getCurrentWindow } from "@tauri-apps/api/window";
import { getCurrentWebviewWindow } from "@tauri-apps/api/webviewWindow";
import { open } from "@tauri-apps/plugin-dialog";
import { useStore } from "./store";
import { api, pickSavePath } from "./bridge";
import { getActiveEditorPort, claimClipboardOp } from "./editorPort";
import { openFileByPath, newUntitledTab, duplicateActiveTab, openFileFromUrl } from "./fileops";
import { persistTab, saveTabAs, syncFromDisk } from "./persist";
import { buildDiff } from "./diff";
import { applyTextTransform } from "./textTransforms";
import { renderMarkdown } from "./markdown";
import { dirname, join } from "./pathutil";
import { registerCommand, executeCommand } from "./commands";
import { getFileSystem } from "./fs";
import { HELP_FILE_NAME, HELP_MD } from "./helpDoc";
import type { TextTransform } from "./types";

// ---- App shell commands ----
//
// Every action the shell can take is registered here under a name and invoked
// via executeCommand(name). Native menu events, deep links, watcher events and
// in-app buttons all converge on these handlers — App.tsx only maps events to
// names, so commands are executable without Tauri running.

let currentZoom = 1;

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

function activeNativeEditable(): HTMLInputElement | HTMLTextAreaElement | null {
  const el = document.activeElement as HTMLElement | null;
  if (!el) return null;
  if (el.tagName === "INPUT" || el.tagName === "TEXTAREA") {
    return el as HTMLInputElement | HTMLTextAreaElement;
  }
  return null;
}

// Sync a programmatic DOM edit of a controlled input back into React state by
// re-emitting the `input` event that React's onChange listens for.
function syncControlledInput(el: HTMLInputElement | HTMLTextAreaElement): void {
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
function copyDomSelection(): boolean {
  const sel = window.getSelection();
  if (!sel || sel.isCollapsed || selectionInsideEditor(sel)) return false;
  const text = sel.toString();
  if (!text) return false;
  void navigator.clipboard.writeText(text);
  return true;
}

export function registerAppCommands(): void {
  // ---- documents ----
  registerCommand("new-file", () => void newUntitledTab());
  registerCommand("open-file", () => void handleOpenFile());
  registerCommand("open-folder", () => void handleOpenFolder());
  registerCommand("open-recent", (path) => void openFileByPath(String(path)));
  registerCommand("open-path", () => useStore.getState().setOpenPathOpen(true));
  registerCommand("open-from-url", () =>
    useStore.getState().setOpenUrlOpen(true),
  );
  registerCommand("open-url", (url) =>
    void openFileFromUrl(String(url)),
  );
  registerCommand("save", () => void saveActiveTab());
  registerCommand("save-as", () => void saveActiveTabAs());
  registerCommand("duplicate", () => void duplicateActiveTab());
  registerCommand("export-pdf", () => exportPdf());
  registerCommand("export-html", () => void exportHtml());
  registerCommand("close-tab", () => {
    const id = useStore.getState().activeTabId;
    if (id != null) useStore.getState().closeTab(id);
  });
  registerCommand("find-in-folder", () =>
    useStore.getState().setFindInFolderOpen(true),
  );

  // ---- editor ----
  registerCommand("undo", () => getActiveEditorPort()?.undo());
  registerCommand("redo", () => getActiveEditorPort()?.redo());
  registerCommand("cut", () => {
    if (!claimClipboardOp()) return;
    const el = activeNativeEditable();
    if (el) {
      const s = el.selectionStart ?? 0;
      const e = el.selectionEnd ?? 0;
      void navigator.clipboard.writeText(el.value.slice(s, e));
      el.setRangeText("", s, e, "end");
      syncControlledInput(el);
      return;
    }
    // The preview is not editable, so cutting a selection there is a no-op;
    // copy it instead (matches native cut-on-non-editable behavior).
    if (copyDomSelection()) return;
    getActiveEditorPort()?.cutSelection();
  });
  registerCommand("copy", () => {
    if (!claimClipboardOp()) return;
    const el = activeNativeEditable();
    if (el) {
      const s = el.selectionStart ?? 0;
      const e = el.selectionEnd ?? 0;
      void navigator.clipboard.writeText(el.value.slice(s, e));
      return;
    }
    // Selecting text in the preview (or anywhere outside the editor) and
    // pressing ⌘C must copy that selection, not the editor's.
    if (copyDomSelection()) return;
    getActiveEditorPort()?.copySelection();
  });
  registerCommand("paste", async () => {
    // If this gesture was already served by a native paste event (e.g. a
    // right-click paste, or a platform where the accelerator also emits a
    // native paste), skip the manual insert so we don't duplicate it.
    if (pasteGestureActive()) return;
    markPasteGesture();
    if (!claimClipboardOp()) return;
    const snap = snapshotEditable();
    const text = await navigator.clipboard.readText().catch(() => "");
    if (snap) {
      insertIntoEditable(snap, text);
      return;
    }
    getActiveEditorPort()?.paste(text);
  });
  registerCommand("select-all", () => getActiveEditorPort()?.selectAll());
  registerCommand("copy-file-content", () => {
    const t = useStore.getState().getActiveTab();
    if (t) void navigator.clipboard.writeText(t.content);
  });
  registerCommand("copy-selection-with-context", () => {
    const t = useStore.getState().getActiveTab();
    const port = getActiveEditorPort();
    if (t && port) {
      const sel = port.getSelection();
      void navigator.clipboard.writeText(
        `${t.filePath ?? t.name ?? "Untitled"}\n${sel.text}`,
      );
    }
  });
  registerCommand("text-transform", (t) => {
    const port = getActiveEditorPort();
    if (!port) return;
    const sel = port.getSelection();
    if (!sel.hasSelection) return;
    port.paste(applyTextTransform(t as TextTransform, sel.text));
  });
  registerCommand("goto-line", (line) => {
    getActiveEditorPort()?.navigateToLine(Number(line));
  });

  // ---- window / view ----
  registerCommand("focus-mode", () => {
    const s = useStore.getState();
    s.setFocusMode(!s.focusMode);
  });
  registerCommand("close-window", () => void getCurrentWindow().close());
  registerCommand("minimize", () => void getCurrentWindow().minimize());
  registerCommand("toggle-maximize", () => void getCurrentWindow().toggleMaximize());
  registerCommand("toggle-fullscreen", async () => {
    const w = getCurrentWindow();
    await w.setFullscreen(!(await w.isFullscreen()));
  });
  registerCommand("reload", () => location.reload());
  registerCommand("toggle-devtools", () => {
    useStore
      .getState()
      .pushToast("DevTools are available in debug builds", "info");
  });
  registerCommand("reset-zoom", () => {
    currentZoom = 1;
    void getCurrentWebviewWindow().setZoom(1);
  });
  registerCommand("zoom-in", () => {
    currentZoom = Math.min(3, Math.round((currentZoom + 0.1) * 10) / 10);
    void getCurrentWebviewWindow().setZoom(currentZoom);
  });
  registerCommand("zoom-out", () => {
    currentZoom = Math.max(0.5, Math.round((currentZoom - 0.1) * 10) / 10);
    void getCurrentWebviewWindow().setZoom(currentZoom);
  });

  // ---- app shell ----
  registerCommand("about", () => useStore.getState().setAboutOpen(true));
  registerCommand("settings", () => useStore.getState().setSettingsOpen(true));
  registerCommand("help", () => void openHelpFile());
  registerCommand("open-external", (url) => void api.openExternal(String(url)));
  registerCommand("clear-recents", () => {
    const s = useStore.getState();
    s.updateSettings({ recentFiles: [], recentDirectories: [] });
    void api.setSettings({ ...s.settings, recentFiles: [], recentDirectories: [] });
  });

  // ---- backend events (watchers, deep links) ----
  registerCommand("file-changed", (payload) => {
    const p = payload as { path: string; content: string };
    const st = useStore.getState();
    const tab = st.tabs.find((t) => t.filePath === p.path);
    if (!tab) return;
    if (tab.dirty) {
      st.setDiffData(buildDiff(p.path, tab.content, p.content));
      st.pushToast("File changed on disk — merge needed", "warning");
    } else {
      // The file already contains `content` on disk; reconcile the tab and
      // the editor document without writing anything back.
      void syncFromDisk(tab.id, p.path, p.content);
    }
  });
  registerCommand("directory-changed", (payload) => {
    const p = payload as { path: string };
    const st = useStore.getState();
    if (
      st.folderPath &&
      (st.folderPath === p.path || st.folderPath.startsWith(p.path + "/"))
    ) {
      void st.refreshTree();
    }
  });
  registerCommand("deep-link", (arg) => handleDeepLink(String(arg)));
}

async function handleOpenFile() {
  const p = (await open({
    multiple: false,
    filters: [
      { name: "Markdown", extensions: ["md", "markdown", "mdown", "mkd", "txt"] },
    ],
  })) as string | null;
  if (p) await openFileByPath(p);
}

async function handleOpenFolder() {
  const p = (await open({ directory: true, multiple: false })) as string | null;
  if (p) {
    const st = useStore.getState();
    st.setFolderPath(p);
    st.addRecentDirectory(p);
  }
}

async function saveActiveTab() {
  const st = useStore.getState();
  const tab = st.getActiveTab();
  if (!tab) return;
  if (tab.filePath) {
    await persistTab(tab.id, tab.content);
  } else {
    await saveActiveTabAs();
  }
}

async function saveActiveTabAs() {
  const st = useStore.getState();
  const tab = st.getActiveTab();
  if (!tab) return;
  const def = tab.filePath ?? (tab.name ? dirname("") + tab.name : "untitled.md");
  const p = await pickSavePath(def);
  if (p) {
    const ok = await saveTabAs(tab.id, p);
    if (ok) useStore.getState().addRecentDirectory(dirname(p));
  }
}

function exportPdf() {
  const tab = useStore.getState().getActiveTab();
  if (!tab) return;
  // The print stylesheet isolates .preview for printing. Print the window
  // that initiated the export (matters for focus/additional windows).
  void api.printWindow(getCurrentWindow().label);
}

async function exportHtml() {
  const st = useStore.getState();
  const tab = st.getActiveTab();
  if (!tab) return;
  const html = renderMarkdown(tab.content);
  const full = `<!doctype html><html><head><meta charset="utf-8"><title>${
    tab.name ?? "document"
  }</title><style>body{font-family:-apple-system,BlinkMacSystemFont,'Helvetica Neue',Arial,sans-serif;max-width:720px;margin:40px auto;padding:0 20px;line-height:1.6}pre{background:#f5f5f7;padding:12px 14px;border-radius:6px;overflow-x:auto}code{font-family:'SF Mono',Menlo,monospace}img{max-width:100%}table{border-collapse:collapse}th,td{border:1px solid #ddd;padding:6px 10px}</style></head><body class="markdown-body">${html}</body></html>`;
  const def = tab.filePath ? tab.filePath.replace(/\.md$/i, ".html") : "document.html";
  const p = await pickSavePath(def);
  if (p) {
    try {
      await api.exportHtml(p, full);
      st.pushToast("Exported HTML", "success");
    } catch (e) {
      st.pushToast(`Export failed: ${String(e)}`, "error");
    }
  }
}

// Create (if missing) and open the markdown feature guide in the user's home
// directory. Clicking Help again just focuses the existing file.
async function openHelpFile() {
  const home = await api.homeDir();
  const path = join(home, HELP_FILE_NAME);
  const exists = await getFileSystem().fileExists(path);
  if (!exists) {
    try {
      await getFileSystem().writeFile(path, HELP_MD);
    } catch (e) {
      useStore.getState().pushToast(`Could not create help file: ${String(e)}`, "error");
      return;
    }
  }
  const id = await openFileByPath(path);
  if (id == null) {
    useStore.getState().pushToast("Could not open the help file.", "error");
  }
}

function handleDeepLink(arg: string) {
  // macOS double-click / file association: a local file path arrives as a
  // file:// URL. Open it directly (the deep-link plugin forwards these via
  // RunEvent::Opened -> "deep-link://new-url").
  if (arg.startsWith("file://")) {
    let path = arg;
    try {
      path = new URL(arg).pathname;
    } catch {
      /* keep the raw value if it isn't a parseable URL */
    }
    void openFileByPath(path);
    return;
  }
  try {
    const u = new URL(arg);
    const path = u.searchParams.get("path");
    const line = u.searchParams.get("line");
    if (path) {
      void openFileByPath(path).then(() => {
        if (line) void executeCommand("goto-line", Number(line));
      });
    }
  } catch {
    /* ignore malformed */
  }
}
