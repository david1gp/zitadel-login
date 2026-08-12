import type { DemoChrome } from "./demoChromeSchema"

export function demoUrlGet(input: { path: string; chrome: DemoChrome; query: string; picker?: boolean }): string {
  const next = new URLSearchParams()
  if (input.chrome !== "sidebar") next.set("chrome", input.chrome)
  if (input.query) next.set("q", input.query)
  if (input.picker) next.set("picker", "1")
  const suffix = next.toString()
  return suffix ? `${input.path}?${suffix}` : input.path
}
