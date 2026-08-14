import type { EmailOtpCooldownSqlStorage } from "./emailOtpCooldownSqlStorage"

export function emailOtpCooldownSqlEmptyIs(sql: EmailOtpCooldownSqlStorage): boolean {
  return sql.exec("SELECT 1 AS present FROM reservation LIMIT 1").toArray().length === 0
}
