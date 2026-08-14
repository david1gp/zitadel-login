import { Database } from "bun:sqlite"
import { describe, expect, test } from "bun:test"

import { emailOtpCooldownObjectAlarm } from "../src/email-otp/cooldown/emailOtpCooldownObjectAlarm"
import { emailOtpCooldownObjectReserve } from "../src/email-otp/cooldown/emailOtpCooldownObjectReserve"
import type { EmailOtpCooldownObjectStorage } from "../src/email-otp/cooldown/emailOtpCooldownObjectStorage"
import { emailOtpCooldownObjectStatus } from "../src/email-otp/cooldown/emailOtpCooldownObjectStatus"
import { emailOtpCooldownSqlEmptyIs } from "../src/email-otp/cooldown/emailOtpCooldownSqlEmptyIs"
import { emailOtpCooldownSqlReserve } from "../src/email-otp/cooldown/emailOtpCooldownSqlReserve"
import type { EmailOtpCooldownSqlStorage } from "../src/email-otp/cooldown/emailOtpCooldownSqlStorage"
import { emailOtpCooldownSqlStatus } from "../src/email-otp/cooldown/emailOtpCooldownSqlStatus"

const now = 1_800_000_000

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

function emailOtpCooldownObjectStorageFakeCreate(input?: {
  setAlarm?: (scheduledTime: number) => Promise<void>
  afterTransaction?: () => void
}): EmailOtpCooldownObjectStorage & { setAlarmTimes: number[] } {
  const sql = emailOtpCooldownSqlFakeCreate()
  const setAlarmTimes: number[] = []
  return {
    sql,
    setAlarmTimes,
    transactionSync(closure) {
      const result = closure()
      input?.afterTransaction?.()
      return result
    },
    async setAlarm(scheduledTime) {
      await (input?.setAlarm ? input.setAlarm(scheduledTime) : Promise.resolve())
      setAlarmTimes.push(scheduledTime)
    },
  }
}

describe("email OTP cooldown Durable Object storage operations", () => {
  test("status cleanup racing a new reserve keeps the accepted reservation", () => {
    const raced: Array<ReturnType<typeof emailOtpCooldownSqlReserve>> = []
    const storage = emailOtpCooldownObjectStorageFakeCreate({
      afterTransaction() {
        if (raced.length > 0) return
        raced.push(emailOtpCooldownSqlReserve(storage.sql, now))
      },
    })
    emailOtpCooldownSqlReserve(storage.sql, now - 60)

    expect(emailOtpCooldownObjectStatus(storage, now)).toEqual({ expiresAt: 0 })
    expect(raced).toEqual([{ accepted: true, expiresAt: now + 60 }])
    expect(emailOtpCooldownSqlStatus(storage.sql, now)).toEqual({ expiresAt: now + 60, empty: false })
    expect(emailOtpCooldownSqlEmptyIs(storage.sql)).toBe(false)
  })

  test("alarm cleanup racing a new reserve keeps the accepted reservation", () => {
    const raced: Array<ReturnType<typeof emailOtpCooldownSqlReserve>> = []
    const storage = emailOtpCooldownObjectStorageFakeCreate({
      afterTransaction() {
        if (raced.length > 0) return
        raced.push(emailOtpCooldownSqlReserve(storage.sql, now))
      },
    })
    emailOtpCooldownSqlReserve(storage.sql, now - 60)

    emailOtpCooldownObjectAlarm(storage, now)
    expect(raced).toEqual([{ accepted: true, expiresAt: now + 60 }])
    expect(emailOtpCooldownObjectStatus(storage, now)).toEqual({ expiresAt: now + 60 })
    expect(emailOtpCooldownSqlEmptyIs(storage.sql)).toBe(false)
  })

  test("alarm overlapping a live reservation does not delete it", async () => {
    const storage = emailOtpCooldownObjectStorageFakeCreate()

    expect(await emailOtpCooldownObjectReserve(storage, now)).toEqual({ accepted: true, expiresAt: now + 60 })
    emailOtpCooldownObjectAlarm(storage, now)

    expect(emailOtpCooldownObjectStatus(storage, now)).toEqual({ expiresAt: now + 60 })
    expect(await emailOtpCooldownObjectReserve(storage, now + 1)).toEqual({ accepted: false, expiresAt: now + 60 })
  })

  test("accepted reserve fails closed when setAlarm fails and keeps the reservation", async () => {
    const storage = emailOtpCooldownObjectStorageFakeCreate({
      setAlarm: async () => {
        throw new Error("setAlarm failed")
      },
    })

    await expect(emailOtpCooldownObjectReserve(storage, now)).rejects.toThrow("setAlarm failed")
    expect(storage.setAlarmTimes).toEqual([])
    expect(emailOtpCooldownObjectStatus(storage, now)).toEqual({ expiresAt: now + 60 })
    expect(await emailOtpCooldownObjectReserve(storage, now + 1)).toEqual({ accepted: false, expiresAt: now + 60 })
    expect(emailOtpCooldownSqlReserve(storage.sql, now + 1)).toEqual({ accepted: false, expiresAt: now + 60 })
  })
})
