import type { DemoChrome } from "./demoChromeSchema"

export function demoUrlGet(input: { path: string; chrome: DemoChrome; picker?: boolean }): string {
  const next = new URLSearchParams()
  if (input.chrome !== "sidebar") next.set("chrome", input.chrome)
  if (input.picker) next.set("picker", "1")
  const suffix = next.toString()
  return suffix ? `${input.path}?${suffix}` : input.path
}
