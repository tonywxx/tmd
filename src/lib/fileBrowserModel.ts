import { favEq, type Favorite, type FileEntry, type SortMode } from "./types";

// ---- File browser model ----
//
// Pure, side-effect-free logic for the File system context's tree view. Kept
// out of the FileBrowser component so it can be unit tested against entries
// produced by the InMemoryFileSystem adapter (see ./fs). No React, no DOM.

export const SORT_LABELS: Record<SortMode, string> = {
  name: "Name",
  "modified-desc": "Modified (newest)",
  "modified-asc": "Modified (oldest)",
  "created-desc": "Created (newest)",
  "created-asc": "Created (oldest)",
};

export function sortEntries(entries: FileEntry[], mode: SortMode): FileEntry[] {
  const arr = [...entries];
  arr.sort((a, b) => {
    if (a.isDirectory !== b.isDirectory) return a.isDirectory ? -1 : 1;
    switch (mode) {
      case "name":
        return a.name.localeCompare(b.name, undefined, { numeric: true });
      case "modified-desc":
        return b.modifiedTime - a.modifiedTime;
      case "modified-asc":
        return a.modifiedTime - b.modifiedTime;
      case "created-desc":
        return b.createdTime - a.createdTime;
      case "created-asc":
        return a.createdTime - b.createdTime;
      default:
        return 0;
    }
  });
  return arr;
}

export function isFavorite(
  favorites: Favorite[],
  path: string,
  isDir: boolean,
): boolean {
  return favorites.some((f) => favEq(f, { path, type: isDir ? "directory" : "file" }));
}
