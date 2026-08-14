import mermaid from "mermaid";

// Mermaid support for the markdown preview: renders ```mermaid fenced blocks
// (flowchart TD etc.) as SVG, with a per-diagram toolbar (zoom / reset /
// save-as-PNG) wired up by Preview.tsx.
//
// Mermaid's render() is async and its output must be bound with the
// `bindFunctions` it returns (security: click handlers are only attached
// there). We cache the rendered SVG string per (theme, source) so re-typing
// nearby text doesn't re-render unchanged diagrams, and re-inject each cached
// SVG under a fresh id to keep marker/clipPath references unique.

type DiagramResult = {
  /** id used inside the cached SVG markup (root <svg> id + refs). */
  id: string;
  /** SVG markup for the diagram. */
  svg: string;
  /** Binds click handlers (links / click actions) onto an element holding the SVG. */
  bind: (el: HTMLElement) => void;
};

let initialized = false;
let lastThemeKey: string | null = null;

function themeKey(): string {
  return document.documentElement.getAttribute("data-theme") === "dark"
    ? "dark"
    : "light";
}

/** id counter used for both render ids and per-injection ids. */
let idCounter = 0;
export function nextMermaidId(): string {
  idCounter += 1;
  return `mmd${idCounter}`;
}

function applyTheme() {
  const key = themeKey();
  if (initialized && key === lastThemeKey) return;
  initialized = true;
  lastThemeKey = key;
  mermaid.initialize({
    startOnLoad: false,
    securityLevel: "strict",
    theme: key === "dark" ? "dark" : "default",
    fontFamily:
      '-apple-system, BlinkMacSystemFont, "Helvetica Neue", Arial, sans-serif',
    flowchart: {
      htmlLabels: false,
      useMaxWidth: true,
      curve: "basis",
    },
  });
}

const diagramCache = new Map<string, DiagramResult>();

export async function renderMermaid(source: string): Promise<DiagramResult> {
  applyTheme();
  const key = `${lastThemeKey}|${source}`;
  const cached = diagramCache.get(key);
  if (cached) return cached;

  const id = nextMermaidId();
  const { svg, bindFunctions } = await mermaid.render(id, source);
  const result: DiagramResult = {
    id,
    svg,
    bind: (el: HTMLElement) => {
      try {
        bindFunctions?.(el);
      } catch {
        /* diagram without interactive bindings */
      }
    },
  };
  diagramCache.set(key, result);
  return result;
}

/** Drop cached diagrams so the next render picks up theme/config changes. */
export function clearMermaidCache(): void {
  diagramCache.clear();
}

type LabelInfo = {
  /** foreignObject x in the parent <g>'s local user units (default 0). */
  foX: number;
  foY: number;
  /** foreignObject width / height in the parent <g>'s local user units. */
  width: number;
  height: number;
  /** Text content, split into lines by <br>. */
  lines: string[];
  /** Resolved CSS color for the label text. */
  fill: string;
  /** Resolved CSS background color, or "none" if transparent. */
  bg: string;
  /** Font size expressed in the parent <g>'s local user units. */
  fontSize: number;
  /** Single-line height (fontSize * line-height). */
  lineHeight: number;
  /** Resolved CSS font-family stack. */
  fontFamily: string;
};

/** Walk an element, collecting text content and turning <br> into line breaks. */
function extractLines(el: Element): string[] {
  const lines: string[] = [""];
  const walk = (node: Node) => {
    if (node.nodeType === 3) {
      lines[lines.length - 1] += node.textContent ?? "";
    } else if (node.nodeType === 1) {
      const tag = (node as Element).tagName.toLowerCase();
      if (tag === "br") {
        lines.push("");
      } else {
        node.childNodes.forEach(walk);
      }
    }
  };
  el.childNodes.forEach(walk);
  const trimmed = lines.map((l) => l.trim());
  return trimmed.length > 0 ? trimmed : [""];
}

/**
 * Collect geometry, text, and style for every <foreignObject> in the live SVG.
 * Mermaid v11 emits <foreignObject> for edge labels (and some node labels)
 * even when htmlLabels is disabled. WebKit taints the canvas when an SVG
 * image containing <foreignObject> is drawn, so we replace these with native
 * SVG <rect>/<text> before rasterizing.
 */
