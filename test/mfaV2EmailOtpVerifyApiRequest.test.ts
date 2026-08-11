import { describe, expect, test, vi } from "vitest"

import { mfaV2EmailOtpVerifyApiRequest } from "../client/src/mfa/api/mfaV2EmailOtpVerifyApiRequest"

const apiOrigin = "https://worker.example"
const flowHandle = "flow-handle-123"
const csrfToken = "B".repeat(43)

describe("mfaV2EmailOtpVerifyApiRequest", () => {
  test("sends POST request to /api/v2/mfa/email-otp/verify and returns complete transition on success", async () => {
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

    const res = await mfaV2EmailOtpVerifyApiRequest(
      apiOrigin,
      flowHandle,
      { code: "12345678", csrfToken },
      fetchMock as unknown as typeof fetch,
    )

    expect(capturedUrl).toBe(`${apiOrigin}/api/v2/mfa/email-otp/verify?flow=${flowHandle}`)
    expect(capturedBody).toEqual({ code: "12345678", method: "email_otp", csrfToken })
    expect(res).toEqual({
      success: true,
      data: {
        kind: "complete",
        path: `/api/v2/flow/continue?flow=${flowHandle}`,
      },
    })
  })

  test("handles 8-digit deployed code verification cleanly", async () => {
    const fetchMock = vi.fn(async () =>
      Response.json({
        success: true,
        data: {
          kind: "complete",
          path: `/api/v2/flow/continue?flow=${flowHandle}`,
        },
      }),
    )

    const res = await mfaV2EmailOtpVerifyApiRequest(
      apiOrigin,
      flowHandle,
      { code: "87654321", csrfToken },
      fetchMock as unknown as typeof fetch,
    )

    expect(res.success).toBe(true)
  })

  test("maps 401 code_invalid error response to generic message", async () => {
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

    const res = await mfaV2EmailOtpVerifyApiRequest(
      apiOrigin,
      flowHandle,
      { code: "99999999", csrfToken },
      fetchMock as unknown as typeof fetch,
    )

    expect(res.success).toBe(false)
    if (res.success) return
    expect(res.errorMessage).toBe("The code is invalid or expired.")
  })
})
