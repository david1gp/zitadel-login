import { afterEach, describe, expect, test } from "bun:test"

import { emailOtpV2ResendApiRequest } from "../client/src/email-otp/api/emailOtpV2ResendApiRequest"
import { emailOtpV2StartApiRequest } from "../client/src/email-otp/api/emailOtpV2StartApiRequest"
import { emailOtpV2VerifyApiRequest } from "../client/src/email-otp/api/emailOtpV2VerifyApiRequest"
import { flowV2InitializeApiRequest } from "../client/src/flow/api/flowV2InitializeApiRequest"
import { flowV2ResumeApiRequest } from "../client/src/flow/api/flowV2ResumeApiRequest"

const originalFetch = globalThis.fetch
const validCsrf = "C".repeat(43)
const validFlow = "A".repeat(22)

afterEach(() => {
  globalThis.fetch = originalFetch
})

describe("login v2 API browser contract", () => {
  test("initializes from authRequest with credentialed POST request", async () => {
    globalThis.fetch = async (input, init) => {
      expect(String(input)).toBe("https://worker.example/api/v2/flow/initialize")
      expect(init?.credentials).toBe("include")
      expect(init?.method).toBe("POST")
      expect(init?.body).toBe(JSON.stringify({ authRequest: "request-1" }))
      return Response.json({
        success: true,
        data: {
          kind: "render",
          route: `/login/email-otp?flow=${validFlow}`,
          screen: { name: "email_otp_start", loginHint: "person@example.com" },
          csrfToken: validCsrf,
        },
      })
    }

    const result = await flowV2InitializeApiRequest("https://worker.example", "request-1")
    expect(result).toEqual({
      success: true,
      data: {
        kind: "render",
        route: `/login/email-otp?flow=${validFlow}`,
        screen: { name: "email_otp_start", loginHint: "person@example.com" },
        csrfToken: validCsrf,
      },
    })
  })

  test("resumes from opaque flow handle with credentialed GET request", async () => {
    globalThis.fetch = async (input, init) => {
      expect(String(input)).toBe(`https://worker.example/api/v2/flow/resume?flow=${validFlow}`)
      expect(init?.credentials).toBe("include")
      return Response.json({
        success: true,
        data: {
          kind: "render",
          route: `/login/email-otp?flow=${validFlow}`,
          screen: { name: "email_otp_code" },
          csrfToken: validCsrf,
        },
      })
    }

    const result = await flowV2ResumeApiRequest("https://worker.example", validFlow)
    expect(result).toEqual({
      success: true,
      data: {
        kind: "render",
        route: `/login/email-otp?flow=${validFlow}`,
        screen: { name: "email_otp_code" },
        csrfToken: validCsrf,
      },
    })
  })

  test("posts email start payload with flow handle query and returns transition", async () => {
    globalThis.fetch = async (input, init) => {
      expect(String(input)).toBe(`https://worker.example/api/v2/email-otp/start?flow=${validFlow}`)
      expect(init).toEqual({
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: "user@example.com",
          csrfToken: validCsrf,
        }),
      })
      return Response.json({
        success: true,
        data: {
          kind: "render",
          route: `/login/email-otp?flow=${validFlow}`,
          screen: { name: "email_otp_code" },
          csrfToken: validCsrf,
        },
      })
    }

    const result = await emailOtpV2StartApiRequest("https://worker.example", validFlow, {
      email: "user@example.com",
      csrfToken: validCsrf,
    })
    expect(result.success).toBe(true)
  })

  test("posts resend payload with flow handle query and returns transition", async () => {
    globalThis.fetch = async (input, init) => {
      expect(String(input)).toBe(`https://worker.example/api/v2/email-otp/resend?flow=${validFlow}`)
      expect(init).toEqual({
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ csrfToken: validCsrf }),
      })
      return Response.json({
        success: true,
        data: {
          kind: "render",
          route: `/login/email-otp?flow=${validFlow}`,
          screen: { name: "email_otp_code" },
          csrfToken: validCsrf,
        },
      })
    }

    const result = await emailOtpV2ResendApiRequest("https://worker.example", validFlow, {
      csrfToken: validCsrf,
    })
    expect(result.success).toBe(true)
  })

  test("posts a verification payload and accepts continuation transition", async () => {
    globalThis.fetch = async (input, init) => {
      expect(String(input)).toBe(`https://worker.example/api/v2/email-otp/verify?flow=${validFlow}`)
      expect(init).toEqual({
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code: "123456", csrfToken: validCsrf }),
      })
      return Response.json({
        success: true,
        data: { kind: "complete", path: `/api/v2/flow/continue?flow=${validFlow}` },
      })
    }

    const result = await emailOtpV2VerifyApiRequest("https://worker.example", validFlow, {
      code: "123456",
      csrfToken: validCsrf,
    })
    expect(result).toEqual({
      success: true,
      data: { kind: "complete", path: `/api/v2/flow/continue?flow=${validFlow}` },
    })
  })

  test("returns the Worker mapped error message on 401 code_invalid", async () => {
    globalThis.fetch = async () =>
      Response.json({ success: false, op: "emailOtpVerify", errorMessage: "code_invalid" }, { status: 401 })

    const result = await emailOtpV2VerifyApiRequest("https://worker.example", validFlow, {
      code: "000000",
      csrfToken: validCsrf,
    })
    expect(result).toEqual({
      success: false,
      op: "emailOtpV2VerifyApiRequest",
      errorMessage: "The code is invalid or expired.",
    })
  })
})
