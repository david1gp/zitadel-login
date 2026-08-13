import type { JSX } from "solid-js"

export const stylesBgDotted = {
  "background-size": "15px 15px",
  "background-image":
    "radial-gradient(circle at center, color-mix(in srgb, var(--brand-font) 41%, transparent) 1px, #0000 0)",
} as const satisfies JSX.CSSProperties
