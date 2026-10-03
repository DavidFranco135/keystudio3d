import type { CSSProperties } from "react";

type Focus = { url: string; x: number; y: number };

export function focusFor(focus: Focus[] | undefined, url: string | undefined): { x: number; y: number } {
  const found = focus?.find((f) => f.url === url);
  return found ? { x: found.x, y: found.y } : { x: 50, y: 50 };
}

export function focusStyle(focus: Focus[] | undefined, url: string | undefined): CSSProperties {
  const { x, y } = focusFor(focus, url);
  return { objectPosition: `${x}% ${y}%` };
}
