// Pure anchor-interpolation math for editor↔preview scroll sync.
// Extracted from scrollSync.ts (candidate E): zero imports, zero DOM,
// zero CodeMirror — the only test seam this module needs.
//
// ScrollSync.ts stays responsible for: collecting anchor tops via layout
// reads, querying the CodeMirror view, and writing scrollTop. Everything
// numerical lives here and is unit-testable with plain numbers.

// Anchor shape shared with ScrollSync. `el` is type-only here — this
// module never touches the DOM at runtime; measurement stays in the caller.
export interface Anchor {
  el: Element;
  line: number;
}

export function clamp01(n: number): number {
  return Math.max(0, Math.min(1, n));
}

// Index of the greatest entry in sorted `lines` with value <= topLine,
// or -1 when topLine precedes every anchor.
export function locateAnchorByLine(lines: number[], topLine: number): number {
  let lo = 0;
  let hi = lines.length - 1;
  let i = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (lines[mid] <= topLine) {
      i = mid;
      lo = mid + 1;
    } else {
      hi = mid - 1;
    }
  }
  return i;
}

// Index of the last anchor whose top is at/above scrollTop (+1px tolerance),
// or -1 when the viewport is above every anchor.
export function locateAnchorByOffset(tops: number[], scrollTop: number): number {
  let lo = 0;
  let hi = tops.length - 1;
  let i = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (tops[mid] <= scrollTop + 1) {
      i = mid;
      lo = mid + 1;
    } else {
      hi = mid - 1;
    }
  }
  return i;
}

// Editor → preview: map the first visible editor line onto a preview offset
// by interpolating between the two anchors that bound the line.
// `endTop` is the fallback bottom (scrollHeight - clientHeight) used when the
// bounding anchor is the last one. Returns null when topLine precedes all
// anchors (caller falls back to proportional mapping).
export function mapLineToOffset(
  lines: number[],
  tops: number[],
  topLine: number,
  docLines: number,
  endTop: number,
): number | null {
  const i = locateAnchorByLine(lines, topLine);
  if (i < 0) return null;
  const nextLine = i + 1 < lines.length ? lines[i + 1] : docLines;
  const curTop = tops[i];
  const nextTop = i + 1 < tops.length ? tops[i + 1] : endTop;
  return interpolate(lines[i], nextLine, topLine, curTop, nextTop);
}

// Preview → editor: map a preview scrollTop back to a fractional editor line.
// Returns null when the viewport is above every anchor (caller falls back to
// proportional mapping).
export function mapOffsetToLine(
  lines: number[],
  tops: number[],
  scrollTop: number,
  docLines: number,
  endTop: number,
): number | null {
  const i = locateAnchorByOffset(tops, scrollTop);
  if (i < 0) return null;
  const nextLine = i + 1 < lines.length ? lines[i + 1] : docLines;
  const sectionEnd = i + 1 < tops.length ? tops[i + 1] : endTop;
  return fractionToLine(lines[i], nextLine, scrollTop, tops[i], sectionEnd);
}

// Two-anchor linear interpolation shared by both directions:
// what fraction of the way topLine sits between curLine→nextLine,
// applied to curTop→nextTop. Pure; all DOM/CodeMirror reads stay in the caller.
export function interpolate(
  curLine: number,
  nextLine: number,
  topLine: number,
  curTop: number,
  nextTop: number,
): number {
  const span = nextLine - curLine;
  const frac = span > 0 ? clamp01((topLine - curLine) / span) : 0;
  return curTop + frac * (nextTop - curTop);
}

// Preview → editor fractional line: what fraction of the way scrollTop sits
// between sectionStart→sectionEnd, applied to curLine→nextLine. Pure.
export function fractionToLine(
  curLine: number,
  nextLine: number,
  scrollTop: number,
  sectionStart: number,
  sectionEnd: number,
): number {
  const span = nextLine - curLine;
  const frac =
    sectionEnd > sectionStart
      ? clamp01((scrollTop - sectionStart) / (sectionEnd - sectionStart))
      : 0;
  return span > 0 ? curLine + frac * span : curLine;
}

// ponytail: minimal self-check, no test framework (repo has no test runner).
// Run with: node --experimental-strip-types -e "import('./src/lib/anchorMap.ts').then(m=>m.demoAnchorMap())"
// Throws on failure, returns a summary string on success.
export function demoAnchorMap(): string {
  const eq = (a: unknown, b: unknown, msg: string) => {
    if (a !== b) throw new Error(`anchorMap demo failed: ${msg} (got ${a}, want ${b})`);
  };
  const approx = (a: number, b: number, msg: string) => {
    if (Math.abs(a - b) > 1e-9) throw new Error(`anchorMap demo failed: ${msg} (got ${a}, want ${b})`);
  };
  eq(locateAnchorByLine([1, 10, 20], 1), 0, "line exact first");
  eq(locateAnchorByLine([1, 10, 20], 15), 1, "line between");
  eq(locateAnchorByLine([1, 10, 20], 0), -1, "line before all");
  eq(locateAnchorByLine([1, 10, 20], 99), 2, "line after all");
  eq(locateAnchorByOffset([0, 500, 1200], 0), 0, "offset top");
  eq(locateAnchorByOffset([0, 500, 1200], 600), 1, "offset middle");
  eq(locateAnchorByOffset([0, 500, 1200], -5), -1, "offset above all");
  approx(mapLineToOffset([1, 11], [0, 1000], 6, 21, 2000)!, 500, "interp midpoint");
  eq(mapLineToOffset([10], [300], 5, 100, 2000), null, "before first → null");
  approx(mapOffsetToLine([1, 11, 21], [0, 1000, 2000], 500, 31, 3000)!, 6, "reverse midpoint");
  eq(mapOffsetToLine([1], [300], 0, 100, 2000), null, "reverse above → null");
  approx(mapOffsetToLine([1], [0], 1000, 21, 2000)!, 11, "reverse last-anchor interp");
  eq(clamp01(-1), 0, "clamp low");
  eq(clamp01(2), 1, "clamp high");
  return "anchorMap demo: 14 checks passed";
}
