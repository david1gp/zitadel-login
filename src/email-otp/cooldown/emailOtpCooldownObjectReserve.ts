import type { EmailOtpCooldownObjectStorage } from "./emailOtpCooldownObjectStorage"
import type { EmailOtpCooldownReserveResult } from "./emailOtpCooldownReserveResultSchema"
import { emailOtpCooldownSqlReserve } from "./emailOtpCooldownSqlReserve"

export async function emailOtpCooldownObjectReserve(
  storage: EmailOtpCooldownObjectStorage,
  now: number,
): Promise<EmailOtpCooldownReserveResult> {
  const result = storage.transactionSync(() => emailOtpCooldownSqlReserve(storage.sql, now))
  if (!result.accepted) return result
  await storage.setAlarm(result.expiresAt * 1000)
  return result
}
