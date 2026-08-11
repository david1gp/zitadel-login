export function loginIdentifierNormalize(value: string): string {
  const trimmed = value.trim()
  return trimmed.includes("@") ? trimmed.toLowerCase() : trimmed
}
