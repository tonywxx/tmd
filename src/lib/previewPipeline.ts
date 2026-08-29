import { isMarkdown, isOpenable } from "./constants";
import { renderMarkdown } from "./markdown";
import { renderMermaidBlocks } from "./mermaidFigure";
import { basename } from "./pathutil";

// The preview render pipeline is the single adapter that turns markdown content
// into a fully-rendered preview DOM. It replaces the three ad-hoc effects that
// previously lived in Preview.tsx (markdown render, image resolution, mermaid)
// with one ordered, declarative set of stages. New transforms — TOC injection,
// link rewriting, heading anchors — slot in as extra stages without touching
// the React component.

export interface PreviewRenderContext {
  filePath?: string | null;
  // Resolves a relative/absolute image src to a data URI, or null to leave it.
  resolveImage?: (src: string, baseDir: string | null) => Promise<string | null>;
}

export type PreviewStage = (
  el: HTMLElement,
  ctx: PreviewRenderContext
) => Promise<void> | void;

export interface PreviewPipeline {
  render(el: HTMLElement, content: string, ctx: PreviewRenderContext): Promise<void>;
}

export function createPreviewPipeline(stages: PreviewStage[]): PreviewPipeline {
  return {
    async render(el, content, ctx) {
      // Openable files that are not markdown (JSON, TOML, YAML) are shown
      // verbatim — running them through the markdown renderer mangles them.
      if (ctx.filePath && isOpenable(ctx.filePath) && !isMarkdown(ctx.filePath)) {
        el.innerHTML = "";
        const pre = document.createElement("pre");
        pre.className = "preview-plain";
        pre.textContent = content;
        el.appendChild(pre);
        return;
      }
      // The pipeline owns the preview DOM. Markdown first, then each
      // post-render stage in order; the last stage to run wins per element.
      el.innerHTML = renderMarkdown(content);
      for (const stage of stages) {
        await stage(el, ctx);
      }
    },
  };
}

export function makeImageResolutionStage(
  resolveImage: (src: string, baseDir: string | null) => Promise<string | null>
): PreviewStage {
  return async (el, ctx) => {
    const imgs = Array.from(el.querySelectorAll("img")) as HTMLImageElement[];
    const baseDir = ctx.filePath ? basename(ctx.filePath, true) : null;
    await Promise.all(
      imgs.map(async (img) => {
        const src = img.getAttribute("src") || "";
        // Leave remote and inline images alone; only local paths get inlined.
        if (!src || /^https?:\/\//.test(src) || src.startsWith("data:")) return;
        const dataUri = await resolveImage(src, baseDir);
        if (dataUri) img.src = dataUri;
      })
    );
  };
}

export function makeMermaidStage(): PreviewStage {
  return (el) => {
    void renderMermaidBlocks(el).catch((e) => console.error("mermaid render failed", e));
  };
}