function collectLabels(svg: SVGSVGElement): LabelInfo[] {
  const svgRect = svg.getBoundingClientRect();
  const vb = svg.viewBox.baseVal;
  const svgRootScale = vb.width > 0 ? svgRect.width / vb.width : 1;
  const fos = Array.from(svg.querySelectorAll<SVGGraphicsElement>("foreignObject"));
  return fos.map((fo) => {
    const foX = Number(fo.getAttribute("x")) || 0;
    const foY = Number(fo.getAttribute("y")) || 0;
    const width = Number(fo.getAttribute("width")) || 0;
    const height = Number(fo.getAttribute("height")) || 0;
    const target = (fo.querySelector("span") ??
      fo.querySelector("div") ??
      fo) as Element;
    const cs = getComputedStyle(target);
    const fill = cs.color || "#333";
    const bgRaw = cs.backgroundColor || "transparent";
    const bg =
      bgRaw === "transparent" || /^rgba\(.*,\s*0\)$/.test(bgRaw)
        ? "none"
        : bgRaw;
    const fontFamily = cs.fontFamily || "";
    const cssFontSize = parseFloat(cs.fontSize) || 14;
    let gScale = 1;
    const parent = fo.parentNode as SVGGraphicsElement | null;
    if (parent && typeof parent.getCTM === "function") {
      const ctm = parent.getCTM();
      if (ctm) gScale = Math.hypot(ctm.a, ctm.b) || 1;
    }
    const fontSize = cssFontSize / (svgRootScale * gScale);
    const lineHeight = fontSize * 1.5;
    const lines = extractLines(target);
    return { foX, foY, width, height, lines, fill, bg, fontSize, lineHeight, fontFamily };
  });
}

/**
 * Replace each <foreignObject> in the clone with an SVG <rect> background and
 * one centered <text> per line. Positions are written in the parent <g>'s
 * local frame so the parent's transform places the new nodes exactly where
 * the original foreignObject rendered.
 */
function replaceForeignObjects(clone: SVGSVGElement, labels: LabelInfo[]): void {
  const SVG_NS = "http://www.w3.org/2000/svg";
  const fos = Array.from(clone.querySelectorAll("foreignObject"));
  fos.forEach((fo, i) => {
    const info = labels[i];
    if (!info || info.width <= 0 || info.height <= 0) {
      fo.remove();
      return;
    }
    const cx = info.foX + info.width / 2;
    const cy = info.foY + info.height / 2;
    const blockH = info.lines.length * info.lineHeight;
    const topY = cy - blockH / 2 + info.lineHeight / 2;

    const rect = document.createElementNS(SVG_NS, "rect");
    rect.setAttribute("x", String(info.foX));
    rect.setAttribute("y", String(info.foY));
    rect.setAttribute("width", String(info.width));
    rect.setAttribute("height", String(info.height));
    rect.setAttribute("rx", "2");
    rect.setAttribute("ry", "2");
    rect.setAttribute("fill", info.bg);

    const nodes: Node[] = [rect];
    info.lines.forEach((line, idx) => {
      const t = document.createElementNS(SVG_NS, "text");
      t.setAttribute("x", String(cx));
      t.setAttribute("y", String(topY + idx * info.lineHeight));
      t.setAttribute("text-anchor", "middle");
      t.setAttribute("dominant-baseline", "middle");
      t.setAttribute("font-size", `${info.fontSize}px`);
      t.setAttribute("fill", info.fill);
      if (info.fontFamily) t.setAttribute("font-family", info.fontFamily);
      t.textContent = line;
      nodes.push(t);
    });
    fo.replaceWith(...nodes);
  });
}

/**
 * Rasterize the diagram's <svg> into a PNG data URL at `scale` for sharpness.
 * The SVG is cloned so the live diagram keeps its zoom/pan transform, and any
 * <foreignObject> elements are rewritten as native SVG <rect>/<text> so the
 * image can be drawn into a canvas without tainting it (required for the
 * Tauri's WKWebView on macOS, where <foreignObject> would otherwise mark the
 * canvas as insecure and make `toDataURL` throw SecurityError).
 */
export async function svgToPngDataUri(
  svg: SVGSVGElement,
  scale = 2,
): Promise<string> {
  const vb = svg.viewBox.baseVal;
  const w = Math.max(1, Math.round((vb.width || Number(svg.getAttribute("width")) || 0) * scale));
  const h = Math.max(1, Math.round((vb.height || Number(svg.getAttribute("height")) || 0) * scale));

  // Collect label info from the live DOM, then mutate a fresh clone so the
  // rendered diagram (which the user is still interacting with) is untouched.
  const labels = collectLabels(svg);
  const clone = svg.cloneNode(true) as SVGSVGElement;
  clone.setAttribute("width", String(w));
  clone.setAttribute("height", String(h));
  clone.removeAttribute("style");
  replaceForeignObjects(clone, labels);

  const xml = new XMLSerializer().serializeToString(clone);
  const data = `data:image/svg+xml;base64,${btoa(
    unescape(encodeURIComponent(xml)),
  )}`;

  const img = new Image();
  img.decoding = "async";
  const loaded = new Promise<void>((resolve, reject) => {
    img.onload = () => resolve();
    img.onerror = () => reject(new Error("Failed to rasterize diagram"));
  });
  img.src = data;
  await loaded;

  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas not available");
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, w, h);
  ctx.drawImage(img, 0, 0, w, h);
  return canvas.toDataURL("image/png");
}
