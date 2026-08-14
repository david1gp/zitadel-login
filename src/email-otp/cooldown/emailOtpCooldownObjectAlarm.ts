import type { EmailOtpCooldownObjectStorage } from "./emailOtpCooldownObjectStorage"
import { emailOtpCooldownSqlExpiredCleanup } from "./emailOtpCooldownSqlExpiredCleanup"
import { emailOtpCooldownSqlSchemaEnsure } from "./emailOtpCooldownSqlSchemaEnsure"

export function emailOtpCooldownObjectAlarm(storage: EmailOtpCooldownObjectStorage, now: number) {
  storage.transactionSync(() => {
    emailOtpCooldownSqlSchemaEnsure(storage.sql)
    emailOtpCooldownSqlExpiredCleanup(storage.sql, now)
  })
}
