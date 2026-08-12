import { describe, expect, test } from "bun:test"

import { passwordRecoveryCookieOpen } from "../src/password-recovery/domain/passwordRecoveryCookieOpen"
import { passwordRecoveryCookieSeal } from "../src/password-recovery/domain/passwordRecoveryCookieSeal"
import type { PasswordRecoveryCookie } from "../src/password-recovery/model/passwordRecoveryCookieSchema"

const key = "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA"
const previousKey = "BBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB"
const now = 1_800_000_000

function state(overrides: Partial<PasswordRecoveryCookie> = {}): PasswordRecoveryCookie {
  return {
    version: 1,
    purpose: "password_recovery",
    csrfToken: "C".repeat(43),
    issuedAt: now,
    expiresAt: now + 300,
    transition: 0,
    ...overrides,
  }
}

async function seal(cookie: PasswordRecoveryCookie, cookieKey = key, ivByte = 1): Promise<string> {
  const result = await passwordRecoveryCookieSeal(cookie, cookieKey, new Uint8Array(12).fill(ivByte))
  if (!result.success) throw new Error("Expected recovery cookie to seal")
  return result.data
}

describe("password recovery cookie domain", () => {
  test("seals only purpose-bound transition metadata without identifiers", async () => {
    const cookie = state()
    expect(cookie).not.toHaveProperty("email")
    expect(cookie).not.toHaveProperty("userId")
    expect(cookie).not.toHaveProperty("authRequestId")
    expect(cookie).not.toHaveProperty("code")
    expect(cookie).not.toHaveProperty("sessionId")
    expect(cookie).not.toHaveProperty("sessionToken")

    const value = await seal(cookie)
    const opened = await passwordRecoveryCookieOpen(value, [key], now, 0)
    expect(opened).toEqual({ success: true, data: cookie })
    if (!opened.success) return
    expect(Object.keys(opened.data).sort()).toEqual([
      "csrfToken",
      "expiresAt",
      "issuedAt",
      "purpose",
      "transition",
      "version",
    ])
  })

  test("opens a cookie with the immediately previous key during rotation", async () => {
    const value = await seal(state(), previousKey, 2)
    const rotated = await passwordRecoveryCookieOpen(value, [key, previousKey], now, 0)
    expect(rotated).toEqual(expect.objectContaining({ success: true, data: state() }))
  })

  test("rejects malformed, expired, and replayed recovery state", async () => {
    expect(await passwordRecoveryCookieOpen("malformed", [key], now, 0)).toEqual(
      expect.objectContaining({ success: false, errorMessage: "recovery_state_invalid" }),
    )

    const expiredValue = await seal(state({ expiresAt: now - 1, issuedAt: now - 120 }))
    expect(await passwordRecoveryCookieOpen(expiredValue, [key], now, 0)).toEqual(
      expect.objectContaining({ success: false, errorMessage: "recovery_state_expired" }),
    )

    const value = await seal(state({ transition: 1 }))
    expect(await passwordRecoveryCookieOpen(value, [key], now, 0)).toEqual(
      expect.objectContaining({ success: false, errorMessage: "recovery_state_replayed" }),
    )
  })

  test("rejects seal payloads that include account or reset identifiers", async () => {
    const polluted = {
      ...state(),
      email: "person@example.com",
      userId: "user-1",
      code: "reset-code",
    } as PasswordRecoveryCookie
    const sealed = await passwordRecoveryCookieSeal(polluted, key, new Uint8Array(12).fill(3))
    expect(sealed).toEqual(expect.objectContaining({ success: false, errorMessage: "recovery_state_unavailable" }))
  })
})
