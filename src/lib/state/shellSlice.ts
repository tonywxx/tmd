import type { StateCreator } from "zustand";
import type { AppState, ShellSlice } from "./types";
import { DEFAULT_SETTINGS } from "../constants";
import { api } from "../bridge";

let toastSeq = 1;

export const createShellSlice: StateCreator<AppState, [], [], ShellSlice> = (
  set,
  get,
) => ({
  settings: DEFAULT_SETTINGS,
  setSettings: (s) => set({ settings: s }),
  updateSettings: (patch) =>
    set((state) => ({ settings: { ...state.settings, ...patch } })),

  viewMode: "split",
  focusMode: false,
  sidebarVisible: true,
  setViewMode: (m) => set({ viewMode: m }),
  setFocusMode: (v) => set({ focusMode: v }),
  setSidebarVisible: (v) => set({ sidebarVisible: v }),

  settingsOpen: false,
  aboutOpen: false,
  openPathOpen: false,
  findInFolderOpen: false,
  diffData: null,
  updateInfo: null,
  updateStatus: "idle",
  updateProgress: { downloaded: 0, total: null },
  updateArchivePath: null,
  setSettingsOpen: (v) => set({ settingsOpen: v }),
  setAboutOpen: (v) => set({ aboutOpen: v }),
  setOpenPathOpen: (v) => set({ openPathOpen: v }),
  setFindInFolderOpen: (v) => set({ findInFolderOpen: v }),
  setDiffData: (d) => set({ diffData: d }),
  setUpdateInfo: (u) => set({ updateInfo: u }),
  setUpdateStatus: (s) => set({ updateStatus: s }),
  setUpdateProgress: (p) => set({ updateProgress: p }),
  setUpdateArchivePath: (p) => set({ updateArchivePath: p }),

  toasts: [],
  pushToast: (message, type = "info") =>
    set((state) => ({
      toasts: [...state.toasts, { id: toastSeq++, message, type }],
    })),
  dismissToast: (id) =>
    set((state) => ({ toasts: state.toasts.filter((t) => t.id !== id) })),

  // Recent paths are settings fields; both the browser and the native menu
  // read them, so prepend-and-cap here instead of at each call site.
  addRecentFile: (path) => {
    set((state) => {
      const recent = state.settings.recentFiles.filter((p) => p !== path);
      return {
        settings: {
          ...state.settings,
          recentFiles: [path, ...recent].slice(0, 20),
        },
      };
    });
    void api.setSettings(get().settings);
  },
  addRecentDirectory: (dir) => {
    set((state) => {
      const recent = state.settings.recentDirectories.filter((p) => p !== dir);
      return {
        settings: {
          ...state.settings,
          recentDirectories: [dir, ...recent].slice(0, 20),
        },
      };
    });
    void api.setSettings(get().settings);
  },
});
