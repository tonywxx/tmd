# ADR-0007: Three-way merge / conflict resolution via segment model

## Status
Accepted

## Context
When a file open in the editor changes on disk (or via git), tmd offers a
merge view: keep mine, keep theirs, or keep both. We need a model that the
frontend can render as a choice list and that can deterministically produce the
merged text.

## Decision
A `DiffData` carries `segments: DiffSegment[]`. Each segment is either `common`
(shared lines from both sides) or `conflict` (lines that differ). Conflicts are
built with `diffLines` (jsdiff) and gaps of ≤ `DIFF_MERGE_THRESHOLD` (2) lines
are merged into the preceding conflict so tiny diffs don't fragment the UI.
Each conflict has a `choice: DiffChoice` (mine/theirs/both). `buildMergedContent`
joins the segments according to each choice to produce the final text.

## Consequences
- Pure, testable, frontend-resident diff logic (no Rust involvement).
- The Rust side only detects change + supplies the on-disk "theirs" text.
- Threshold tuning trades granularity vs. noise in the conflict list.
