import { ZoomIn, ZoomOut, RotateCcw, Maximize2, Minimize2, Download, Code, Eye } from "lucide-react";
import { lucideSvg } from "./iconSvg";
import { nextMermaidId, renderMermaid, svgToPngDataUri } from "./mermaid";
import { pickSaveImagePath } from "./bridge";
import { getFileSystem } from "./fs";
import { useStore } from "./store";
import {
  identityTransform,
  zoomAt,
  pan,
  transformStyle,
  type ViewTransform,
} from "./zoomTransform";

// Builds the interactive diagram figure (viewport + toolbar) that replaces a
// ```mermaid code block in the preview, and wires up:
//   - wheel zoom (anchored at the cursor)
//   - drag to pan in any direction
//   - toolbar buttons: zoom in / zoom out / reset / save as PNG

export async function renderMermaidBlocks(container: HTMLElement): Promise<void> {
  // (1) Replace any not-yet-rendered ```mermaid code blocks.
  const blocks = Array.from(
    container.querySelectorAll<HTMLElement>("code.language-mermaid"),
  );
  for (const code of blocks) {
    const pre = code.closest("pre") as HTMLElement | null;
    if (!pre || !pre.isConnected) continue;
    const source = code.textContent ?? "";
    if (!source.trim()) continue;
    await replaceBlock(pre, source);
  }

  // (2) Re-render already-built figures whose theme changed. React only resets
  // the container innerHTML when the markdown source changes, so on a theme
  // toggle the figures survive; refresh them in place.
  const figures = Array.from(
    container.querySelectorAll<HTMLElement>(".mermaid-figure"),
  );
  for (const figure of figures) {
    const source = figure.getAttribute("data-mermaid-source");
    const renderedId = figure.getAttribute("data-mermaid-id");
    if (!source) continue;
    const diagram = await renderMermaid(source);
    if (diagram.id === renderedId) continue;
    const inner = figure.querySelector(".mermaid-inner") as HTMLElement | null;
    if (!inner) continue;
    const freshId = nextMermaidId();
    inner.innerHTML = diagram.svg.split(diagram.id).join(freshId);
    diagram.bind(inner);
    figure.setAttribute("data-mermaid-id", diagram.id);
    inner.style.transform = "";
  }
}

async function replaceBlock(pre: HTMLElement, source: string): Promise<void> {
  const line = pre.dataset.line;
  try {
    const diagram = await renderMermaid(source);
    if (!pre.isConnected) return;
    const figure = buildFigure(diagram, source);
    // Keep the block's source line marker so the scroll sync still anchors on
    // this block after the <pre> is replaced by the diagram figure.
    if (line) figure.dataset.line = line;
    pre.replaceWith(figure);
  } catch (err) {
    if (!pre.isConnected) return;
    const figure = document.createElement("div");
    figure.className = "mermaid-figure mermaid-error";
    if (line) figure.dataset.line = line;
    const msg = document.createElement("div");
    msg.className = "mermaid-error-msg";
    msg.textContent = `Mermaid render error: ${String(err)}`;
    figure.appendChild(msg);
    pre.replaceWith(figure);
  }
}

