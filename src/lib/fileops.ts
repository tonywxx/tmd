import { useStore } from "./store";
import { getFileSystem } from "./fs";
import { isMarkdown } from "./constants";
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
    requestGitBaseline(existing.id, path);
    return existing.id;
  }
  if (!isMarkdown(path)) {
    store.pushToast("Not a markdown file.", "warning");
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
