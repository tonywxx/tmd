import { invoke } from "@tauri-apps/api/core";
import { ask, message as dialogMessage, save } from "@tauri-apps/plugin-dialog";
import type {
  FileEntry,
  FileStat,
  ResolvedPath,
  SearchResult,
  Session,
  Settings,
  WindowBounds,
} from "./types";

// ---- typed IPC wrappers (mirror of the Rust command layer) ----
export const api = {
  readFile: (path: string) => invoke<string>("read_file", { path }),
  writeFile: (path: string, content: string) =>
    invoke<void>("write_file", { path, content }),
  writeFileBase64: (path: string, data: string) =>
    invoke<void>("write_file_base64", { path, data }),
  readDirectory: (path: string) =>
    invoke<FileEntry[]>("read_directory", { path }),
  fileStat: (path: string) => invoke<FileStat | null>("file_stat", { path }),
  fileExists: (path: string) => invoke<boolean>("file_exists", { path }),
  resolvePath: (input: string, base?: string) =>
    invoke<ResolvedPath | null>("file_resolve_path", { input, base }),
  rename: (oldPath: string, newPath: string) =>
    invoke<void>("file_rename", { oldPath, newPath }),
  mkdir: (path: string) => invoke<void>("file_mkdir", { path }),
  create: (path: string) => invoke<void>("file_create", { path }),
  trash: (path: string) => invoke<void>("file_trash", { path }),
  showInFolder: (path: string) => invoke<void>("file_show_in_folder", { path }),
  searchInFolder: (path: string, query: string, caseSensitive: boolean) =>
    invoke<SearchResult>("search_in_folder", { path, query, caseSensitive }),
  exportHtml: (path: string, html: string) =>
    invoke<void>("export_html", { path, html }),
  watchFile: (path: string) => invoke<void>("watch_file_cmd", { path }),
  unwatchFile: (path: string) => invoke<void>("unwatch_file_cmd", { path }),
  watchDirectory: (path: string) => invoke<void>("watch_directory_cmd", { path }),
  unwatchDirectory: (path: string) =>
    invoke<void>("unwatch_directory_cmd", { path }),
  gitBaseline: (path: string) => invoke<string | null>("git_get_baseline", { path }),
  getSettings: () => invoke<Settings>("settings_get"),
  setSettings: (settings: Settings) =>
    invoke<void>("settings_set", { settings }),
  getRecentFiles: () => invoke<string[]>("recent_get_files"),
  addRecentFile: (path: string) => invoke<void>("recent_add_file", { path }),
  getSession: (windowId: string) => invoke<Session | null>("session_get", { windowId }),
  setSession: (windowId: string, session: Session) =>
    invoke<void>("session_set", { windowId, session }),
  appVersion: () => invoke<string>("app_version"),
  homeDir: () => invoke<string>("app_home_dir"),
  openExternal: (url: string) => invoke<void>("app_open_external", { url }),
  isImageAllowed: (path: string) => invoke<boolean>("is_image_allowed", { path }),
  imageDataUri: (path: string) => invoke<string | null>("image_data_uri", { path }),
  focusOpenWindow: (filePath: string, tabId: number, parentWindowId: string) =>
    invoke<string>("focus_open_window", { filePath, tabId, parentWindowId }),
  focusBringToFront: (tabId: number) =>
    invoke<void>("focus_bring_to_front", { tabId }),
  printWindow: (label: string) => invoke<void>("print_window", { label }),
  updateGlobalHotkey: (settings: Settings) =>
    invoke<void>("update_global_hotkey_cmd", { settings }),
};

// ---- native dialogs ----
const MD_FILTERS = [
  { name: "Markdown", extensions: ["md", "markdown", "mdown", "mkd", "txt"] },
  { name: "All Files", extensions: ["*"] },
];

export async function pickSavePath(defaultPath?: string): Promise<string | null> {
  return (await save({
    defaultPath,
    filters: MD_FILTERS,
  })) as string | null;
}

const PNG_FILTERS = [{ name: "PNG Image", extensions: ["png"] }];

export async function pickSaveImagePath(defaultPath?: string): Promise<string | null> {
  return (await save({
    defaultPath,
    filters: PNG_FILTERS,
  })) as string | null;
}

export async function confirmDialog(
  message: string,
  title = "tmd",
): Promise<boolean> {
  return await ask(message, { title, kind: "warning" });
}

export async function messageDialog(
  message: string,
  title = "tmd",
): Promise<void> {
  await dialogMessage(message, { title });
}
