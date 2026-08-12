import { describe, expect, test, vi } from "vitest"

import { mfaV2EmailOtpEnrollApiRequest } from "../client/src/mfa/api/mfaV2EmailOtpEnrollApiRequest"

const apiOrigin = "https://worker.example"
const flowHandle = "flow-handle-123"
const csrfToken = "B".repeat(43)
const nextCsrfToken = "D".repeat(43)

describe("mfaV2EmailOtpEnrollApiRequest", () => {
  test("posts the exact credentialed enrollment contract without an email address", async () => {
    let capturedUrl = ""
    let capturedInit: RequestInit | undefined
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      capturedUrl = String(input)
      capturedInit = init
      return Response.json(
        {
          success: true,
          data: {
            transition: {
              kind: "render",
              route: `/login/mfa?flow=${flowHandle}`,
              screen: { name: "mfa_email_otp_code", challengeIssued: true },
              csrfToken: nextCsrfToken,
            },
          },
        },
        { status: 201 },
      )
    })

    const res = await mfaV2EmailOtpEnrollApiRequest(
      apiOrigin,
      flowHandle,
      { csrfToken },
      fetchMock as unknown as typeof fetch,
    )

    expect(capturedUrl).toBe(`${apiOrigin}/api/v2/mfa/email-otp/enroll?flow=${flowHandle}`)
    expect(capturedInit?.method).toBe("POST")
    expect(capturedInit?.credentials).toBe("include")
    expect(capturedInit?.headers).toEqual({ "Content-Type": "application/json" })
    const body = JSON.parse(String(capturedInit?.body)) as Record<string, unknown>
    expect(body).toEqual({ method: "email_otp", csrfToken })
    expect(Object.keys(body)).not.toContain("email")
    expect(res).toEqual({
      success: true,
      data: {
        kind: "render",
        route: `/login/mfa?flow=${flowHandle}`,
        screen: { name: "mfa_email_otp_code", challengeIssued: true },
        csrfToken: nextCsrfToken,
      },
    })
  })

  test("returns a flow error without requesting when the flow handle is missing", async () => {
    const fetchMock = vi.fn(async () => Response.json({ success: true, data: {} }))
    const res = await mfaV2EmailOtpEnrollApiRequest(apiOrigin, "", { csrfToken }, fetchMock as unknown as typeof fetch)

    expect(fetchMock).not.toHaveBeenCalled()
    expect(res.success).toBe(false)
    if (res.success) return
    expect(res.errorMessage).toBe("The sign-in session is invalid or has expired.")
  })

  test("maps error responses to non-sensitive messages", async () => {
    const fetchMock = vi.fn(async () =>
      Response.json({ success: false, op: "mfaEmailOtpEnrollment", errorMessage: "flow_replayed" }, { status: 409 }),
    )

    const res = await mfaV2EmailOtpEnrollApiRequest(
      apiOrigin,
      flowHandle,
      { csrfToken },
      fetchMock as unknown as typeof fetch,
    )

    expect(res.success).toBe(false)
    if (res.success) return
    expect(res.errorMessage).toBe("The sign-in request was already completed.")
  })

  test("rejects responses that do not match the strict transition contract", async () => {
    const fetchMock = vi.fn(async () =>
      Response.json({ success: true, data: { transition: { kind: "render", route: "/login/mfa" } } }, { status: 201 }),
    )

    const res = await mfaV2EmailOtpEnrollApiRequest(
      apiOrigin,
      flowHandle,
      { csrfToken },
      fetchMock as unknown as typeof fetch,
    )

    expect(res.success).toBe(false)
    if (res.success) return
    expect(res.errorMessage).toBe("The sign-in service returned an invalid response.")
  })
})
