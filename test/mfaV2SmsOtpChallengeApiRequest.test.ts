import { describe, expect, test, vi } from "vitest"

import { mfaV2SmsOtpChallengeApiRequest } from "../client/src/mfa/api/mfaV2SmsOtpChallengeApiRequest"

const apiOrigin = "https://worker.example"
const flowHandle = "flow-handle-123"
const csrfToken = "B".repeat(43)

describe("mfaV2SmsOtpChallengeApiRequest", () => {
  test("sends POST request to /api/v2/mfa/sms-otp/challenge and returns render transition on success (202 status)", async () => {
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
            screen: { name: "mfa", factors: ["sms_otp"] },
            csrfToken,
          },
        }),
        { status: 202, headers: { "Content-Type": "application/json" } },
      )
    })

    const res = await mfaV2SmsOtpChallengeApiRequest(
      apiOrigin,
      flowHandle,
      { csrfToken },
      fetchMock as unknown as typeof fetch,
    )

    expect(capturedUrl).toBe(`${apiOrigin}/api/v2/mfa/sms-otp/challenge?flow=${flowHandle}`)
    expect(capturedBody).toEqual({ method: "sms_otp", csrfToken })
    expect(res).toEqual({
      success: true,
      data: {
        kind: "render",
        route: `/login/mfa?flow=${flowHandle}`,
        screen: { name: "mfa", factors: ["sms_otp"] },
        csrfToken,
      },
    })
  })

  test("returns error if flow handle is missing", async () => {
    const res = await mfaV2SmsOtpChallengeApiRequest(apiOrigin, "", { csrfToken })
    expect(res.success).toBe(false)
    if (res.success) return
    expect(res.errorMessage).toBe("The sign-in session is invalid or has expired.")
  })

  test("maps error response cleanly", async () => {
    const fetchMock = vi.fn(
      async () =>
        new Response(
          JSON.stringify({
            success: false,
            op: "mfaOtpChallenge",
            errorMessage: "method_not_enrolled",
          }),
          { status: 403, headers: { "Content-Type": "application/json" } },
        ),
    )

    const res = await mfaV2SmsOtpChallengeApiRequest(
      apiOrigin,
      flowHandle,
      { csrfToken },
      fetchMock as unknown as typeof fetch,
    )

    expect(res.success).toBe(false)
    if (res.success) return
    expect(res.errorMessage).toBe("Sign-in could not be completed. Please try again.")
  })
})
