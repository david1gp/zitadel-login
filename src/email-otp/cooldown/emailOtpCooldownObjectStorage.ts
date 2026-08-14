import type { EmailOtpCooldownSqlStorage } from "./emailOtpCooldownSqlStorage"

export type EmailOtpCooldownObjectStorage = {
  sql: EmailOtpCooldownSqlStorage
  transactionSync: <T>(closure: () => T) => T
  setAlarm: (scheduledTime: number) => Promise<void>
}
