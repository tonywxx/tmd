import { EditorView } from "@codemirror/view";
import {
  locateAnchorByLine,
  interpolate,
  fractionToLine,
  type Anchor,
} from "./anchorMap";

// Bidirectional scroll sync between the editor and the preview.
//
// The preview renderer stamps every top-level block with a data-line attribute
// (see markdown.ts lineMarkers), so each block knows the source line it came
// from. The sync anchors on those blocks and maps the editor's first visible
// line onto the preview by interpolating between the two nearest anchors. This
// keeps long documents aligned even when a block — an image, code fence,
// mermaid diagram, table — renders to a very different height than its source
// lines. Documents without markers (plain text, empty) fall back to a global
// proportional mapping.
//
// Feedback suppression is applied only to the pane that received a programmatic
// scroll, for a short window, so the pane driving the scroll is never
// throttled. The old cooldown dropped scroll events on *both* panes for 80ms,
// which made continuous scrolling lag and jump.

const TARGET_SUPPRESS_MS = 50;

// (Anchor type + clamp01 + binary searches now live in anchorMap.ts.)

// Element's top relative to the scrollable content of `scroller` (0 = scroller
// top when scrollTop is 0). Uses bounding rects so offsetParent quirks don't
// matter.
function elementTopInScroller(el: Element, scroller: HTMLElement): number {
  return (
    el.getBoundingClientRect().top -
    scroller.getBoundingClientRect().top +
    scroller.scrollTop
  );
}

function proportionalTarget(from: HTMLElement, to: HTMLElement): number | null {
  const fromMax = from.scrollHeight - from.clientHeight;
  const toMax = to.scrollHeight - to.clientHeight;
  if (fromMax <= 0 || toMax <= 0) return null;
  return (from.scrollTop / fromMax) * toMax;
}

export class ScrollSync {
  private editorEl: HTMLElement | null = null;
  private previewEl: HTMLElement | null = null;
  // Registered scroll handlers, removed on unregister / re-register so the
  // preview's persistent div does not accumulate listeners across tab switches.
  private editorHandler: (() => void) | null = null;
  private previewHandler: (() => void) | null = null;
  // Pane that just received a programmatic scroll; its echo events are ignored
  // until the window elapses, so they never loop back into the driving pane.
  private suppressedEl: HTMLElement | null = null;
  private suppressUntil = 0;
  // Cached [data-line] anchors for the current preview DOM. Invalidated by the
  // MutationObserver when content re-renders or mermaid replaces a block.
  private anchors: Anchor[] | null = null;
  private observer: MutationObserver | null = null;

  registerEditor(el: HTMLElement) {
    this.editorEl = el;
    this.attach(el, "editor");
  }

  registerPreview(el: HTMLElement) {
    this.previewEl = el;
    this.attach(el, "preview");
    this.anchors = null;
    this.observer?.disconnect();
    this.observer = new MutationObserver(() => {
      this.anchors = null;
    });
    this.observer.observe(el, { childList: true, subtree: true });
  }

  unregisterEditor() {
    if (this.editorEl && this.editorHandler) {
      this.editorEl.removeEventListener("scroll", this.editorHandler);
    }
    this.editorEl = null;
    this.editorHandler = null;
  }

  unregisterPreview() {
    if (this.previewEl && this.previewHandler) {
      this.previewEl.removeEventListener("scroll", this.previewHandler);
    }
    this.previewEl = null;
    this.previewHandler = null;
    this.observer?.disconnect();
    this.observer = null;
    this.anchors = null;
  }

  destroy() {
    this.unregisterEditor();
    this.unregisterPreview();
    this.suppressedEl = null;
    this.suppressUntil = 0;
  }

  private attach(el: HTMLElement, source: "editor" | "preview") {
    const handler = () => {
      if (this.editorEl && this.previewEl) this.onScroll(source);
    };
    if (source === "editor") {
      if (this.editorEl && this.editorHandler) {
        this.editorEl.removeEventListener("scroll", this.editorHandler);
      }
      this.editorHandler = handler;
    } else {
      if (this.previewEl && this.previewHandler) {
        this.previewEl.removeEventListener("scroll", this.previewHandler);
      }
      this.previewHandler = handler;
    }
    el.addEventListener("scroll", handler);
  }

  private onScroll(source: "editor" | "preview") {
    const from = source === "editor" ? this.editorEl! : this.previewEl!;
    const to = source === "editor" ? this.previewEl! : this.editorEl!;

    // The event provoked by our own scrollTop write — drop it so it can't
    // bounce back and fight the pane the user is actually scrolling.
    const now = performance.now();
    if (this.suppressedEl === from && now < this.suppressUntil) return;
    if (this.suppressedEl === from) {
      this.suppressedEl = null;
    }

    const target = this.syncTarget(from, to, source);
    if (target == null) return;
    if (Math.abs(to.scrollTop - target) < 1) return;
    to.scrollTop = target;
    this.suppressedEl = to;
    this.suppressUntil = now + TARGET_SUPPRESS_MS;
  }

