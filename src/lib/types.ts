// Domain model for tmd — mirrors the Rust `types.rs`.

export type Theme = "system" | "dark" | "light";

// Visual styles for the rendered markdown preview. "github" follows the app's
// light/dark chrome; the rest restyle the preview independently.
export type MarkdownTheme =
  | "github"
  | "academic"
  | "minimal"
  | "typewriter"
  | "newsprint"
  | "solarized"
  | "catppuccin"
  | "nord"
  | "dracula"
  | "gruvbox"
  | "ayu"
  | "tokyo-night"
  | "gitlab"
  | "notion"
  | "medium";
export type AccentColor =
  | "blue"
  | "purple"
  | "pink"
  | "red"
  | "orange"
  | "amber"
  | "green";
export type SortMode =
  | "name"
  | "modified-desc"
  | "modified-asc"
  | "created-desc"
  | "created-asc";

export type ViewMode = "code" | "split" | "preview";

export interface Favorite {
  path: string;
  type: "file" | "directory";
}

export function favEq(a: Favorite, b: Favorite): boolean {
  return a.path === b.path && a.type === b.type;
}

export interface WindowBounds {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface Settings {
  theme: Theme;
  markdownTheme: MarkdownTheme;
  accentColor: AccentColor;
  fontSize: number;
  fontFamily: string;
  previewFontFamily: string;
  showLineNumbers: boolean;
  autoSave: boolean;
  autoSaveDelay: number;
  fileBrowserWidth: number;
  editorSplit: number;
  recentFiles: string[];
  recentDirectories: string[];
  windowBounds: WindowBounds | null;
  favorites: Favorite[];
  showFileDates: boolean;
  pendingWhatsNewNotes: string | null;
  globalHotkeysEnabled: boolean;
  globalHotkeyOpenPath: string;
  betaUpdates: boolean;
}

export interface Tab {
  id: number;
  name: string | null;
  filePath: string | null;
  // When the tab was opened from a remote URL (Open from URL), this is the
  // source URL. filePath stays null (it has no local path until saved).
  sourceUrl?: string | null;
  content: string;
  savedContent: string;
  dirty: boolean;
}

export interface FileEntry {
  name: string;
  path: string;
  isDirectory: boolean;
  isMarkdown: boolean;
  modifiedTime: number;
  createdTime: number;
}

export interface Session {
  openFiles: string[];
  activeFile: string | null;
  folderPath: string | null;
}

export interface FileStat {
  modifiedTime: number;
  createdTime: number;
}

export interface ResolvedPath {
  path: string;
  isDirectory: boolean;
}

export interface SearchFileResult {
  file: string;
  filenameMatches: [number, string][];
  contentMatches: [number, string][];
}

export interface SearchResult {
  filesScanned: number;
  matchCount: number;
  capped: boolean;
  results: SearchFileResult[];
}

export interface FileChangedEvent {
  path: string;
  content: string;
}

export type DiffChoice = "mine" | "theirs";

export interface DiffSegment {
  type: "common" | "conflict";
  lines: string[]; // for common segments
  mine: string[]; // for conflict segments (the local edited side)
  theirs: string[]; // for conflict segments (the external changed side)
  choice: DiffChoice; // resolution for conflict segments
}

export interface DiffData {
  filePath: string;
  segments: DiffSegment[];
}

export interface ToastItem {
  id: number;
  message: string;
  type: "success" | "warning" | "error" | "info";
}

export type TextTransform =
  | "unicode-italic"
  | "unicode-bold"
  | "unicode-bold-italic"
  | "unicode-monospace"
  | "small-caps"
  | "strikethrough"
  | "uppercase"
  | "lowercase"
  | "title-case";
