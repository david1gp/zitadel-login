import { afterEach, describe, expect, test } from "bun:test"

import { passwordV2VerifyApiRequest } from "../client/src/password/api/passwordV2VerifyApiRequest"

const originalFetch = globalThis.fetch
const validCsrf = "C".repeat(43)
const validFlow = "A".repeat(22)

afterEach(() => {
  globalThis.fetch = originalFetch
})

describe("passwordV2VerifyApiRequest browser contract", () => {
  test("posts password verify payload with flow handle query and returns complete transition", async () => {
    globalThis.fetch = async (input, init) => {
      expect(String(input)).toBe(`https://worker.example/api/v2/password/verify?flow=${validFlow}`)
      expect(init).toEqual({
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          identifier: "person@example.com",
          password: "secret-password",
          csrfToken: validCsrf,
        }),
      })
      return Response.json({
        success: true,
        data: { kind: "complete", path: `/api/v2/flow/continue?flow=${validFlow}` },
      })
    }

    const result = await passwordV2VerifyApiRequest("https://worker.example", validFlow, {
      identifier: "person@example.com",
      password: "secret-password",
      csrfToken: validCsrf,
    })

    expect(result).toEqual({
      success: true,
      data: { kind: "complete", path: `/api/v2/flow/continue?flow=${validFlow}` },
    })
  })

  test("returns native fallback transition when MFA is required", async () => {
    globalThis.fetch = async () =>
      Response.json({
        success: true,
        data: { kind: "fallback", path: `/api/v2/flow/fallback?flow=${validFlow}` },
      })

    const result = await passwordV2VerifyApiRequest("https://worker.example", validFlow, {
      identifier: "person@example.com",
      password: "secret-password",
      csrfToken: validCsrf,
    })

    expect(result).toEqual({
      success: true,
      data: { kind: "fallback", path: `/api/v2/flow/fallback?flow=${validFlow}` },
    })
  })

  test("returns Worker mapped error message on 401 credentials_invalid", async () => {
    globalThis.fetch = async () =>
      Response.json({ success: false, op: "passwordVerify", errorMessage: "credentials_invalid" }, { status: 401 })

    const result = await passwordV2VerifyApiRequest("https://worker.example", validFlow, {
      identifier: "person@example.com",
      password: "wrong-password",
      csrfToken: validCsrf,
    })

    expect(result).toEqual({
      success: false,
      op: "passwordV2VerifyApiRequest",
      errorMessage: "Invalid username or password.",
    })
  })

  test("handles fetch exception gracefully with ResultErr", async () => {
    globalThis.fetch = async () => {
      throw new TypeError("Failed to fetch")
    }

    const result = await passwordV2VerifyApiRequest("https://worker.example", validFlow, {
      identifier: "person@example.com",
      password: "password",
      csrfToken: validCsrf,
    })

    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.errorMessage).toBe("Sign-in is temporarily unavailable. Please try again.")
    }
  })
})
