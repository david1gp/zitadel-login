import type { JSX } from "solid-js"

export const stylesBgDottedSparse = {
  "background-size": "10px 10px",
  "background-repeat": "repeat",
  "background-image":
    "radial-gradient(circle at .75px .75px, color-mix(in srgb, var(--brand-font) 13%, transparent) .75px, #0000 0)",
} as const satisfies JSX.CSSProperties
