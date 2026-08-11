import { describe, expect, test, vi } from "vitest"

import { mfaV2U2fVerifyApiRequest } from "../client/src/mfa/api/mfaV2U2fVerifyApiRequest"
import type { PasskeyCredentialAssertion } from "../client/src/passkey/model/passkeyVerifyRequestSchema"

const apiOrigin = "https://worker.example"
const flowHandle = "flow-handle-123"
const csrfToken = "B".repeat(43)

const mockCredential: PasskeyCredentialAssertion = {
  id: "cred-1",
  rawId: "cred-1-raw",
  type: "public-key",
  response: {
    clientDataJSON: "eyJ0eXBlIjoid2ViYXV0aG4uZ2V0In0",
    authenticatorData: "SZYN5YgOJGh0NBcPZHZgW4_km128BWiND4oYeqcaAAA",
    signature: "MEQCID3z8",
  },
}

describe("mfaV2U2fVerifyApiRequest", () => {
  test("sends POST request to /api/v2/mfa/u2f/verify and returns complete transition on success", async () => {
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

    const res = await mfaV2U2fVerifyApiRequest(
      apiOrigin,
      flowHandle,
      { credential: mockCredential, method: "u2f", csrfToken },
      fetchMock as unknown as typeof fetch,
    )

    expect(capturedUrl).toBe(`${apiOrigin}/api/v2/mfa/u2f/verify?flow=${flowHandle}`)
    expect(capturedBody).toEqual({ credential: mockCredential, method: "u2f", csrfToken })
    expect(res).toEqual({
      success: true,
      data: {
        kind: "complete",
        path: `/api/v2/flow/continue?flow=${flowHandle}`,
      },
    })
  })

  test("handles error response from server", async () => {
    const fetchMock = vi.fn(async () =>
      Response.json(
        {
          success: false,
          op: "mfaU2fVerify",
          errorMessage: "csrf_rejected",
        },
        { status: 403 },
      ),
    )

    const res = await mfaV2U2fVerifyApiRequest(
      apiOrigin,
      flowHandle,
      { credential: mockCredential, method: "u2f", csrfToken },
      fetchMock as unknown as typeof fetch,
    )

    expect(res.success).toBe(false)
    if (res.success) return
    expect(res.errorMessage).toBe("Request verification failed.")
  })

  test("returns error if flow handle is missing", async () => {
    const res = await mfaV2U2fVerifyApiRequest(apiOrigin, "", { credential: mockCredential, csrfToken })
    expect(res.success).toBe(false)
    if (res.success) return
    expect(res.errorMessage).toBe("The sign-in session is invalid or has expired.")
  })

  test("handles network exception cleanly", async () => {
    const fetchMock = vi.fn(async () => {
      throw new Error("Network error")
    })

    const res = await mfaV2U2fVerifyApiRequest(
      apiOrigin,
      flowHandle,
      { credential: mockCredential, csrfToken },
      fetchMock as unknown as typeof fetch,
    )

    expect(res.success).toBe(false)
    if (res.success) return
    expect(res.errorMessage).toBe("Sign-in is temporarily unavailable. Please try again.")
  })
})
