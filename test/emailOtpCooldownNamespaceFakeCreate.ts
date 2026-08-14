import { Database } from "bun:sqlite"

import type { WorkerEmailOtpCooldown } from "../src/config/workerBindingsSchema"
import { emailOtpCooldownSqlReserve } from "../src/email-otp/cooldown/emailOtpCooldownSqlReserve"
import { emailOtpCooldownSqlStatus } from "../src/email-otp/cooldown/emailOtpCooldownSqlStatus"
import type { EmailOtpCooldownSqlStorage } from "../src/email-otp/cooldown/emailOtpCooldownSqlStorage"

function emailOtpCooldownSqlFakeCreate(): EmailOtpCooldownSqlStorage {
  const database = new Database(":memory:")
  return {
    exec(query, ...bindings) {
      const statement = database.query(query)
      if (query.trimStart().toUpperCase().startsWith("SELECT")) {
        return {
          toArray: () => statement.all(...bindings) as ReturnType<EmailOtpCooldownSqlStorage["exec"]>["toArray"],
        }
      }
      statement.run(...bindings)
      return { toArray: () => [] }
    },
  }
}

export function emailOtpCooldownNamespaceFakeCreate(): WorkerEmailOtpCooldown & { reset: () => void } {
  const objects = new Map<string, EmailOtpCooldownSqlStorage>()
  return {
    getByName(name) {
      let sql = objects.get(name)
      if (!sql) {
        sql = emailOtpCooldownSqlFakeCreate()
        objects.set(name, sql)
      }
      return {
        reserve: async (now) => emailOtpCooldownSqlReserve(sql, now),
        status: async (now) => {
          const result = emailOtpCooldownSqlStatus(sql, now)
          return { expiresAt: result.expiresAt }
        },
      }
    },
    reset() {
      objects.clear()
    },
  }
}
