import type { EmailOtpCooldownSqlStorage } from "./emailOtpCooldownSqlStorage"

export function emailOtpCooldownSqlSchemaEnsure(sql: EmailOtpCooldownSqlStorage) {
  sql.exec(`
    CREATE TABLE IF NOT EXISTS reservation (
      slot INTEGER PRIMARY KEY CHECK (slot = 1),
      expires_at INTEGER NOT NULL
    )
  `)
}
