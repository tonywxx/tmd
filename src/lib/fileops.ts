import { useStore } from "./store";
import { getFileSystem } from "./fs";
import { isOpenable, MAX_OPEN_BYTES } from "./constants";
import { dirname } from "./pathutil";
import { gitBaselineRef } from "./refs";
import { getActiveEditorPort } from "./editorPort";

// Open (or focus) a file path in a tab. Returns the tab id.
export async function openFileByPath(path: string): Promise<number | null> {
  const store = useStore.getState();
  // focus existing tab if already open
  const existing = store.tabs.find((t) => t.filePath === path);
  if (existing) {
    store.setActiveTab(existing.id);
    store.setSelectedPath(path);
    // An explicit open (double-click, menu, deep link…) makes a preview tab
    // permanent.
    if (store.previewTabId === existing.id) store.setPreviewTab(null);
    requestGitBaseline(existing.id, path);
    return existing.id;
  }
  if (!isOpenable(path)) {
    store.pushToast("Not a text file.", "warning");
    return null;
  }
  let content = "";
  try {
    content = await getFileSystem().readFile(path);
  } catch (e) {
    store.pushToast(`Could not open file: ${String(e)}`, "error");
    return null;
  }
  // Re-check after the await: a concurrent openFileByPath call (e.g. React
  // StrictMode double-mounting during session restore) may have created the
  // tab while we were reading. Focus it instead of duplicating.
  const latest = useStore.getState();
  const raced = latest.tabs.find((t) => t.filePath === path);
  if (raced) {
    latest.setActiveTab(raced.id);
    latest.setSelectedPath(path);
    if (latest.previewTabId === raced.id) latest.setPreviewTab(null);
    requestGitBaseline(raced.id, path);
    return raced.id;
  }
  const id = latest.addTab({
    name: path.split("/").pop() ?? path,
    filePath: path,
    content,
    savedContent: content,
    dirty: false,
  });
  store.setSelectedPath(path);
  store.addRecentFile(path);
  try {
    await getFileSystem().watchFile(path);
  } catch {
    /* ignore */
  }
  requestGitBaseline(id, path);
  return id;
}

// Single-click entry point from the file browser: open the file in the
// preview (temporary) tab. Only one preview tab exists — clicking another file
// closes the previous preview and opens the new one. The tab itself is created
// EXACTLY like a double-click (openFileByPath / addTab, no preview-specific
// styling or extra state), and is promoted to a permanent tab when edited or
// explicitly opened (double-click).
export async function previewFileByPath(path: string): Promise<number | null> {
  const store = useStore.getState();
  // If the file is already open, focus it without changing its status.
  const existing = store.tabs.find((t) => t.filePath === path);
  if (existing) {
    store.setActiveTab(existing.id);
    store.setSelectedPath(path);
    requestGitBaseline(existing.id, path);
    return existing.id;
  }
  // A stray click on a non-text file is silently ignored (no toast).
  if (!isOpenable(path)) return null;
  // Replace the previous preview tab, then open the new file through the same
  // path as the "+" (new tab) button and double-click.
  const previewId = store.previewTabId;
  if (previewId != null && store.tabs.some((t) => t.id === previewId)) {
    store.closeTab(previewId);
  }
  const id = await openFileByPath(path);
  if (id != null) store.setPreviewTab(id);
  return id;
}

// Entry point for single clicks in the file browser. Non-openable files are
// silently ignored (a click is not an explicit "open this"), and anything over
// the size cap is refused up front so a stray click cannot pull a huge file
// into memory — previewFileByPath reads the whole file with no such check.
export async function openFileFromBrowser(path: string): Promise<void> {
  if (!isOpenable(path)) return;
  const stat = await getFileSystem().fileStat(path).catch(() => null);
  if (stat && stat.size > MAX_OPEN_BYTES) {
    useStore
      .getState()
      .pushToast(
        `File is too large to open (max ${MAX_OPEN_BYTES / 1024 / 1024} MB).`,
        "error",
      );
    return;
  }
  await previewFileByPath(path);
}

