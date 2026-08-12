export function demoRequestPathGet(input: RequestInfo | URL): string {
  if (typeof input === "string") return new URL(input, "https://demo.local").pathname
  if (input instanceof URL) return input.pathname
  return new URL(input.url, "https://demo.local").pathname
}
