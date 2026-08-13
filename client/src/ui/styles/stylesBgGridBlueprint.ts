import type { JSX } from "solid-js"

export const stylesBgGridBlueprint = {
  "background-image": `
        linear-gradient(to bottom, color-mix(in srgb, var(--brand-font) 20%, transparent) 2px, transparent 2px),
        linear-gradient(to right, color-mix(in srgb, var(--brand-font) 20%, transparent) 2px, transparent 2px),
        linear-gradient(to bottom, color-mix(in srgb, var(--brand-font) 26%, transparent) 1px, transparent 1px),
        linear-gradient(to right, color-mix(in srgb, var(--brand-font) 26%, transparent) 1px, transparent 1px)`,
  "background-size": "100px 100px, 100px 100px, 20px 20px, 20px 20px",
  "background-position": "-1px -1px",
} as const satisfies JSX.CSSProperties
