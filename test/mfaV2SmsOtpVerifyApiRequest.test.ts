import { describe, expect, test, vi } from "vitest"

import { mfaV2SmsOtpVerifyApiRequest } from "../client/src/mfa/api/mfaV2SmsOtpVerifyApiRequest"

const apiOrigin = "https://worker.example"
const flowHandle = "flow-handle-123"
const csrfToken = "B".repeat(43)

describe("mfaV2SmsOtpVerifyApiRequest", () => {
  test("sends POST request to /api/v2/mfa/sms-otp/verify and returns complete transition on success", async () => {
    let capturedUrl = ""
    let capturedBody: unknown = undefined
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      capturedUrl = String(input)
      capturedBody = JSON.parse(String(init?.body))
      return Response.json({
        success: true,
        data: {
          kind: "complete",
          path: `/api/v2/flow/continue?flow=${flowHandle}`,
        },
      })
    })

    const res = await mfaV2SmsOtpVerifyApiRequest(
      apiOrigin,
      flowHandle,
      { code: "123456", csrfToken },
      fetchMock as unknown as typeof fetch,
    )

    expect(capturedUrl).toBe(`${apiOrigin}/api/v2/mfa/sms-otp/verify?flow=${flowHandle}`)
    expect(capturedBody).toEqual({ code: "123456", method: "sms_otp", csrfToken })
    expect(res).toEqual({
      success: true,
      data: {
        kind: "complete",
        path: `/api/v2/flow/continue?flow=${flowHandle}`,
      },
    })
  })

  test("returns render transition when additional verification factor is required", async () => {
    const fetchMock = vi.fn(async () =>
      Response.json({
        success: true,
        data: {
          kind: "render",
          route: `/login/mfa?flow=${flowHandle}`,
          screen: { name: "mfa", factors: ["u2f"] },
          csrfToken: "C".repeat(43),
        },
      }),
    )

    const res = await mfaV2SmsOtpVerifyApiRequest(
      apiOrigin,
      flowHandle,
      { code: "654321", csrfToken },
      fetchMock as unknown as typeof fetch,
    )

    expect(res.success).toBe(true)
    if (!res.success) return
    expect(res.data.kind).toBe("render")
  })

  test("maps 401 code_invalid error response to generic user message", async () => {
    const fetchMock = vi.fn(async () =>
      Response.json(
        {
          success: false,
          op: "mfaOtpVerify",
          errorMessage: "code_invalid",
        },
        { status: 401 },
      ),
    )

    const res = await mfaV2SmsOtpVerifyApiRequest(
      apiOrigin,
      flowHandle,
      { code: "999999", csrfToken },
      fetchMock as unknown as typeof fetch,
    )

    expect(res.success).toBe(false)
    if (res.success) return
    expect(res.errorMessage).toBe("The code is invalid or expired.")
  })

  test("maps 429 rate_limited response", async () => {
    const fetchMock = vi.fn(async () =>
      Response.json(
        {
          success: false,
          op: "mfaOtpVerify",
          errorMessage: "rate_limited",
        },
        { status: 429 },
      ),
    )

    const res = await mfaV2SmsOtpVerifyApiRequest(
      apiOrigin,
      flowHandle,
      { code: "123456", csrfToken },
      fetchMock as unknown as typeof fetch,
    )

    expect(res.success).toBe(false)
    if (res.success) return
    expect(res.errorMessage).toBe("Too many sign-in attempts. Please retry later.")
  })

  test("returns error if flow handle is missing", async () => {
    const res = await mfaV2SmsOtpVerifyApiRequest(apiOrigin, "", { code: "123456", csrfToken })
    expect(res.success).toBe(false)
    if (res.success) return
    expect(res.errorMessage).toBe("The sign-in session is invalid or has expired.")
  })

  test("handles network exception cleanly", async () => {
    const fetchMock = vi.fn(async () => {
      throw new Error("Network error")
    })

    const res = await mfaV2SmsOtpVerifyApiRequest(
      apiOrigin,
      flowHandle,
      { code: "123456", csrfToken },
      fetchMock as unknown as typeof fetch,
    )

    expect(res.success).toBe(false)
    if (res.success) return
    expect(res.errorMessage).toBe("Sign-in is temporarily unavailable. Please try again.")
  })
})
