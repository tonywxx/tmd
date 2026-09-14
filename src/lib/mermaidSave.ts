import { Download } from "lucide-react";
import { lucideSvg } from "./iconSvg";
import { svgToPngDataUri } from "./mermaid";
import { pickSaveImagePath } from "./bridge";
import { getFileSystem } from "./fs";
import { useStore } from "./store";

// "Save as PNG" toolbar action. Extracted from mermaidFigure.ts
// (candidate A): behavior unchanged, only relocated.
export function setupSave(btn: HTMLButtonElement | null, source: string): void {
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
