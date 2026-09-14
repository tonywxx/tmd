import {
  identityTransform,
  zoomAt,
  pan,
  transformStyle,
  type ViewTransform,
} from "./zoomTransform";

// Pan/zoom interaction for a mermaid figure viewport. Extracted from
// mermaidFigure.ts (candidate A): behavior unchanged, only relocated.
export function setupPanZoom(
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
