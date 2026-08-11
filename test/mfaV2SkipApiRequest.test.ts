import { describe, expect, test } from "bun:test"

import { mfaV2SkipApiRequest } from "../client/src/mfa/api/mfaV2SkipApiRequest"

const apiOrigin = "https://worker.example"
const flowHandle = "flow-handle-123"
const csrfToken = "B".repeat(43)

describe("mfaV2SkipApiRequest", () => {
  test("sends POST request to /api/v2/mfa/skip and returns complete transition on success", async () => {
    let capturedUrl = ""
    let capturedBody: unknown = undefined
    const fetchMock = async (input: RequestInfo | URL, init?: RequestInit) => {
      capturedUrl = String(input)
      capturedBody = JSON.parse(String(init?.body))
      return Response.json({
        success: true,
        data: {
          kind: "complete",
          path: `/api/v2/flow/continue?flow=${flowHandle}`,
        },
      })
    }

    const res = await mfaV2SkipApiRequest(apiOrigin, flowHandle, { csrfToken }, fetchMock as unknown as typeof fetch)

    expect(capturedUrl).toBe(`${apiOrigin}/api/v2/mfa/skip?flow=${flowHandle}`)
    expect(capturedBody).toEqual({ csrfToken })
    expect(res).toEqual({
      success: true,
      data: {
        kind: "complete",
        path: `/api/v2/flow/continue?flow=${flowHandle}`,
      },
    })
  })

  test("returns render transition when subsequent stage requires user interaction", async () => {
    const fetchMock = async () =>
      Response.json({
        success: true,
        data: {
          kind: "render",
          route: `/login/mfa?flow=${flowHandle}`,
          screen: { name: "mfa", factors: ["totp"] },
          csrfToken: "C".repeat(43),
        },
      })

    const res = await mfaV2SkipApiRequest(apiOrigin, flowHandle, { csrfToken }, fetchMock as unknown as typeof fetch)

    expect(res.success).toBe(true)
    if (!res.success) return
    expect(res.data.kind).toBe("render")
  })

  test("maps mfa_skip_forbidden error code to friendly error message", async () => {
    const fetchMock = async () =>
      Response.json(
        {
          success: false,
          op: "mfaSkip",
          errorMessage: "mfa_skip_forbidden",
        },
        { status: 403 },
      )

    const res = await mfaV2SkipApiRequest(apiOrigin, flowHandle, { csrfToken }, fetchMock as unknown as typeof fetch)

    expect(res.success).toBe(false)
    if (res.success) return
    expect(res.errorMessage).toBe("Skipping 2-step verification is not allowed for this account.")
  })

  test("maps 429 rate_limited response", async () => {
    const fetchMock = async () =>
      Response.json(
        {
          success: false,
          op: "mfaSkip",
          errorMessage: "rate_limited",
        },
        { status: 429 },
      )

    const res = await mfaV2SkipApiRequest(apiOrigin, flowHandle, { csrfToken }, fetchMock as unknown as typeof fetch)

    expect(res.success).toBe(false)
    if (res.success) return
    expect(res.errorMessage).toBe("Too many sign-in attempts. Please retry later.")
  })

  test("returns error if flow handle is missing", async () => {
    const res = await mfaV2SkipApiRequest(apiOrigin, "", { csrfToken })
    expect(res.success).toBe(false)
    if (res.success) return
    expect(res.errorMessage).toBe("The sign-in session is invalid or has expired.")
  })

  test("handles network exception cleanly", async () => {
    const fetchMock = async () => {
      throw new Error("Network error")
    }

    const res = await mfaV2SkipApiRequest(apiOrigin, flowHandle, { csrfToken }, fetchMock as unknown as typeof fetch)

    expect(res.success).toBe(false)
    if (res.success) return
    expect(res.errorMessage).toBe("Sign-in is temporarily unavailable. Please try again.")
  })
})
