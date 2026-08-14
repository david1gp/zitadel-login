import { emailOtpCooldownSqlEmptyIs } from "./emailOtpCooldownSqlEmptyIs"
import { emailOtpCooldownSqlExpiredCleanup } from "./emailOtpCooldownSqlExpiredCleanup"
import { emailOtpCooldownSqlExpiresAtGet } from "./emailOtpCooldownSqlExpiresAtGet"
import { emailOtpCooldownSqlSchemaEnsure } from "./emailOtpCooldownSqlSchemaEnsure"
import type { EmailOtpCooldownSqlStorage } from "./emailOtpCooldownSqlStorage"
import { emailOtpCooldownStatusDecide } from "./emailOtpCooldownStatusDecide"

export function emailOtpCooldownSqlStatus(sql: EmailOtpCooldownSqlStorage, now: number) {
  emailOtpCooldownSqlSchemaEnsure(sql)
  emailOtpCooldownSqlExpiredCleanup(sql, now)
  const decided = emailOtpCooldownStatusDecide(emailOtpCooldownSqlExpiresAtGet(sql), now)
  return { expiresAt: decided.expiresAt, empty: emailOtpCooldownSqlEmptyIs(sql) }
}
