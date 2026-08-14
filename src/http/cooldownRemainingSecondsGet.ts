export function cooldownRemainingSecondsGet(expiresAt: number, now: number): number {
  return Math.max(0, Math.ceil(expiresAt - now))
}
