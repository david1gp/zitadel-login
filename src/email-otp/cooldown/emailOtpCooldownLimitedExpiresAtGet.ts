export function emailOtpCooldownLimitedExpiresAtGet(result: {
  errorMessage: string
  rawData?: unknown
}): number | undefined {
  if (result.errorMessage !== "rate_limited") return undefined
  if (!result.rawData || typeof result.rawData !== "object" || !("expiresAt" in result.rawData)) return undefined
  return typeof result.rawData.expiresAt === "number" ? result.rawData.expiresAt : undefined
}
