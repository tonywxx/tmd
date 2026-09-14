import { ZoomIn, ZoomOut, RotateCcw, Maximize2, Download, Code, Eye } from "lucide-react";
import { lucideSvg } from "./iconSvg";
import { nextMermaidId, renderMermaid } from "./mermaid";
import { setupPanZoom } from "./mermaidPanZoom";
import { setupSave } from "./mermaidSave";
import { setupFullscreen } from "./mermaidFullscreen";

// Builds the interactive diagram figure (viewport + toolbar) that replaces a
// ```mermaid code block in the preview, and wires up:
//   - wheel zoom (anchored at the cursor) + drag pan  → mermaidPanZoom.ts
//   - toolbar: zoom in/out/reset, code toggle, fullscreen → mermaidFullscreen.ts,
//     save as PNG → mermaidSave.ts
// Public interface unchanged: callers only use renderMermaidBlocks.

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
