export function recentAccountInitialsGet(label: string): string {
  const trimmed = label.trim()
  if (!trimmed) return ""

  const cleanText = trimmed.includes("@") ? (trimmed.split("@")[0] ?? trimmed) : trimmed
  const parts = cleanText.split(/[\s._-]+/).filter((part) => part.length > 0)

  if (parts.length === 0) return ""
  if (parts.length === 1) {
    const word = parts[0] ?? ""
    return word.slice(0, 2).toUpperCase()
  }

  const first = parts[0] ?? ""
  const last = parts[parts.length - 1] ?? ""
  const firstChar = first.charAt(0)
  const lastChar = last.charAt(0)

  return (firstChar + lastChar).toUpperCase()
}