  private syncTarget(
    from: HTMLElement,
    to: HTMLElement,
    source: "editor" | "preview",
  ): number | null {
    const view = EditorView.findFromDOM(this.editorEl!);
    if (!view) return proportionalTarget(from, to);
    const anchors = this.anchorItems(this.previewEl!);
    if (anchors.length === 0) return proportionalTarget(from, to);

    if (source === "editor") {
      const topLine = view.state.doc.lineAt(
        view.elementAtHeight(from.scrollTop).from,
      ).number;
      const target = this.editorToPreviewTarget(view, topLine, anchors, to);
      return target ?? proportionalTarget(from, to);
    }
    const target = this.previewToEditorTarget(view, anchors, from.scrollTop, from);
    return target ?? proportionalTarget(from, to);
  }

  private anchorItems(preview: HTMLElement): Anchor[] {
    const cached = this.anchors;
    if (cached && cached.length > 0 && cached[0].el.isConnected) return cached;
    this.anchors = Array.from(preview.querySelectorAll("[data-line]"))
      .map((el) => ({ el, line: Number(el.getAttribute("data-line")) }))
      .filter((a) => a.el.isConnected && Number.isFinite(a.line));
    return this.anchors;
  }

  // Editor → preview: map the first visible editor line onto the preview by
  // interpolating between the two anchors that bound the line.
  // (Numerics live in anchorMap.ts; here only DOM measurement + delegation.)
  private editorToPreviewTarget(
    view: EditorView,
    topLine: number,
    anchors: Anchor[],
    preview: HTMLElement,
  ): number | null {
    // Binary search on lines needs no layout reads; only the two bounding
    // anchors are measured — same cost as before, numerics in anchorMap.
    const i = locateAnchorByLine(
      anchors.map((a) => a.line),
      topLine,
    );
    if (i < 0) return null;
    const doc = view.state.doc;
    const nextLine = i + 1 < anchors.length ? anchors[i + 1].line : doc.lines;
    const curTop = elementTopInScroller(anchors[i].el, preview);
    const nextTop =
      i + 1 < anchors.length
        ? elementTopInScroller(anchors[i + 1].el, preview)
        : preview.scrollHeight - preview.clientHeight;
    return interpolate(anchors[i].line, nextLine, topLine, curTop, nextTop);
  }

  // Preview → editor: locate the block in view by its anchor, map the preview
  // scroll fraction within the block back to an editor line.
  // (Numerics live in anchorMap.ts; here only DOM measurement + delegation.
  // NOTE: tops are monotonic in document order, so one layout read per
  // anchor is still the cost — unchanged from before.)
  private previewToEditorTarget(
    view: EditorView,
    anchors: Anchor[],
    scrollTop: number,
    preview: HTMLElement,
  ): number | null {
    // Tops are monotonic in document order: binary-search with one layout
    // read per probe (log n reads), then a single pure fractionToLine call.
    // Only the winning section's endpoints are re-read — same as before.
    let lo = 0;
    let hi = anchors.length - 1;
    let i = -1;
    const tops: number[] = new Array(anchors.length);
    const topAt = (k: number): number =>
      (tops[k] ??= elementTopInScroller(anchors[k].el, preview));
    while (lo <= hi) {
      const mid = (lo + hi) >> 1;
      if (topAt(mid) <= scrollTop + 1) {
        i = mid;
        lo = mid + 1;
      } else {
        hi = mid - 1;
      }
    }
    if (i < 0) return null;
    const doc = view.state.doc;
    const nextLine = i + 1 < anchors.length ? anchors[i + 1].line : doc.lines;
    const sectionStart = topAt(i);
    const sectionEnd =
      i + 1 < anchors.length
        ? topAt(i + 1)
        : preview.scrollHeight - preview.clientHeight;
    const targetLine = fractionToLine(
      anchors[i].line,
      nextLine,
      scrollTop,
      sectionStart,
      sectionEnd,
    );
    const lineNo = Math.max(1, Math.min(Math.round(targetLine), doc.lines));
    const line = doc.line(lineNo);
    const block = view.lineBlockAt(line.from);
    const nextPos = Math.min(line.to + 1, doc.length);
    const nextTop = view.lineBlockAt(nextPos).top;
    return block.top + (targetLine - lineNo) * (nextTop - block.top);
  }
}

// The app's single editor+preview pair shares one instance; tests can
// construct their own.
export const scrollSync = new ScrollSync();
