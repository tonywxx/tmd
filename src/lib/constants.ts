import type { AccentColor, MarkdownTheme, Settings } from "./types";

// ---- Timings ----
export const ANCHOR_REBUILD_MS = 50; // rebuild anchor map after content change
export const PREVIEW_DEBOUNCE_MS = 150; // preview render debounce
export const DIFF_MERGE_THRESHOLD = 2; // merge short context gaps into a hunk
export const FOCUS_AUTO_SAVE_MS = 500; // focus mode fixed auto-save
export const AUTO_SAVE_OPTIONS = [1000, 2000, 5000, 10000];
export const FONT_SIZE_OPTIONS = [11, 12, 13, 14, 15, 16, 18, 20];

export const ACCENTS: AccentColor[] = [
  "blue",
  "purple",
  "pink",
  "red",
  "orange",
  "amber",
  "green",
];

export const PREVIEW_FONT_OPTIONS: { label: string; value: string }[] = [
  { label: "System", value: "default" },
  { label: "Helvetica Neue", value: "'Helvetica Neue', Helvetica, Arial, sans-serif" },
  { label: "Georgia", value: "Georgia, 'Times New Roman', serif" },
  { label: "Palatino", value: "'Palatino Linotype', 'Book Antiqua', Palatino, serif" },
  { label: "Avenir Next", value: "'Avenir Next', Avenir, sans-serif" },
  { label: "Charter", value: "Charter, 'Bitstream Charter', serif" },
];

export const EDITOR_FONT_OPTIONS: { label: string; value: string }[] = [
  { label: "Default Mono", value: "default" },
  { label: "SF Mono", value: "'SF Mono', Menlo, Monaco, 'Courier New', monospace" },
  { label: "Menlo", value: "Menlo, Monaco, Consolas, monospace" },
  { label: "Monaco", value: "Monaco, 'Courier New', monospace" },
  { label: "Courier New", value: "'Courier New', monospace" },
  { label: "Andale Mono", value: "'Andale Mono', monospace" },
];

export const MARKDOWN_EXTS = [
  ".md",
  ".markdown",
  ".mdown",
  ".mkd",
  ".mkdn",
  ".mdwn",
  ".mdx",
  ".txt",
];

// Openable but not rendered as markdown: plain text and config formats.
// Kept in sync with OPENABLE_EXTS in src-tauri/src/commands.rs.
export const TEXT_EXTS = [".json", ".toml", ".yaml", ".yml"];

// Largest file the browser will open on a single click. Matches the cap for
// "Open from URL" to keep one notion of "too big" across the app.
export const MAX_OPEN_BYTES = 10 * 1024 * 1024;

// Extension-less form for the native open/save dialogs. Derived so the dialogs
// can never drift from the sets above.
export const OPENABLE_FILTER_EXTS = [...MARKDOWN_EXTS, ...TEXT_EXTS].map((e) =>
  e.slice(1),
);

export const IMAGE_EXTS = [
  ".png",
  ".jpg",
  ".jpeg",
  ".gif",
  ".svg",
  ".webp",
  ".bmp",
  ".ico",
  ".avif",
];

export function isMarkdown(path: string): boolean {
  const lower = path.toLowerCase();
  return MARKDOWN_EXTS.some((e) => lower.endsWith(e));
}

/** Can the editor open this file at all (markdown or plain text/config)? */
export function isOpenable(path: string): boolean {
  const lower = path.toLowerCase();
  return isMarkdown(lower) || TEXT_EXTS.some((e) => lower.endsWith(e));
}

export function isImage(path: string): boolean {
  const lower = path.toLowerCase();
  return IMAGE_EXTS.some((e) => lower.endsWith(e));
}

export const MARKDOWN_THEMES: { label: string; value: MarkdownTheme }[] = [
  { label: "GitHub", value: "github" },
  { label: "Academic", value: "academic" },
  { label: "Minimal", value: "minimal" },
  { label: "Typewriter", value: "typewriter" },
  { label: "Newsprint", value: "newsprint" },
  { label: "Solarized", value: "solarized" },
  { label: "Catppuccin", value: "catppuccin" },
  { label: "Nord", value: "nord" },
  { label: "Dracula", value: "dracula" },
  { label: "Gruvbox", value: "gruvbox" },
  { label: "Ayu", value: "ayu" },
  { label: "Tokyo Night", value: "tokyo-night" },
  { label: "GitLab", value: "gitlab" },
  { label: "Notion", value: "notion" },
  { label: "Medium", value: "medium" },
];

export const DEFAULT_SETTINGS: Settings = {
  theme: "system",
  markdownTheme: "github",
  accentColor: "blue",
  fontSize: 14,
  fontFamily: "default",
  previewFontFamily: "default",
  previewFontSize: 14,
  showLineNumbers: true,
  autoSave: false,
  autoSaveDelay: 5000,
  fileBrowserWidth: 180,
  editorSplit: 0.5,
  recentFiles: [],
  recentDirectories: [],
  windowBounds: null,
  favorites: [],
  showFileDates: false,
  pendingWhatsNewNotes: null,
  globalHotkeysEnabled: false,
  globalHotkeyOpenPath: "CmdOrCtrl+Shift+Space",
  betaUpdates: false,
};

// Background colors to avoid flash before the renderer paints.
export const THEME_BG = {
  dark: "#1a1d23",
  light: "#f5f5f7",
};

export const MIN_BROWSER_WIDTH = 120;
export const MAX_BROWSER_WIDTH = 360;
export const MIN_EDITOR_SPLIT = 0.2;
export const MAX_EDITOR_SPLIT = 0.8;
