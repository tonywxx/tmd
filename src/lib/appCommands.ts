import { getCurrentWindow } from "@tauri-apps/api/window";
import { getCurrentWebviewWindow } from "@tauri-apps/api/webviewWindow";
import { open } from "@tauri-apps/plugin-dialog";
import { useStore } from "./store";
import { api, pickSavePath } from "./bridge";
import { getActiveEditorPort } from "./editorPort";
import { openFileByPath, newUntitledTab, duplicateActiveTab } from "./fileops";
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

export function registerAppCommands(): void {
  // ---- documents ----
  registerCommand("new-file", () => void newUntitledTab());
  registerCommand("open-file", () => void handleOpenFile());
  registerCommand("open-folder", () => void handleOpenFolder());
  registerCommand("open-recent", (path) => void openFileByPath(String(path)));
  registerCommand("open-path", () => useStore.getState().setOpenPathOpen(true));
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
  registerCommand("cut", () => getActiveEditorPort()?.cutSelection());
  registerCommand("copy", () => getActiveEditorPort()?.copySelection());
  registerCommand("paste", async () => {
    const text = await navigator.clipboard.readText().catch(() => "");
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
