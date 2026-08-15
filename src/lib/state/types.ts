import type {
  DiffData,
  Favorite,
  FileEntry,
  Settings,
  Tab,
  ToastItem,
  ViewMode,
} from "../types";

export type UpdateInfo = {
  version: string;
  notes: string;
  body: string;
};

/// Lifecycle of a background auto-update, surfaced in the sidebar status region.
/// - `idle`: no update in flight (up to date, or not yet checked)
/// - `downloading`: update found, downloading in the background
/// - `ready`: download finished, waiting for the user to click "Restart to update"
/// - `error`: download failed
export type UpdateStatus = "idle" | "downloading" | "ready" | "error";

// ---- Shell slice — App shell context ----
// Windows, menus, tabs-as-UI, dialogs, session, settings, toasts
// (see CONTEXT.md "App shell context").
export interface ShellSlice {
  settings: Settings;
  setSettings: (s: Settings) => void;
  updateSettings: (patch: Partial<Settings>) => void;

  viewMode: ViewMode;
  focusMode: boolean;
  sidebarVisible: boolean;
  setViewMode: (m: ViewMode) => void;
  setFocusMode: (v: boolean) => void;
  setSidebarVisible: (v: boolean) => void;

  settingsOpen: boolean;
  aboutOpen: boolean;
  openPathOpen: boolean;
  openUrlOpen: boolean;
  findInFolderOpen: boolean;
  diffData: DiffData | null;
  updateInfo: UpdateInfo | null;
  updateStatus: UpdateStatus;
  updateProgress: { downloaded: number; total: number | null };
  updateArchivePath: string | null;
  setSettingsOpen: (v: boolean) => void;
  setAboutOpen: (v: boolean) => void;
  setOpenPathOpen: (v: boolean) => void;
  setOpenUrlOpen: (v: boolean) => void;
  setFindInFolderOpen: (v: boolean) => void;
  setDiffData: (d: DiffData | null) => void;
  setUpdateInfo: (u: UpdateInfo | null) => void;
  setUpdateStatus: (s: UpdateStatus) => void;
  setUpdateProgress: (p: { downloaded: number; total: number | null }) => void;
  setUpdateArchivePath: (p: string | null) => void;

  toasts: ToastItem[];
  pushToast: (message: string, type?: ToastItem["type"]) => void;
  dismissToast: (id: number) => void;

  addRecentFile: (path: string) => void;
  addRecentDirectory: (dir: string) => void;
}

// ---- Tabs slice — Editor context ----
// The document model (one Tab = one document + its per-tab CodeMirror state)
// and the transitions that keep content / savedContent / dirty in lockstep.
export interface TabsSlice {
  tabs: Tab[];
  activeTabId: number | null;
  nextTabId: number;
  addTab: (tab: Omit<Tab, "id">) => number;
  closeTab: (id: number) => void;
  setActiveTab: (id: number) => void;
  updateTabContent: (id: number, content: string) => void;
  setTabSaved: (id: number, savedContent: string) => void;
  setTabName: (id: number, name: string | null, filePath: string | null) => void;
  getActiveTab: () => Tab | null;
}

// ---- File browser slice — File system context ----
// Browser tree, favorites, directory listing caches, watchers-triggered
// reloads. All disk reads go through the FileSystem seam (lib/fs.ts).
export interface FileBrowserSlice {
  folderPath: string | null;
  selectedPath: string | null;
  favorites: Favorite[];
  dirChildren: Record<string, FileEntry[]>;
  dirErrors: Record<string, string>;
  expandedDirs: Record<string, boolean>;
  loadingDirs: Record<string, boolean>;
  setFolderPath: (p: string | null) => void;
  setSelectedPath: (p: string | null) => void;
  setFavorites: (f: Favorite[]) => void;
  addFavorite: (f: Favorite) => void;
  removeFavorite: (f: Favorite) => void;
  setDirChildren: (path: string, entries: FileEntry[]) => void;
  setDirError: (path: string, error: string) => void;
  setExpanded: (path: string, expanded: boolean) => void;
  setLoading: (path: string, loading: boolean) => void;
  loadDir: (path: string) => Promise<void>;
  refreshTree: () => Promise<void>;
}

export type AppState = ShellSlice & TabsSlice & FileBrowserSlice;
