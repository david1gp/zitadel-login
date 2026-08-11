import { describe, expect, test } from "bun:test"

import { recentAccountCookieOpen } from "../src/session/domain/recentAccountCookieOpen"
import { recentAccountCookieSeal } from "../src/session/domain/recentAccountCookieSeal"
import { recentAccountCookieUpsert } from "../src/session/domain/recentAccountCookieUpsert"
import type { RecentAccount } from "../src/session/model/recentAccountCookieSchema"

const key = "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA"
const previousKey = "BBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB"
const now = 1_800_000_000

function account(overrides: Partial<RecentAccount> = {}): RecentAccount {
  return {
    userId: "user-1",
    sessionId: "session-1",
    sessionToken: "token-1",
    organizationId: "org-1",
    authAt: now,
    lastUsedAt: now,
    expiresAt: now + 3600,
    ...overrides,
  }
}

async function seal(
  cookie: ReturnType<typeof recentAccountCookieUpsert>,
  cookieKey = key,
  ivByte = 1,
): Promise<string> {
  const result = await recentAccountCookieSeal(cookie, cookieKey, new Uint8Array(12).fill(ivByte))
  if (!result.success) throw new Error("Expected recent account cookie to seal")
  return result.data
}

describe("recent account cookie domain", () => {
  test("inserts the first account with bounded continuation data", () => {
    const result = recentAccountCookieUpsert(undefined, account(), now)
    expect(result.accounts).toEqual([account()])
    expect(result.accounts[0]).not.toHaveProperty("email")
    expect(result.expiresAt).toBe(now + 30 * 24 * 60 * 60)
  })

  test("replaces the token and session for the same user and organization", () => {
    const first = recentAccountCookieUpsert(undefined, account(), now)
    const updated = recentAccountCookieUpsert(
      first,
      account({ sessionId: "session-2", sessionToken: "token-2", lastUsedAt: now + 1 }),
      now + 1,
    )
    expect(updated.accounts).toHaveLength(1)
    expect(updated.accounts[0]).toEqual(
      account({ sessionId: "session-2", sessionToken: "token-2", lastUsedAt: now + 1 }),
    )
  })

  test("keeps multiple accounts, removes expired entries, and evicts the oldest deterministically", () => {
    let cookie = recentAccountCookieUpsert(undefined, account({ userId: "user-1", lastUsedAt: now - 3 }), now)
    cookie = recentAccountCookieUpsert(cookie, account({ userId: "user-2", lastUsedAt: now - 2 }), now)
    cookie = recentAccountCookieUpsert(cookie, account({ userId: "user-3", lastUsedAt: now - 1 }), now)
    cookie = recentAccountCookieUpsert(cookie, account({ userId: "user-4", lastUsedAt: now }), now)
    cookie = recentAccountCookieUpsert(cookie, account({ userId: "user-5", expiresAt: now }), now)

    expect(cookie.accounts.map((entry) => entry.userId)).toEqual(["user-4", "user-3", "user-2"])
  })

  test("removes duplicate records deterministically before applying the cap", () => {
    const duplicate = account({ sessionId: "older", sessionToken: "older-token", lastUsedAt: now - 1 })
    const cookie = recentAccountCookieUpsert(
      {
        version: 1,
        issuedAt: now - 10,
        expiresAt: now + 100,
        accounts: [duplicate, account()],
      },
      account({ sessionId: "newer", sessionToken: "newer-token", lastUsedAt: now }),
      now,
    )
    expect(cookie.accounts.filter((entry) => entry.userId === "user-1")).toEqual([
      account({ sessionId: "newer", sessionToken: "newer-token", lastUsedAt: now }),
    ])
  })

  test("opens a cookie with the immediately previous key during rotation", async () => {
    const rotatedValue = await seal(recentAccountCookieUpsert(undefined, account(), now), previousKey, 2)
    const rotated = await recentAccountCookieOpen(rotatedValue, [key, previousKey], now)
    expect(rotated).toEqual(expect.objectContaining({ success: true }))
  })

  test("rejects malformed and expired cookies", async () => {
    expect(await recentAccountCookieOpen("malformed", [key], now)).toEqual(
      expect.objectContaining({ success: false, errorMessage: "recent_account_invalid" }),
    )
    const expired = recentAccountCookieUpsert(undefined, account({ expiresAt: now + 1 }), now - 10)
    const expiredCookie = { ...expired, expiresAt: now - 1 }
    const expiredValue = await seal(expiredCookie)
    expect(await recentAccountCookieOpen(expiredValue, [key], now)).toEqual(
      expect.objectContaining({ success: false, errorMessage: "recent_account_expired" }),
    )
  })
})
