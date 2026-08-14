import { emailOtpCooldownDurationSeconds } from "./emailOtpCooldownDurationSeconds"
import type { EmailOtpCooldownReserveResult } from "./emailOtpCooldownReserveResultSchema"

export function emailOtpCooldownReservationDecide(
  storedExpiresAt: number | undefined,
  now: number,
): EmailOtpCooldownReserveResult & { storedExpiresAt: number } {
  if (storedExpiresAt !== undefined && storedExpiresAt > now) {
    return { accepted: false, expiresAt: storedExpiresAt, storedExpiresAt }
  }

  const expiresAt = now + emailOtpCooldownDurationSeconds
  return { accepted: true, expiresAt, storedExpiresAt: expiresAt }
}