function buildFigure(diagram: { id: string; svg: string; bind: (el: HTMLElement) => void }, source: string): HTMLElement {
  // Inject under a fresh id so marker/clipPath refs stay unique per instance
  // even when the cached SVG markup is reused across blocks.
  const freshId = nextMermaidId();
  const svgHtml = diagram.svg.split(diagram.id).join(freshId);

  const figure = document.createElement("div");
  figure.className = "mermaid-figure";
  figure.setAttribute("data-mermaid-source", source);
  figure.setAttribute("data-mermaid-id", diagram.id);
  figure.innerHTML = `
    <div class="mermaid-viewport">
      <div class="mermaid-inner">${svgHtml}</div>
    </div>
    <pre class="mermaid-code"></pre>
    <div class="mermaid-toolbar">
      <button type="button" class="mermaid-btn" data-action="toggle-code" title="Show code">${lucideSvg(Code)}</button>
      <button type="button" class="mermaid-btn" data-action="zoom-in" title="Zoom in">${lucideSvg(ZoomIn)}</button>
      <button type="button" class="mermaid-btn" data-action="zoom-out" title="Zoom out">${lucideSvg(ZoomOut)}</button>
      <button type="button" class="mermaid-btn" data-action="reset" title="Reset view">${lucideSvg(RotateCcw)}</button>
      <button type="button" class="mermaid-btn" data-action="fullscreen" title="Enter fullscreen" aria-label="Enter fullscreen">${lucideSvg(Maximize2)}</button>
      <button type="button" class="mermaid-btn" data-action="save" title="Save as PNG">${lucideSvg(Download)}</button>
    </div>`;

  // Code view: text-only so a malicious diagram source can never inject HTML.
  const codeEl = figure.querySelector(".mermaid-code") as HTMLElement;
  codeEl.textContent = source;

  const viewport = figure.querySelector(".mermaid-viewport") as HTMLElement;
  const inner = figure.querySelector(".mermaid-inner") as HTMLElement;
  diagram.bind(inner);
  setupPanZoom(figure, viewport, inner);
  setupToggleCode(figure.querySelector('[data-action="toggle-code"]') as HTMLButtonElement, figure);
  setupSave(figure.querySelector('[data-action="save"]') as HTMLButtonElement, source);
  setupFullscreen(figure.querySelector('[data-action="fullscreen"]') as HTMLButtonElement, figure);
  return figure;
}

function setupPanZoom(
  figure: HTMLElement,
  viewport: HTMLElement,
  inner: HTMLElement,
): void {
  let t: ViewTransform = identityTransform();
  let dragging = false;
  let startX = 0;
  let startY = 0;
  let startT: ViewTransform = identityTransform();

  const apply = () => {
    inner.style.transform = transformStyle(t);
    inner.style.transformOrigin = "0 0";
  };

  const zoomAtPoint = (cx: number, cy: number, factor: number) => {
    t = zoomAt(t, cx, cy, t.k * factor);
    apply();
  };

  viewport.addEventListener(
    "wheel",
    (e) => {
      e.preventDefault();
      const rect = viewport.getBoundingClientRect();
      const cx = e.clientX - rect.left;
      const cy = e.clientY - rect.top;
      const factor = e.deltaY < 0 ? 1.15 : 1 / 1.15;
      zoomAtPoint(cx, cy, factor);
    },
    { passive: false },
  );

  viewport.addEventListener("pointerdown", (e) => {
    if (e.button !== 0) return;
    const target = e.target as HTMLElement;
    if (target.closest("a, button")) return;
    dragging = true;
    startX = e.clientX;
    startY = e.clientY;
    startT = t;
    viewport.setPointerCapture(e.pointerId);
    viewport.classList.add("dragging");
    e.preventDefault();
  });

  viewport.addEventListener("pointermove", (e) => {
    if (!dragging) return;
    t = pan(startT, e.clientX - startX, e.clientY - startY);
    apply();
  });

  const endDrag = (e: PointerEvent) => {
    if (!dragging) return;
    dragging = false;
    try {
      viewport.releasePointerCapture(e.pointerId);
    } catch {
      /* capture may already be released */
    }
    viewport.classList.remove("dragging");
  };
  viewport.addEventListener("pointerup", endDrag);
  viewport.addEventListener("pointercancel", endDrag);

  const zoomButton = (action: string, factor: number) => {
    figure
      .querySelector(`[data-action="${action}"]`)
      ?.addEventListener("click", (e) => {
        e.preventDefault();
        e.stopPropagation();
        const rect = viewport.getBoundingClientRect();
        zoomAtPoint(rect.width / 2, rect.height / 2, factor);
      });
  };
  zoomButton("zoom-in", 1.3);
  zoomButton("zoom-out", 1 / 1.3);

  figure
    .querySelector('[data-action="reset"]')
    ?.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      t = identityTransform();
      apply();
    });
}

