import type { EmailOtpCooldownStatus } from "./emailOtpCooldownStatusSchema"

export function emailOtpCooldownStatusDecide(
  storedExpiresAt: number | undefined,
  now: number,
): EmailOtpCooldownStatus & { storedExpiresAt: number | undefined } {
  if (storedExpiresAt !== undefined && storedExpiresAt > now) {
    return { expiresAt: storedExpiresAt, storedExpiresAt }
  }

  return { expiresAt: 0, storedExpiresAt: undefined }
}
