import { describe, expect, test, vi } from "vitest"

import { mfaV2EmailOtpResendApiRequest } from "../client/src/mfa/api/mfaV2EmailOtpResendApiRequest"

const apiOrigin = "https://worker.example"
const flowHandle = "flow-handle-123"
const csrfToken = "B".repeat(43)

describe("mfaV2EmailOtpResendApiRequest", () => {
  test("sends POST request to /api/v2/mfa/email-otp/resend and returns render transition on success", async () => {
    let capturedUrl = ""
    let capturedBody: unknown = undefined
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      capturedUrl = String(input)
      capturedBody = JSON.parse(String(init?.body))
      return new Response(
        JSON.stringify({
          success: true,
          data: {
            kind: "render",
            route: `/login/mfa?flow=${flowHandle}`,
            screen: { name: "mfa", factors: ["email_otp"] },
            csrfToken,
          },
        }),
        { status: 202, headers: { "Content-Type": "application/json" } },
      )
    })

    const res = await mfaV2EmailOtpResendApiRequest(
      apiOrigin,
      flowHandle,
      { csrfToken },
      fetchMock as unknown as typeof fetch,
    )

    expect(capturedUrl).toBe(`${apiOrigin}/api/v2/mfa/email-otp/resend?flow=${flowHandle}`)
    expect(capturedBody).toEqual({ method: "email_otp", csrfToken })
    expect(res.success).toBe(true)
  })

  test("handles rate limiting error response", async () => {
    const fetchMock = vi.fn(
      async () =>
        new Response(
          JSON.stringify({
            success: false,
            op: "mfaOtpResend",
            errorMessage: "rate_limited",
          }),
          {
            status: 429,
            headers: {
              "Content-Type": "application/json",
              "X-Cooldown-Expires-At": "1800000060",
              "Retry-After": "60",
            },
          },
        ),
    )

    const res = await mfaV2EmailOtpResendApiRequest(
      apiOrigin,
      flowHandle,
      { csrfToken },
      fetchMock as unknown as typeof fetch,
    )

    expect(res.success).toBe(false)
    if (res.success) return
    expect(res.errorMessage).toBe("Too many sign-in attempts. Please retry later.")
    expect(res.cooldownExpiresAt).toBe(1_800_000_060)
  })
})
