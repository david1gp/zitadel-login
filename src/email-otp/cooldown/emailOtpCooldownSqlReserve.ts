import { emailOtpCooldownReservationDecide } from "./emailOtpCooldownReservationDecide"
import type { EmailOtpCooldownReserveResult } from "./emailOtpCooldownReserveResultSchema"
import { emailOtpCooldownSqlExpiredCleanup } from "./emailOtpCooldownSqlExpiredCleanup"
import { emailOtpCooldownSqlExpiresAtGet } from "./emailOtpCooldownSqlExpiresAtGet"
import { emailOtpCooldownSqlSchemaEnsure } from "./emailOtpCooldownSqlSchemaEnsure"
import type { EmailOtpCooldownSqlStorage } from "./emailOtpCooldownSqlStorage"

export function emailOtpCooldownSqlReserve(
  sql: EmailOtpCooldownSqlStorage,
  now: number,
): EmailOtpCooldownReserveResult {
  emailOtpCooldownSqlSchemaEnsure(sql)
  emailOtpCooldownSqlExpiredCleanup(sql, now)
  const decided = emailOtpCooldownReservationDecide(emailOtpCooldownSqlExpiresAtGet(sql), now)
  if (decided.accepted) {
    sql.exec("INSERT OR REPLACE INTO reservation (slot, expires_at) VALUES (1, ?)", decided.storedExpiresAt)
  }
  return { accepted: decided.accepted, expiresAt: decided.expiresAt }
}
