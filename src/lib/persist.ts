import { useStore } from "./store";
import { getFileSystem } from "./fs";
import { replaceContentForTab } from "./editorPort";

// ---- Tab persistence module ----
//
// Every save path in the app — toolbar save/save-as, autosave, focus-mode
// autosave, three-way merge resolution, external file change — funnels through
// here. Persisting a tab owns a fixed set of side effects that used to be
// re-implemented at eight call sites and drifted apart:
//
//   write file → mark tab saved (dirty=false) → refresh recents
//
// `applyExternalContent` additionally reconciles the live editor document,
// because content that did NOT originate from the editor itself (a merge
// result, an external change) must be pushed into CodeMirror explicitly —
// otherwise the next keystroke replays from a stale document and clobbers it.

/**
 * Write `content` for the tab `id` to its own on-disk path. Returns false when
 * the tab has no path — callers fall back to Save As.
 */
export async function persistTab(id: number, content: string): Promise<boolean> {
  const store = useStore.getState();
  const tab = store.tabs.find((t) => t.id === id);
  if (!tab || !tab.filePath) return false;
  try {
    await getFileSystem().writeFile(tab.filePath, content);
    store.setTabSaved(id, content);
    store.addRecentFile(tab.filePath);
    return true;
  } catch (e) {
    store.pushToast(`Save failed: ${String(e)}`, "error");
    return false;
  }
}

/**
 * Persist `content` to an explicit path (Save As, merge dialog) without
 * rebinding the tab's own path.
 */
export async function persistTabToPath(
  id: number,
  path: string,
  content: string,
): Promise<boolean> {
  const store = useStore.getState();
  try {
    await getFileSystem().writeFile(path, content);
    store.setTabSaved(id, content);
    store.addRecentFile(path);
    return true;
  } catch (e) {
    store.pushToast(`Save failed: ${String(e)}`, "error");
    return false;
  }
}

/**
 * Save As: persist under `path`, then rebind the tab to it and start watching
 * the new location.
 */
export async function saveTabAs(id: number, path: string): Promise<boolean> {
  const store = useStore.getState();
  const tab = store.tabs.find((t) => t.id === id);
  if (!tab) return false;
  const ok = await persistTabToPath(id, path, tab.content);
  if (ok) {
    store.setTabName(id, path.split("/").pop() ?? path, path);
    void watchFile(path);
  }
  return ok;
}

/**
 * Persist externally-sourced content (merge result / disk change) and push it
 * into the live editor document when the target tab is the mounted one.
 */
export async function applyExternalContent(
  id: number,
  path: string,
  content: string,
): Promise<boolean> {
  const ok = await persistTabToPath(id, path, content);
  if (ok) replaceContentForTab(id, content);
  return ok;
}

/**
 * Reconcile a tab with content that already lives on disk (external change to
 * a non-dirty tab): mark it saved and refresh the editor document, but do not
 * write anything back.
 */
export async function syncFromDisk(
  id: number,
  _path: string,
  content: string,
): Promise<void> {
  const store = useStore.getState();
  store.setTabSaved(id, content);
  replaceContentForTab(id, content);
}

export async function watchFile(path: string): Promise<void> {
  try {
    await getFileSystem().watchFile(path);
  } catch {
    /* watcher setup is best-effort */
  }
}
