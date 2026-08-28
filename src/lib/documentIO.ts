import { open } from "@tauri-apps/plugin-dialog";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { useStore } from "./store";
import { pickSavePath } from "./bridge";
import { getBackend } from "./backend";
import { getFileSystem } from "./fs";
import { openFileByPath } from "./fileops";
import { persistTab, saveTabAs } from "./persist";
import { renderMarkdown } from "./markdown";
import { dirname, join } from "./pathutil";
import { executeCommand } from "./commands";
import { HELP_FILE_NAME, HELP_MD } from "./helpDoc";
import type { Theme } from "./types";
// Standalone markdown-theme stylesheet, inlined into exported HTML so the
// document carries its chosen theme without depending on the app.
import markdownThemesCss from "./markdown-themes.css?raw";

// ---- Tab I/O module ----
//
// Owns the full open↔save lifecycle of a tab: open from picker/URL/deep-link,
// save, save-as, export to PDF/HTML, and the help guide. Previously these
// handlers were scattered across fileops.ts, persist.ts and inline in
// appCommands.ts; concentrating them here gives locality (one place owns the
// document lifecycle) and leverage (every entry point funnels through the same
// handlers). appCommands.ts only wires events to these names.

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
  void getBackend().printWindow(getCurrentWindow().label);
}

async function exportHtml() {
  const st = useStore.getState();
  const tab = st.getActiveTab();
  if (!tab) return;
  const html = renderMarkdown(tab.content);
  const dark = resolveDark(st.settings.theme);
  const title = escapeHtml(tab.name ?? "document");
  const full = `<!doctype html><html lang="en" data-theme="${
    dark ? "dark" : "light"
  }"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${title}</title><style>
${CHROME_VARS}
html,body{margin:0;padding:0}
.md-export-col{max-width:780px;margin:0 auto;padding:40px 48px;min-height:100vh;box-sizing:border-box}
${markdownThemesCss}
</style></head><body class="markdown-body theme-${st.settings.markdownTheme}"><div class="md-export-col">${html}</div></body></html>`;
  const def = tab.filePath ? tab.filePath.replace(/\.md$/i, ".html") : "document.html";
  const p = await pickSavePath(def);
  if (p) {
    try {
      await getBackend().exportHtml(p, full);
      st.pushToast("Exported HTML", "success");
    } catch (e) {
      st.pushToast(`Export failed: ${String(e)}`, "error");
    }
  }
}

// Resolve the effective light/dark mode for export (system follows the OS).
function resolveDark(theme: Theme): boolean {
  if (theme === "dark") return true;
  if (theme === "light") return false;
  return (
    typeof window !== "undefined" &&
    !!window.matchMedia &&
    window.matchMedia("(prefers-color-scheme: dark)").matches
  );
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

// App chrome variables so the "github" theme (which falls back to them) renders
// correctly outside the app, with light + dark variants selected by data-theme.
const CHROME_VARS = `:root{--bg:#f5f5f7;--border:#d8d8de;--code-bg:#ececf0;--accent:#3b82f6;--text:#1d1f24;--text-dim:#6b7280;--preview-font:-apple-system,BlinkMacSystemFont,"Helvetica Neue",Arial,sans-serif}
:root[data-theme="dark"]{--bg:#1a1d23;--border:#333a45;--code-bg:#2a2f39;--accent:#3b82f6;--text:#d4d7de;--text-dim:#8b93a3;--preview-font:-apple-system,BlinkMacSystemFont,"Helvetica Neue",Arial,sans-serif}`;

// Create (if missing) and open the markdown feature guide in the user's home
// directory. Clicking Help again just focuses the existing file.
async function openHelpFile() {
  const home = await getBackend().homeDir();
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
      // macOS delivers a percent-encoded file:// URL (e.g. Chinese filenames
      // become %E4%B8%AD...). pathname keeps that encoding, so decode it back
      // to the real filesystem path before opening.
      path = decodeURIComponent(new URL(arg).pathname);
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

export {
  handleOpenFile,
  handleOpenFolder,
  saveActiveTab,
  saveActiveTabAs,
  exportPdf,
  exportHtml,
  openHelpFile,
  handleDeepLink,
};
