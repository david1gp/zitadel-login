export function loginQueryFilter(search: string): string {
  if (!search) return ""
  const params = new URLSearchParams(search.startsWith("?") ? search : `?${search}`)
  const allowed = new Set(["flow", "dialog", "q"])
  const keysToRemove: string[] = []
  for (const key of params.keys()) {
    if (!allowed.has(key)) {
      keysToRemove.push(key)
    }
  }
  for (const key of keysToRemove) {
    params.delete(key)
  }
  const result = params.toString()
  return result ? `?${result}` : ""
}
