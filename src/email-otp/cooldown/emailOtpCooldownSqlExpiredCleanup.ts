import type { EmailOtpCooldownSqlStorage } from "./emailOtpCooldownSqlStorage"

export function emailOtpCooldownSqlExpiredCleanup(sql: EmailOtpCooldownSqlStorage, now: number) {
  sql.exec("DELETE FROM reservation WHERE expires_at <= ?", now)
}
