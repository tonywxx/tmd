import { useEffect, useRef } from "react";
import { useStore } from "../lib/store";
import { api } from "../lib/bridge";
import { getFileSystem } from "../lib/fs";
import { renderMarkdown } from "../lib/markdown";
import { renderMermaidBlocks } from "../lib/mermaidFigure";
import { scrollSync } from "../lib/scrollSync";
import { PREVIEW_DEBOUNCE_MS } from "../lib/constants";
import { basename } from "../lib/pathutil";

export default function Preview() {
  const containerRef = useRef<HTMLDivElement>(null);
  const tabs = useStore((s) => s.tabs);
  const activeTabId = useStore((s) => s.activeTabId);
  const settings = useStore((s) => s.settings);
  const activeTab = tabs.find((t) => t.id === activeTabId) ?? null;

  const html = activeTab ? renderMarkdown(activeTab.content) : "";

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    scrollSync.registerPreview(el);
    return () => scrollSync.unregisterPreview();
  }, [activeTabId]);

  // Resolve local images to base64 data URIs (security: no custom protocol).
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    let cancelled = false;
    const imgs = Array.from(el.querySelectorAll("img")) as HTMLImageElement[];
    const dir = activeTab?.filePath ? basename(activeTab.filePath, true) : null;
    imgs.forEach(async (img) => {
      const src = img.getAttribute("src") || "";
      if (!src || /^https?:\/\//.test(src) || src.startsWith("data:")) return;
      try {
        const fs = getFileSystem();
        const resolved = dir ? await fs.resolvePath(src, dir) : null;
        const path = resolved?.path ?? src;
        if (!(await fs.isImageAllowed(path))) return;
        const dataUri = await fs.imageDataUri(path);
        if (dataUri && !cancelled) img.src = dataUri;
      } catch {
        /* ignore unresolvable images */
      }
    });
    return () => {
      cancelled = true;
    };
  }, [html, activeTab?.filePath]);

  // Render ```mermaid code blocks as interactive diagrams. Re-runs when the
  // content changes or when the theme toggles (so diagrams follow dark mode).
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    let cancelled = false;
    void renderMermaidBlocks(el).catch((err) => {
      if (!cancelled) console.error("mermaid render failed", err);
    });
    return () => {
      cancelled = true;
    };
  }, [html, settings.theme]);

  if (!activeTab) {
    return (
      <>
        <div className="preview-empty" />
      </>
    );
  }

  const font =
    settings.previewFontFamily === "default"
      ? "var(--preview-font)"
      : settings.previewFontFamily;

  return (
    <>
      <div
        className={"preview markdown-body theme-" + settings.markdownTheme}
        ref={containerRef}
        style={{ fontFamily: font }}
        onClick={onPreviewClick}
        dangerouslySetInnerHTML={{ __html: html }}
      />
    </>
  );
}

function onPreviewClick(e: React.MouseEvent<HTMLDivElement>) {
  const target = e.target as HTMLElement;
  const anchor = target.closest("a");
  if (!anchor) return;
  const href = anchor.getAttribute("href") || "";
  if (href.startsWith("http://") || href.startsWith("https://")) {
    e.preventDefault();
    void api.openExternal(href);
  }
  // internal #anchors and relative .md links fall through to default behavior.
  void PREVIEW_DEBOUNCE_MS;
}
