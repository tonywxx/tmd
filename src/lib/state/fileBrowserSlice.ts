import type { StateCreator } from "zustand";
import type { AppState, FileBrowserSlice } from "./types";
import { getFileSystem } from "../fs";
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
  refreshTree: async () => {
    const { folderPath, expandedDirs } = get();
    if (folderPath) await get().loadDir(folderPath);
    await Promise.all(Object.keys(expandedDirs).map((dir) => get().loadDir(dir)));
  },
});
