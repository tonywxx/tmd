import type { ComponentProps } from "react";
import type { LucideIcon } from "lucide-react";

/** Unified icon size (px) used across the whole app. */
export const ICON_SIZE = 16;

/** Unified stroke width for icons. */
export const ICON_STROKE = 2;

type IconProps = ComponentProps<LucideIcon>;

/**
 * Shared wrapper so every Lucide icon in the app is rendered at the same
 * size/stroke by default. Override with `size`/`strokeWidth` only when a
 * specific spot needs to differ.
 */
export function Icon({
  icon: IconCmp,
  size = ICON_SIZE,
  strokeWidth = ICON_STROKE,
  ...rest
}: { icon: LucideIcon } & IconProps) {
  return <IconCmp size={size} strokeWidth={strokeWidth} aria-hidden="true" {...rest} />;
}
