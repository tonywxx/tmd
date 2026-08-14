import { api } from "./bridge";
import type { FileEntry, FileStat, ResolvedPath, SearchResult } from "./types";

// ---- File-system context seam ----
//
// Every frontend filesystem access goes through this module's narrow
// interface instead of the raw IPC bridge. That gives the File system bounded
// context (see CONTEXT.md) a real seam: the Tauri adapter below is one
// implementation, InMemoryFileSystem is the local-substitutable second one
// used by tests, so the seam is exercised rather than hypothetical.

export interface FileSystem {
  readDirectory(path: string): Promise<FileEntry[]>;
  readFile(path: string): Promise<string>;
  writeFile(path: string, content: string): Promise<void>;
  writeFileBase64(path: string, data: string): Promise<void>;
  fileStat(path: string): Promise<FileStat | null>;
  fileExists(path: string): Promise<boolean>;
  resolvePath(input: string, base?: string): Promise<ResolvedPath | null>;
  rename(oldPath: string, newPath: string): Promise<void>;
  mkdir(path: string): Promise<void>;
  create(path: string): Promise<void>;
  trash(path: string): Promise<void>;
  searchInFolder(
    path: string,
    query: string,
    caseSensitive: boolean,
  ): Promise<SearchResult>;
  gitBaseline(path: string): Promise<string | null>;
  showInFolder(path: string): Promise<void>;
  watchFile(path: string): Promise<void>;
  unwatchFile(path: string): Promise<void>;
  watchDirectory(path: string): Promise<void>;
  unwatchDirectory(path: string): Promise<void>;
  isImageAllowed(path: string): Promise<boolean>;
  imageDataUri(path: string): Promise<string | null>;
}

export const tauriFileSystem: FileSystem = {
  readDirectory: (path) => api.readDirectory(path),
  readFile: (path) => api.readFile(path),
  writeFile: (path, content) => api.writeFile(path, content),
  writeFileBase64: (path, data) => api.writeFileBase64(path, data),
  fileStat: (path) => api.fileStat(path),
  fileExists: (path) => api.fileExists(path),
  resolvePath: (input, base) => api.resolvePath(input, base),
  rename: (oldPath, newPath) => api.rename(oldPath, newPath),
  mkdir: (path) => api.mkdir(path),
  create: (path) => api.create(path),
  trash: (path) => api.trash(path),
  searchInFolder: (path, query, caseSensitive) =>
    api.searchInFolder(path, query, caseSensitive),
  gitBaseline: (path) => api.gitBaseline(path),
  showInFolder: (path) => api.showInFolder(path),
  watchFile: (path) => api.watchFile(path),
  unwatchFile: (path) => api.unwatchFile(path),
  watchDirectory: (path) => api.watchDirectory(path),
  unwatchDirectory: (path) => api.unwatchDirectory(path),
  isImageAllowed: (path) => api.isImageAllowed(path),
  imageDataUri: (path) => api.imageDataUri(path),
};

let current: FileSystem = tauriFileSystem;

export function getFileSystem(): FileSystem {
  return current;
}

/** Swap in a substitute adapter (tests, special windows, …). */
export function setFileSystem(fs: FileSystem): void {
  current = fs;
}

// ---- local-substitutable adapter ----
// A tiny in-memory tree so the File system context's logic (browser tree,
// open/save workflows) is testable without Tauri or a real disk.

type MemNode = {
  isDirectory: boolean;
  content: string;
  modifiedTime: number;
  createdTime: number;
};

export class InMemoryFileSystem implements FileSystem {
  private nodes = new Map<string, MemNode>();
  private nextTime = 1;

  seedFile(path: string, content = "") {
    this.nodes.set(path, {
      isDirectory: false,
      content,
      modifiedTime: this.nextTime++,
      createdTime: this.nextTime++,
    });
  }

  seedDirectory(path: string) {
    this.nodes.set(path, {
      isDirectory: true,
      content: "",
      modifiedTime: this.nextTime++,
      createdTime: this.nextTime++,
    });
  }