export function requestGitBaseline(id: number, path: string) {
  void getFileSystem().gitBaseline(path).then((baseline) => {
    if (baseline != null) {
      gitBaselineRef.set(id, baseline);
      // Force the active editor's changed-lines gutter to recompute now that
      // the baseline is available. The active editor reads its own tab's
      // baseline from the ref, so this is safe regardless of which tab `id` is.
      getActiveEditorPort()?.updateGitMarkers();
    }
  });
}

// Create a new, unsaved tab (no file path yet).
export function newUntitledTab(): number {
  const store = useStore.getState();
  let n = 1;
  const names = new Set(store.tabs.map((t) => t.name));
  while (names.has(`Untitled-${n}.md`)) n++;
  return store.addTab({
    name: `Untitled-${n}.md`,
    filePath: null,
    content: "",
    savedContent: "",
    dirty: false,
  });
}

export async function duplicateActiveTab(): Promise<void> {
  const store = useStore.getState();
  const tab = store.getActiveTab();
  if (!tab) return;
  if (tab.filePath) {
    const dir = dirname(tab.filePath);
    const base = (tab.name ?? "copy.md").replace(/(\.[^.]+)?$/, " copy$1");
    const dest = `${dir}/${base}`;
    try {
      await getFileSystem().writeFile(dest, tab.content);
      await openFileByPath(dest);
    } catch (e) {
      store.pushToast(`Duplicate failed: ${String(e)}`, "error");
    }
  } else {
    store.addTab({
      name: tab.name ?? "Untitled.md",
      filePath: null,
      content: tab.content,
      savedContent: tab.content,
      dirty: false,
    });
  }
}

// Open a remote markdown document fetched over HTTP(S) as a tab. The tab has
// no local filePath; its source URL is remembered on `sourceUrl` so Save can
// default to the original filename and the tab bar can show a link indicator.
export async function openFileFromUrl(url: string): Promise<number | null> {
  const store = useStore.getState();
  const trimmed = url.trim().replace(/\s+/g, "");
  if (!/^https?:\/\//i.test(trimmed)) {
    store.pushToast("Enter a valid http(s) URL", "error");
    return null;
  }
  // focus an existing tab opened from the same URL
  const existing = store.tabs.find((t) => t.sourceUrl === trimmed);
  if (existing) {
    store.setActiveTab(existing.id);
    return existing.id;
  }
  let res: Response;
  try {
    res = await fetch(trimmed, { redirect: "follow" });
  } catch (e) {
    store.pushToast(`Could not fetch URL: ${String(e)}`, "error");
    return null;
  }
  if (!res.ok) {
    store.pushToast(`Fetch failed: HTTP ${res.status}`, "error");
    return null;
  }
  if ((res.headers.get("content-length") ?? "0") !== "0") {
    const len = Number(res.headers.get("content-length"));
    if (len > 10 * 1024 * 1024) {
      store.pushToast("File is too large to open (max 10 MB)", "error");
      return null;
    }
  }
  let content: string;
  try {
    content = await res.text();
  } catch (e) {
    store.pushToast(`Could not read response: ${String(e)}`, "error");
    return null;
  }
  if (content.length > 10 * 1024 * 1024) {
    store.pushToast("File is too large to open (max 10 MB)", "error");
    return null;
  }
  const name = nameFromUrl(trimmed);
  const id = store.addTab({
    name,
    filePath: null,
    sourceUrl: trimmed,
    content,
    savedContent: content,
    dirty: false,
  });
  return id;
}

function nameFromUrl(url: string): string {
  try {
    const u = new URL(url);
    const base = decodeURIComponent(u.pathname.split("/").pop() ?? "");
    if (base && base !== "") return base;
    return u.hostname;
  } catch {
    return "untitled.md";
  }
}
