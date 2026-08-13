import type { JSX } from "solid-js"

export const stylesBgGrid = {
  "background-image": `linear-gradient(to right, color-mix(in srgb, var(--brand-font) 41%, transparent) 1px, transparent 1px),
        linear-gradient(to bottom, color-mix(in srgb, var(--brand-font) 41%, transparent) 1px, transparent 1px)`,
  "background-size": "16px 16px",
} as const satisfies JSX.CSSProperties
