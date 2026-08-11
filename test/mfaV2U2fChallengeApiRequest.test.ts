import { describe, expect, test, vi } from "vitest"

import { mfaV2U2fChallengeApiRequest } from "../client/src/mfa/api/mfaV2U2fChallengeApiRequest"

const apiOrigin = "https://worker.example"
const flowHandle = "flow-handle-123"
const csrfToken = "B".repeat(43)

describe("mfaV2U2fChallengeApiRequest", () => {
  test("sends POST request to /api/v2/mfa/u2f/challenge and returns render transition on success", async () => {
    let capturedUrl = ""
    let capturedBody: unknown = undefined
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      capturedUrl = String(input)
      capturedBody = JSON.parse(String(init?.body))
      return Response.json({
        success: true,
        data: {
          kind: "render",
          route: `/login/mfa?flow=${flowHandle}`,
          screen: {
            name: "mfa",
            factors: ["u2f"],
            options: {
              publicKey: {
                challenge: "GAOHYz2jE69kJMYo6Laij8yWw9-dKKgbViNhfuy0StA",
                rpId: "login.example",
              },
            },
          },
          csrfToken: "C".repeat(43),
        },
      })
    })

    const res = await mfaV2U2fChallengeApiRequest(
      apiOrigin,
      flowHandle,
      { method: "u2f", csrfToken },
      fetchMock as unknown as typeof fetch,
    )

    expect(capturedUrl).toBe(`${apiOrigin}/api/v2/mfa/u2f/challenge?flow=${flowHandle}`)
    expect(capturedBody).toEqual({ method: "u2f", csrfToken })
    expect(res.success).toBe(true)
    if (!res.success) return
    expect(res.data.kind).toBe("render")
  })

  test("handles error response from server", async () => {
    const fetchMock = vi.fn(async () =>
      Response.json(
        {
          success: false,
          op: "mfaU2fChallenge",
          errorMessage: "rate_limited",
        },
        { status: 429 },
      ),
    )

    const res = await mfaV2U2fChallengeApiRequest(
      apiOrigin,
      flowHandle,
      { method: "u2f", csrfToken },
      fetchMock as unknown as typeof fetch,
    )

    expect(res.success).toBe(false)
    if (res.success) return
    expect(res.errorMessage).toBe("Too many sign-in attempts. Please retry later.")
  })

  test("returns error if flow handle is missing", async () => {
    const res = await mfaV2U2fChallengeApiRequest(apiOrigin, "", { method: "u2f", csrfToken })
    expect(res.success).toBe(false)
    if (res.success) return
    expect(res.errorMessage).toBe("The sign-in session is invalid or has expired.")
  })

  test("handles network exception cleanly", async () => {
    const fetchMock = vi.fn(async () => {
      throw new Error("Network error")
    })

    const res = await mfaV2U2fChallengeApiRequest(
      apiOrigin,
      flowHandle,
      { method: "u2f", csrfToken },
      fetchMock as unknown as typeof fetch,
    )

    expect(res.success).toBe(false)
    if (res.success) return
    expect(res.errorMessage).toBe("Sign-in is temporarily unavailable. Please try again.")
  })
})