  private entry(path: string, n: MemNode): FileEntry {
    const name = path.split("/").pop() ?? path;
    return {
      name,
      path,
      isDirectory: n.isDirectory,
      isMarkdown: /\.(md|markdown|mdown|mkd|mkdn|mdwn|mdx|txt)$/i.test(name),
      modifiedTime: n.modifiedTime,
      createdTime: n.createdTime,
    };
  }

  async readDirectory(path: string): Promise<FileEntry[]> {
    const prefix = path.endsWith("/") ? path : path + "/";
    return Array.from(this.nodes.entries())
      .filter(([p, n]) => p.startsWith(prefix) && !p.slice(prefix.length).includes("/"))
      .map(([p, n]) => this.entry(p, n));
  }

  async readFile(path: string): Promise<string> {
    const n = this.nodes.get(path);
    if (!n || n.isDirectory) throw new Error(`ENOENT: ${path}`);
    return n.content;
  }

  async writeFile(path: string, content: string): Promise<void> {
    this.nodes.set(path, {
      isDirectory: false,
      content,
      modifiedTime: this.nextTime++,
      createdTime: this.nextTime++,
    });
  }

  async writeFileBase64(_path: string, _data: string): Promise<void> {
    /* no-op: binary payloads are out of scope for the in-memory adapter */
  }

  async fileStat(path: string): Promise<FileStat | null> {
    const n = this.nodes.get(path);
    if (!n) return null;
    return { modifiedTime: n.modifiedTime, createdTime: n.createdTime };
  }

  async fileExists(path: string): Promise<boolean> {
    return this.nodes.has(path);
  }

  async resolvePath(input: string): Promise<ResolvedPath | null> {
    const n = this.nodes.get(input);
    if (!n) return null;
    return { path: input, isDirectory: n.isDirectory };
  }

  async rename(oldPath: string, newPath: string): Promise<void> {
    const n = this.nodes.get(oldPath);
    if (!n) throw new Error(`ENOENT: ${oldPath}`);
    this.nodes.delete(oldPath);
    this.nodes.set(newPath, n);
  }

  async mkdir(path: string): Promise<void> {
    this.seedDirectory(path);
  }

  async create(path: string): Promise<void> {
    this.seedFile(path);
  }

  async trash(path: string): Promise<void> {
    this.nodes.delete(path);
  }

  async searchInFolder(
    _path: string,
    query: string,
    caseSensitive: boolean,
  ): Promise<SearchResult> {
    const needle = caseSensitive ? query : query.toLowerCase();
    const results = Array.from(this.nodes.entries())
      .filter(([, n]) => !n.isDirectory)
      .flatMap(([p, n]) => {
        const lineIdx = n.content.split("\n");
        const contentMatches: [number, string][] = [];
        lineIdx.forEach((line, i) => {
          const hay = caseSensitive ? line : line.toLowerCase();
          if (hay.includes(needle)) contentMatches.push([i + 1, line.trim()]);
        });
        return contentMatches.length > 0 ? [{ file: p, filenameMatches: [], contentMatches }] : [];
      });
    return {
      filesScanned: Array.from(this.nodes.values()).filter((n) => !n.isDirectory).length,
      matchCount: results.reduce((acc, r) => acc + r.contentMatches.length, 0),
      capped: false,
      results,
    };
  }

  async watchFile(_path: string): Promise<void> {}
  async unwatchFile(_path: string): Promise<void> {}
  async watchDirectory(_path: string): Promise<void> {}
  async unwatchDirectory(_path: string): Promise<void> {}
  async gitBaseline(_path: string): Promise<string | null> {
    return null;
  }
  async showInFolder(_path: string): Promise<void> {}
  async isImageAllowed(_path: string): Promise<boolean> {
    return true;
  }
  async imageDataUri(_path: string): Promise<string | null> {
    return null;
  }
}
