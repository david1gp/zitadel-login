import { Database } from "bun:sqlite"
import { describe, expect, test } from "bun:test"

import { emailOtpCooldownClientCreate } from "../src/email-otp/cooldown/emailOtpCooldownClientCreate"
import { emailOtpCooldownObjectNameCreate } from "../src/email-otp/cooldown/emailOtpCooldownObjectNameCreate"
import { emailOtpCooldownSqlEmptyIs } from "../src/email-otp/cooldown/emailOtpCooldownSqlEmptyIs"
import { emailOtpCooldownSqlReserve } from "../src/email-otp/cooldown/emailOtpCooldownSqlReserve"
import { emailOtpCooldownSqlStatus } from "../src/email-otp/cooldown/emailOtpCooldownSqlStatus"
import type { EmailOtpCooldownSqlStorage } from "../src/email-otp/cooldown/emailOtpCooldownSqlStorage"

const cookieKey = "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA"
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

describe("email OTP cooldown Durable Object primitive", () => {
  test("reserves once, returns the stored expiry on rejection, and cleans expired rows", () => {
    const sql = emailOtpCooldownSqlFakeCreate()

    expect(emailOtpCooldownSqlReserve(sql, now)).toEqual({ accepted: true, expiresAt: now + 60 })
    expect(emailOtpCooldownSqlReserve(sql, now + 1)).toEqual({ accepted: false, expiresAt: now + 60 })
    expect(emailOtpCooldownSqlReserve(sql, now + 59)).toEqual({ accepted: false, expiresAt: now + 60 })
    expect(emailOtpCooldownSqlStatus(sql, now + 30)).toEqual({ expiresAt: now + 60, empty: false })

    expect(emailOtpCooldownSqlStatus(sql, now + 60)).toEqual({ expiresAt: 0, empty: true })
    expect(emailOtpCooldownSqlEmptyIs(sql)).toBe(true)
    expect(emailOtpCooldownSqlReserve(sql, now + 60)).toEqual({ accepted: true, expiresAt: now + 120 })
  })

  test("derives purpose-scoped HMAC object names without raw identifiers", async () => {
    const primary = await emailOtpCooldownObjectNameCreate(cookieKey, "email-otp", "auth-request-1")
    const again = await emailOtpCooldownObjectNameCreate(cookieKey, "email-otp", "auth-request-1")
    const mfa = await emailOtpCooldownObjectNameCreate(cookieKey, "mfa-email-otp", "auth-request-1")
    const other = await emailOtpCooldownObjectNameCreate(cookieKey, "email-otp", "auth-request-2")

    expect(primary.success && again.success && primary.data === again.data).toBe(true)
    expect(primary.success && primary.data.startsWith("email-otp:")).toBe(true)
    expect(mfa.success && mfa.data.startsWith("mfa-email-otp:")).toBe(true)
    expect(primary.success && other.success && primary.data !== other.data).toBe(true)
    expect(primary.success && mfa.success && primary.data !== mfa.data).toBe(true)
    expect(JSON.stringify([primary, mfa, other])).not.toContain("auth-request-1")
    expect(JSON.stringify([primary, mfa, other])).not.toContain("auth-request-2")
  })

  test("fails closed when the namespace, name, or Durable Object result is unavailable", async () => {
    const missing = emailOtpCooldownClientCreate({
      namespace: undefined,
      cookieKey,
      purpose: "email-otp",
      identifier: "auth-request-1",
    })
    expect(await missing.reserve(now)).toEqual({
      success: false,
      op: "emailOtpCooldownStubGet",
      errorMessage: "cooldown_unavailable",
    })

    const invalidName = emailOtpCooldownClientCreate({
      namespace: {
        getByName: () => ({
          reserve: async () => ({ accepted: true, expiresAt: now + 60 }),
          status: async () => ({ expiresAt: 0 }),
        }),
      },
      cookieKey: "not-a-key",
      purpose: "email-otp",
      identifier: "auth-request-1",
    })
    expect(await invalidName.status(now)).toEqual({
      success: false,
      op: "emailOtpCooldownObjectNameCreate",
      errorMessage: "cooldown_unavailable",
    })

    const names: string[] = []
    const client = emailOtpCooldownClientCreate({
      namespace: {
        getByName(name) {
          names.push(name)
          return {
            reserve: async () => {
              throw new Error("not exposed")
            },
            status: async () => ({ expiresAt: "nope" }),
          }
        },
      },
      cookieKey,
      purpose: "synthetic",
      identifier: "probe-1",
    })
    expect(await client.reserve(now)).toEqual({
      success: false,
      op: "emailOtpCooldownReserve",
      errorMessage: "cooldown_unavailable",
    })
    expect(await client.status(now)).toEqual({
      success: false,
      op: "emailOtpCooldownStatusGet",
      errorMessage: "cooldown_unavailable",
    })
    expect(names).toHaveLength(2)
    expect(names[0]).toMatch(/^synthetic:[A-Za-z0-9_-]{43}$/)
    expect(names[0]).toBe(names[1])
    expect(JSON.stringify(names)).not.toContain("probe-1")
  })

  test("returns validated reserve and status results from the stub", async () => {
    const client = emailOtpCooldownClientCreate({
      namespace: {
        getByName: () => ({
          reserve: async () => ({ accepted: true, expiresAt: now + 60 }),
          status: async () => ({ expiresAt: now + 12 }),
        }),
      },
      cookieKey,
      purpose: "email-otp",
      identifier: "auth-request-1",
    })

    expect(await client.reserve(now)).toEqual({ success: true, data: { accepted: true, expiresAt: now + 60 } })
    expect(await client.status(now)).toEqual({ success: true, data: { expiresAt: now + 12 } })
    expect(await client.reserve(now + 0.5)).toEqual({
      success: false,
      op: "emailOtpCooldownReserve",
      errorMessage: "cooldown_unavailable",
    })
  })
})
