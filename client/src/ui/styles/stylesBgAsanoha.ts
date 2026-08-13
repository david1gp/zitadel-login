import type { JSX } from "solid-js"

export const stylesBgAsanoha = {
  "background-attachment": "fixed",
  "background-image": `url("data:image/svg+xml,${encodeURIComponent(`<svg xmlns='http://www.w3.org/2000/svg' width='100%' height='100%'><defs><pattern id='a' patternUnits='userSpaceOnUse' width='41.569' height='72'><path fill='none' stroke='#aeaeae69' stroke-width='0.6' d='M20.785 0L41.569 12 41.569 36 20.785 48 0 36 0 12Z M0 36L20.785 48 20.785 72 0 84-20.785 72-20.785 48Z M41.569 36L62.354 48 62.354 72 41.569 84 20.785 72 20.785 48Z M20.785 0L20.785 48M41.569 12L0 36M41.569 36L0 12 M0 36L0 84M20.785 48L-20.785 72M20.785 72L-20.785 48 M41.569 36L41.569 84M62.354 48L20.785 72M62.354 72L20.785 48 M0 0L0 12M41.569 0L41.569 12'/></pattern></defs><rect width='800%' height='800%' fill='url(#a)'/></svg>`)}")`,
} as const satisfies JSX.CSSProperties
