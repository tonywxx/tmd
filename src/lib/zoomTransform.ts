// Pure affine-transform math for the mermaid figure viewport (zoom anchored at
// the cursor, pan). Extracted from mermaidFigure.ts so the geometry is
// unit-testable without DOM event handlers.

export interface ViewTransform {
  k: number;
  tx: number;
  ty: number;
}

export const MIN_ZOOM = 0.2;
export const MAX_ZOOM = 8;

export function identityTransform(): ViewTransform {
  return { k: 1, tx: 0, ty: 0 };
}

/**
 * Zoom the transform so that the viewport point (cx, cy) stays fixed under the
 * cursor. Clamps k to [MIN_ZOOM, MAX_ZOOM].
 */
export function zoomAt(
  t: ViewTransform,
  cx: number,
  cy: number,
  nextK: number,
): ViewTransform {
  const k = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, nextK));
  const wx = (cx - t.tx) / t.k;
  const wy = (cy - t.ty) / t.k;
  return { k, tx: cx - wx * k, ty: cy - wy * k };
}

export function pan(t: ViewTransform, dx: number, dy: number): ViewTransform {
  return { k: t.k, tx: t.tx + dx, ty: t.ty + dy };
}

export function transformStyle(t: ViewTransform): string {
  return `translate(${t.tx}px, ${t.ty}px) scale(${t.k})`;
}