function setupSave(btn: HTMLButtonElement | null, source: string): void {
  if (!btn) return;
  btn.addEventListener("click", async (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (btn.disabled) return;
    btn.disabled = true;
    btn.textContent = "…";
    try {
      const figure = btn.closest(".mermaid-figure") as HTMLElement | null;
      const svg = figure?.querySelector("svg") as SVGSVGElement | null;
      if (!svg) throw new Error("diagram not rendered");
      const dataUrl = await svgToPngDataUri(svg, 2);
      const base64 = dataUrl.slice(dataUrl.indexOf(",") + 1);
      const firstLine = source.trim().split("\n")[0] ?? "diagram";
      const stem =
        firstLine
          .replace(/[^\w\u4e00-\u9fff-]+/g, "_")
          .replace(/^_+|_+$/g, "")
          .slice(0, 40) || "mermaid";
      const path = await pickSaveImagePath(`${stem}.png`);
      if (!path) return;
      await getFileSystem().writeFileBase64(path, base64);
      useStore.getState().pushToast(`Saved diagram → ${path}`, "success");
    } catch (err) {
      console.error("save diagram failed", err);
      useStore.getState().pushToast(`Save failed: ${String(err)}`, "error");
    } finally {
      btn.disabled = false;
      btn.innerHTML = lucideSvg(Download);
    }
  });
}

// Module-level fullscreen state. At most one figure is fullscreen at a time;
// a single document-level Escape listener is attached while one is active and
// torn down when the last figure exits, so we never leak listeners.
let fsCurrent: { figure: HTMLElement; btn: HTMLButtonElement } | null = null;
let fsEscHandler: ((e: KeyboardEvent) => void) | null = null;

function applyFullscreenState(
  figure: HTMLElement,
  btn: HTMLButtonElement,
  on: boolean,
): void {
  figure.classList.toggle("is-fullscreen", on);
  btn.innerHTML = lucideSvg(on ? Minimize2 : Maximize2);
  btn.title = on ? "Exit fullscreen" : "Enter fullscreen";
  btn.setAttribute("aria-label", btn.title);
}

function setFullscreen(
  figure: HTMLElement,
  btn: HTMLButtonElement,
  on: boolean,
): void {
  if (on) {
    // If a different figure is already fullscreen, collapse it first.
    if (fsCurrent && fsCurrent.figure !== figure) {
      applyFullscreenState(fsCurrent.figure, fsCurrent.btn, false);
    }
    fsCurrent = { figure, btn };
    applyFullscreenState(figure, btn, true);
    if (!fsEscHandler) {
      fsEscHandler = (ev) => {
        if (ev.key !== "Escape" || !fsCurrent) return;
        const { figure: f, btn: b } = fsCurrent;
        if (f.isConnected) applyFullscreenState(f, b, false);
        fsCurrent = null;
        document.removeEventListener("keydown", fsEscHandler!);
        fsEscHandler = null;
      };
      document.addEventListener("keydown", fsEscHandler);
    }
  } else {
    applyFullscreenState(figure, btn, false);
    if (fsCurrent && fsCurrent.figure === figure) {
      fsCurrent = null;
      if (fsEscHandler) {
        document.removeEventListener("keydown", fsEscHandler);
        fsEscHandler = null;
      }
    }
  }
}

function setupToggleCode(btn: HTMLButtonElement | null, figure: HTMLElement): void {
  if (!btn) return;
  btn.addEventListener("click", (e) => {
    e.preventDefault();
    e.stopPropagation();
    const on = !figure.classList.contains("is-code");
    figure.classList.toggle("is-code", on);
    btn.innerHTML = lucideSvg(on ? Eye : Code);
    btn.title = on ? "Show diagram" : "Show code";
    btn.setAttribute("aria-label", btn.title);
  });
}

function setupFullscreen(
  btn: HTMLButtonElement | null,
  figure: HTMLElement,
): void {
  if (!btn) return;
  btn.addEventListener("click", (e) => {
    e.preventDefault();
    e.stopPropagation();
    const on = !figure.classList.contains("is-fullscreen");
    setFullscreen(figure, btn, on);
  });
}
