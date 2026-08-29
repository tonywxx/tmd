import type { StateCreator } from "zustand";
import type { AppState, FileBrowserSlice } from "./types";
import { getFileSystem } from "../fs";
import { dirname } from "../pathutil";
import { favEq } from "../types";

export const createFileBrowserSlice: StateCreator<
  AppState,
  [],
  [],
  FileBrowserSlice
> = (set, get) => ({
  folderPath: null,
  selectedPath: null,
  favorites: [],
  dirChildren: {},
  dirErrors: {},
  expandedDirs: {},
  loadingDirs: {},
  setFolderPath: (p) => {
    set({
      folderPath: p,
      dirChildren: {},
      dirErrors: {},
      expandedDirs: {},
      loadingDirs: {},
    });
    // Always (re)load the new root here, even when p equals the current
    // folderPath: the reset above clears dirChildren, and the FileBrowser
    // effect would not re-fire for an unchanged path value.
    if (p) void get().loadDir(p);
  },
  setSelectedPath: (p) => set({ selectedPath: p }),
  setFavorites: (f) => set({ favorites: f }),
  addFavorite: (f) =>
    set((state) =>
      state.favorites.some((x) => favEq(x, f))
        ? {}
        : { favorites: [...state.favorites, f] },
    ),
  removeFavorite: (f) =>
    set((state) => ({
      favorites: state.favorites.filter((x) => !favEq(x, f)),
    })),
  setDirChildren: (path, entries) =>
    set((state) => ({ dirChildren: { ...state.dirChildren, [path]: entries } })),
  setDirError: (path, error) =>
    set((state) => ({ dirErrors: { ...state.dirErrors, [path]: error } })),
  setExpanded: (path, expanded) =>
    set((state) => {
      const next = { ...state.expandedDirs };
      if (expanded) next[path] = true;
      else delete next[path];
      return { expandedDirs: next };
    }),
  setLoading: (path, loading) =>
    set((state) => {
      const next = { ...state.loadingDirs };
      if (loading) next[path] = true;
      else delete next[path];
      return { loadingDirs: next };
    }),
  loadDir: async (path) => {
    get().setLoading(path, true);
    try {
      const list = await getFileSystem().readDirectory(path);
      get().setDirChildren(path, list);
      get().setDirError(path, "");
    } catch (e) {
      get().setDirError(path, String(e));
    } finally {
      get().setLoading(path, false);
    }
  },
  // Select `target`, expanding (and loading) the tree down to it only when it
  // is not already on screen. Opening a file must not move the tree, so this
  // is reserved for explicit reveals: launch-time restore and tab switches.
  revealPath: async (target) => {
    const { folderPath, expandedDirs } = get();
    get().setSelectedPath(target);
    // Boundary-aware: "/Users/tony/x.md" is under "/Users/tony", but
    // "/Users/tonyfoo/x.md" is not.
    if (!folderPath || !target.startsWith(folderPath + "/")) return;
    const chain: string[] = [];
    let cur = dirname(target);
    while (cur.length > folderPath.length) {
      chain.unshift(cur);
      const next = dirname(cur);
      if (next === cur) break;
      cur = next;
    }
    // Already visible: selecting it is enough, re-reading the tree would just
    // make every tab switch churn the directory listings.
    if (chain.every((dir) => expandedDirs[dir])) return;
    for (const dir of chain) {
      get().setExpanded(dir, true);
      await get().loadDir(dir);
    }
  },
  refreshTree: async () => {
    const { folderPath, expandedDirs } = get();
    if (folderPath) await get().loadDir(folderPath);
    await Promise.all(Object.keys(expandedDirs).map((dir) => get().loadDir(dir)));
  },
});
