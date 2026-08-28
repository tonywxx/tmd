import { useEffect, useRef } from "react";
import { useStore } from "../lib/store";
import { api } from "../lib/bridge";
import { getFileSystem } from "../lib/fs";
import { scrollSync } from "../lib/scrollSync";
import { PREVIEW_DEBOUNCE_MS } from "../lib/constants";
import {
  createPreviewPipeline,
  makeImageResolutionStage,
  makeMermaidStage,
} from "../lib/previewPipeline";

// One render pipeline adapter for the preview pane: markdown → image
// resolution → mermaid. Stages are declarative, so future transforms (TOC
// injection, link rewriting) slot in here without changing this component.
const previewPipeline = createPreviewPipeline([
  makeImageResolutionStage(async (src, baseDir) => {
    const fs = getFileSystem();
    const resolved = baseDir ? await fs.resolvePath(src, baseDir) : null;
    const path = resolved?.path ?? src;
    if (!(await fs.isImageAllowed(path))) return null;
    return fs.imageDataUri(path);
  }),
  makeMermaidStage(),
]);

export default function Preview() {
  const containerRef = useRef<HTMLDivElement>(null);
  const tabs = useStore((s) => s.tabs);
  const activeTabId = useStore((s) => s.activeTabId);
  const settings = useStore((s) => s.settings);
  const activeTab = tabs.find((t) => t.id === activeTabId) ?? null;

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    scrollSync.registerPreview(el);
    return () => scrollSync.unregisterPreview();
  }, [activeTabId]);

  // Run the render pipeline whenever content, the file's base dir, or the theme
  // (mermaid follows dark mode) changes. The pipeline owns the preview DOM, so
  // the component no longer uses dangerouslySetInnerHTML.
  useEffect(() => {
    const el = containerRef.current;
    if (!el || !activeTab) return;
    let cancelled = false;
    void previewPipeline
      .render(el, activeTab.content, { filePath: activeTab.filePath })
      .catch((err) => {
        if (!cancelled) console.error("preview render failed", err);
      });
    return () => {
      cancelled = true;
    };
  }, [activeTab?.content, activeTab?.filePath, settings.theme]);

  if (!activeTab) {
    return <div className="preview-empty" />;
  }

  const font =
    settings.previewFontFamily === "default"
      ? "var(--preview-font)"
      : settings.previewFontFamily;

  return (
    <div
      className={"preview markdown-body theme-" + settings.markdownTheme}
      ref={containerRef}
      style={{ fontFamily: font }}
      onClick={onPreviewClick}
    />
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
