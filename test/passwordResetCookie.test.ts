import { describe, expect, test } from "bun:test"

import { passwordRecoveryCookieOpen } from "../src/password-recovery/domain/passwordRecoveryCookieOpen"
import { passwordRecoveryCookieSeal } from "../src/password-recovery/domain/passwordRecoveryCookieSeal"
import { passwordResetCookieOpen } from "../src/password-recovery/domain/passwordResetCookieOpen"
import { passwordResetCookieSeal } from "../src/password-recovery/domain/passwordResetCookieSeal"
import type { PasswordRecoveryCookie } from "../src/password-recovery/model/passwordRecoveryCookieSchema"
import type { PasswordResetCookie } from "../src/password-recovery/model/passwordResetCookieSchema"

const key = "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA"
const previousKey = "BBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB"
const now = 1_800_000_000

function state(overrides: Partial<PasswordResetCookie> = {}): PasswordResetCookie {
  return {
    version: 1,
    purpose: "password_reset",
    userId: "user-1",
    organizationId: "org-1",
    verificationCode: "A1B2C3",
    issuedAt: now,
    expiresAt: now + 600,
    transition: 0,
    ...overrides,
  } as PasswordResetCookie
}

async function seal(cookie: PasswordResetCookie, cookieKey = key, ivByte = 1): Promise<string> {
  const result = await passwordResetCookieSeal(cookie, cookieKey, new Uint8Array(12).fill(ivByte))
  if (!result.success) throw new Error("Expected password reset cookie to seal")
  return result.data
}

describe("password reset cookie domain", () => {
  test("seals native credentials only in the purpose-bound reset state", async () => {
    const cookie = state()
    const opened = await passwordResetCookieOpen(await seal(cookie), [key], now, [0])

    expect(opened).toEqual({ success: true, data: cookie })
    expect(cookie).not.toHaveProperty("authRequestId")
    expect(cookie).not.toHaveProperty("flowHandle")
    expect(cookie).not.toHaveProperty("sessionToken")
    expect(cookie).not.toHaveProperty("csrfToken")
  })

  test("opens the previous key during rotation and rejects tampering", async () => {
    const value = await seal(state(), previousKey, 2)
    expect(await passwordResetCookieOpen(value, [key, previousKey], now, [0])).toEqual({
      success: true,
      data: state(),
    })

    const tampered = `${value.slice(0, -1)}${value.endsWith("A") ? "B" : "A"}`
    expect(await passwordResetCookieOpen(tampered, [key, previousKey], now, [0])).toEqual(
      expect.objectContaining({ success: false, errorMessage: "password_reset_link_invalid" }),
    )
  })

  test("rejects expiry and disallowed transitions through one generic result", async () => {
    const expired = await seal(state({ issuedAt: now - 601, expiresAt: now - 1 }), key, 3)
    const rendered = await seal(
      state({ transition: 1, csrfToken: "C".repeat(43) } as Partial<PasswordResetCookie>),
      key,
      4,
    )

    for (const result of [
      await passwordResetCookieOpen("malformed", [key], now, [0, 1]),
      await passwordResetCookieOpen(expired, [key], now, [0, 1]),
      await passwordResetCookieOpen(rendered, [key], now, [0]),
    ]) {
      expect(result).toEqual(expect.objectContaining({ success: false, errorMessage: "password_reset_link_invalid" }))
    }
  })

  test("uses AAD distinct from recovery state in both directions", async () => {
    const recovery: PasswordRecoveryCookie = {
      version: 1,
      purpose: "password_recovery",
      csrfToken: "C".repeat(43),
      issuedAt: now,
      expiresAt: now + 300,
      transition: 0,
    }
    const recoveryValue = await passwordRecoveryCookieSeal(recovery, key, new Uint8Array(12).fill(5))
    if (!recoveryValue.success) throw new Error("Expected recovery cookie to seal")
    const resetValue = await seal(state(), key, 6)

    expect(await passwordResetCookieOpen(recoveryValue.data, [key], now, [0])).toEqual(
      expect.objectContaining({ success: false, errorMessage: "password_reset_link_invalid" }),
    )
    expect(await passwordRecoveryCookieOpen(resetValue, [key], now, 0)).toEqual(
      expect.objectContaining({ success: false, errorMessage: "recovery_state_invalid" }),
    )
  })

  test("rejects invalid native fields and transition shapes before sealing", async () => {
    const cases = [
      state({ userId: "user/id" }),
      state({ organizationId: "org id" }),
      state({ verificationCode: "code_1" }),
      state({ verificationCode: "A".repeat(21) }),
      { ...state(), transition: 1 },
      { ...state(), transition: 0, csrfToken: "C".repeat(43) },
    ]

    for (const candidate of cases) {
      expect(await passwordResetCookieSeal(candidate as PasswordResetCookie, key, new Uint8Array(12))).toEqual(
        expect.objectContaining({ success: false, errorMessage: "password_reset_state_unavailable" }),
      )
    }
  })
})
