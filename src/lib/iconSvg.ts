import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import type { LucideIcon } from "lucide-react";
import { ICON_SIZE, ICON_STROKE } from "../components/Icon";

/**
 * Render a Lucide icon to a standalone SVG string. Used for the mermaid
 * diagram toolbar, which is built imperatively as vanilla DOM (not React) so
 * we can't drop in an <Icon /> component. Keeps it sized consistently with
 * the rest of the app via the shared ICON_SIZE / ICON_STROKE constants.
 */
export function lucideSvg(icon: LucideIcon): string {
  return renderToStaticMarkup(
    createElement(icon, {
      size: ICON_SIZE,
      strokeWidth: ICON_STROKE,
      "aria-hidden": true,
      focusable: false,
    }),
  );
}
