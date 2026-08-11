export function emailOtpV2SessionIsVerified(
  session: {
    id: string
    expirationDate?: string
    factors?: {
      user?: { id: string; organizationId: string }
      otpEmail?: { verifiedAt?: string }
    }
  },
  expected: { sessionId: string; userId: string; organizationId: string; verifiedNotBefore: number },
  now: number,
): boolean {
  if (session.id !== expected.sessionId) return false
  if (session.factors?.user?.id !== expected.userId) return false
  if (session.factors.user.organizationId !== expected.organizationId) return false
  const verifiedAt = Date.parse(session.factors.otpEmail?.verifiedAt ?? "")
  if (
    !Number.isFinite(verifiedAt) ||
    verifiedAt < expected.verifiedNotBefore * 1000 ||
    verifiedAt > (now + 60) * 1000
  ) {
    return false
  }
  if (session.expirationDate) {
    const expirationDate = Date.parse(session.expirationDate)
    if (!Number.isFinite(expirationDate) || expirationDate <= now * 1000) return false
  }
  return true
}
