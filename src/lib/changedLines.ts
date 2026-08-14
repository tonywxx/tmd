import { diffLines } from "diff";

// Pure computation for the git gutter: which line numbers in `newText` differ
// from `baseline`. Extracted from the editor so it can be unit-tested without
// a CodeMirror DOM. Lines added or modified relative to the baseline are
// returned as their 0-based index in the new document.

export function computeChangedLines(
  newText: string,
  baseline: string | null,
): Set<number> {
  const set = new Set<number>();
  if (baseline == null) return set;
  const parts = diffLines(baseline, newText);
  let newLine = 0;
  for (const part of parts) {
    const count = part.count ?? 0;
    if (part.added) {
      for (let i = 0; i < count; i++) set.add(newLine + i);
      newLine += count;
    } else if (part.removed) {
      // removed lines don't exist in the new doc
    } else {
      newLine += count;
    }
  }
  return set;
}
