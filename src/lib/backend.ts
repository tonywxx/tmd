import { api } from "./bridge";
import type { Settings } from "./types";

// ---- App backend seam ----
//
// The command and shell layers reach Tauri through this port instead of the
// raw `api` bridge, mirroring the File system context's FileSystem port. That
// gives one swappable seam for the non-filesystem IPC (settings, external
// open, export, window, hotkey) so the command layer can run without Tauri and
// tests can substitute an in-memory adapter — the same leverage the FileSystem
// port already provides.

export interface AppBackend {
  getSettings(): Promise<Settings>;
  setSettings(settings: Settings): Promise<void>;
  updateGlobalHotkey(settings: Settings): Promise<void>;
  openExternal(url: string): Promise<void>;
  printWindow(label: string): Promise<void>;
  exportHtml(path: string, html: string): Promise<void>;
  homeDir(): Promise<string>;
}

export const tauriBackend: AppBackend = {
  getSettings: () => api.getSettings(),
  setSettings: (s) => api.setSettings(s),
  updateGlobalHotkey: (s) => api.updateGlobalHotkey(s),
  openExternal: (url) => api.openExternal(url),
  printWindow: (label) => api.printWindow(label),
  exportHtml: (path, html) => api.exportHtml(path, html),
  homeDir: () => api.homeDir(),
};

let current: AppBackend = tauriBackend;

export function getBackend(): AppBackend {
  return current;
}

/** Swap in a substitute adapter (tests, special windows, …). */
export function setBackend(backend: AppBackend): void {
  current = backend;
}

// ---- local-substitutable adapter ----
// Records the calls a command would make so the command layer is testable
// without Tauri, the same way InMemoryFileSystem exercises the FileSystem
// seam.
export class InMemoryBackend implements AppBackend {
  settings: Settings | null = null;
  lastExternalUrl: string | null = null;
  lastPrintedWindow: string | null = null;
  lastExport: { path: string; html: string } | null = null;
  homeDirValue = "/tmp";

  async getSettings(): Promise<Settings> {
    return this.settings ?? ({} as Settings);
  }
  async setSettings(settings: Settings): Promise<void> {
    this.settings = settings;
  }
  async updateGlobalHotkey(_settings: Settings): Promise<void> {}
  async openExternal(url: string): Promise<void> {
    this.lastExternalUrl = url;
  }
  async printWindow(label: string): Promise<void> {
    this.lastPrintedWindow = label;
  }
  async exportHtml(path: string, html: string): Promise<void> {
    this.lastExport = { path, html };
  }
  async homeDir(): Promise<string> {
    return this.homeDirValue;
  }
}
