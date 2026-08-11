export function loginHintMatches(
  loginHint: string | undefined,
  label: string,
  userPreferredLoginName: string | undefined,
  userEmail: string | undefined,
  sessionLoginName: string | undefined,
  sessionDisplayName: string | undefined,
  userDisplayName: string | undefined,
): boolean {
  if (!loginHint) return true
  const target = loginHint.trim().toLowerCase()
  if (target.length === 0) return true

  const candidates = [
    label,
    userPreferredLoginName,
    userEmail,
    sessionLoginName,
    sessionDisplayName,
    userDisplayName,
  ].filter((item): item is string => typeof item === "string" && item.length > 0)

  return candidates.some((candidate) => candidate.trim().toLowerCase() === target)
}
