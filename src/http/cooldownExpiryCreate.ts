export function cooldownExpiryCreate(now: number, durationSeconds: number): number {
  return now + durationSeconds
}
