// Minimal POSIX-style path helpers (macOS-only target).
export function basename(path: string, stripExt = false): string {
  const clean = path.replace(/\/$/, "");
  const parts = clean.split("/");
  const name = parts[parts.length - 1] || "";
  if (stripExt && name.includes(".")) {
    return name.slice(0, name.lastIndexOf("."));
  }
  return name;
}

export function dirname(path: string): string {
  const clean = path.replace(/\/$/, "");
  const idx = clean.lastIndexOf("/");
  if (idx <= 0) return "/";
  return clean.slice(0, idx);
}

export function join(a: string, b: string): string {
  if (!a) return b;
  if (!b) return a;
  return a.replace(/\/$/, "") + "/" + b.replace(/^\//, "");
}

export function extname(path: string): string {
  const name = basename(path);
  const idx = name.lastIndexOf(".");
  return idx === -1 ? "" : name.slice(idx);
}
