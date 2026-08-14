import type { EmailOtpCooldownSqlStorage } from "./emailOtpCooldownSqlStorage"

export function emailOtpCooldownSqlExpiresAtGet(sql: EmailOtpCooldownSqlStorage): number | undefined {
  const row = sql.exec("SELECT expires_at FROM reservation WHERE slot = 1").toArray()[0]
  return typeof row?.expires_at === "number" ? row.expires_at : undefined
}
