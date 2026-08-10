import { afterEach, describe, expect, test } from "bun:test"

import { loginApiRequest } from "../client/src/login/loginApiRequest"

const originalFetch = globalThis.fetch

afterEach(() => {
  globalThis.fetch = originalFetch
})

describe("login API browser contract", () => {
  test("initializes from authRequest with credentialed requests", async () => {
    globalThis.fetch = async (input, init) => {
      expect(String(input)).toBe("https://worker.example/api/auth-request?authRequest=request-1")
      expect(init?.credentials).toBe("include")
      return Response.json({ status: "ready", csrfToken: "token", loginHint: "person@example.com" })
    }

    const result = await loginApiRequest("https://worker.example", {
      type: "initialize",
      authRequest: "request-1",
    })
    expect(result).toEqual({
      success: true,
      data: { status: "ready", csrfToken: "token", loginHint: "person@example.com" },
    })
  })

  test("posts a constrained verification payload and accepts continuation", async () => {
    globalThis.fetch = async (input, init) => {
      expect(String(input)).toBe("https://worker.example/api/email-otp/verify")
      expect(init).toEqual({
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code: "123456", csrfToken: "token" }),
      })
      return Response.json({ status: "verified", continuationUrl: "/api/email-otp/callback" })
    }

    const result = await loginApiRequest("https://worker.example", {
      type: "verify",
      code: "123456",
      csrfToken: "token",
    })
    expect(result).toEqual({
      success: true,
      data: { status: "verified", continuationUrl: "/api/email-otp/callback" },
    })
  })

  test("returns the Worker safe error message without accepting malformed success data", async () => {
    globalThis.fetch = async () =>
      Response.json({ error: { code: "invalid_code", message: "The code is invalid or expired." } }, { status: 401 })

    const result = await loginApiRequest("https://worker.example", {
      type: "verify",
      code: "000000",
      csrfToken: "token",
    })
    expect(result).toEqual({
      success: false,
      op: "loginApiRequest",
      errorMessage: "The code is invalid or expired.",
      status: 401,
    })
  })
})
