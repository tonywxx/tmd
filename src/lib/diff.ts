import { diffLines } from "diff";
import { DIFF_MERGE_THRESHOLD } from "./constants";
import type { DiffData, DiffSegment } from "./types";

// Build a segment list for the three-way merge UI by diffing the local edited
// content (mine) against the external new content (theirs). Consecutive removed
// (mine-only) and added (theirs-only) regions are paired into conflict hunks;
// short gaps between conflicts are merged so tiny shared lines don't fragment
// the UI (DIFF_MERGE_THRESHOLD).
export function buildDiff(filePath: string, mine: string, theirs: string): DiffData {
  const parts = diffLines(mine, theirs);
  const segments: DiffSegment[] = [];

  let pendingConflict: DiffSegment | null = null;

  const flush = () => {
    if (pendingConflict) {
      segments.push(pendingConflict);
      pendingConflict = null;
    }
  };

  let lastWasConflict = false;
  for (const part of parts) {
    const lines = part.value.split("\n");
    if (lines[lines.length - 1] === "") lines.pop();
    if (!part.added && !part.removed) {
      // common region
      if (pendingConflict && lines.length <= DIFF_MERGE_THRESHOLD) {
        // merge small shared gap into the pending conflict as context
        pendingConflict.mine.push(...lines);
        pendingConflict.theirs.push(...lines);
      } else {
        flush();
        segments.push({ type: "common", lines, mine: [], theirs: [], choice: "mine" });
        lastWasConflict = false;
      }
    } else if (part.added) {
      // theirs-only
      if (pendingConflict) {
        pendingConflict.theirs.push(...lines);
      } else if (lastWasConflict) {
        // orphan added after a flush — start a new conflict
        pendingConflict = {
          type: "conflict",
          lines: [],
          mine: [],
          theirs: lines,
          choice: "theirs",
        };
      } else {
        pendingConflict = {
          type: "conflict",
          lines: [],
          mine: [],
          theirs: lines,
          choice: "theirs",
        };
      }
      lastWasConflict = true;
    } else {
      // mine-only (removed)
      if (pendingConflict) {
        pendingConflict.mine.push(...lines);
      } else {
        pendingConflict = {
          type: "conflict",
          lines: [],
          mine: lines,
          theirs: [],
          choice: "mine",
        };
      }
      lastWasConflict = true;
    }
  }
  flush();

  return { filePath, segments };
}

export function buildMergedContent(data: DiffData): string {
  const out: string[] = [];
  for (const seg of data.segments) {
    if (seg.type === "common") out.push(...seg.lines);
    else out.push(...(seg.choice === "mine" ? seg.mine : seg.theirs));
  }
  return out.join("\n");
}
