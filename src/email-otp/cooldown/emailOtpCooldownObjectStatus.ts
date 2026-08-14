import type { EmailOtpCooldownObjectStorage } from "./emailOtpCooldownObjectStorage"
import { emailOtpCooldownSqlStatus } from "./emailOtpCooldownSqlStatus"
import type { EmailOtpCooldownStatus } from "./emailOtpCooldownStatusSchema"

export function emailOtpCooldownObjectStatus(
  storage: EmailOtpCooldownObjectStorage,
  now: number,
): EmailOtpCooldownStatus {
  const result = storage.transactionSync(() => emailOtpCooldownSqlStatus(storage.sql, now))
  return { expiresAt: result.expiresAt }
}
