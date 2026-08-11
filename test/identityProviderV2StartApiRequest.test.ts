import { afterEach, describe, expect, test } from "bun:test"

import { identityProviderV2StartApiRequest } from "../client/src/identity-provider/api/identityProviderV2StartApiRequest"

const originalFetch = globalThis.fetch
const validCsrf = "C".repeat(43)
const validFlow = "A".repeat(22)

afterEach(() => {
  globalThis.fetch = originalFetch
})

describe("identityProviderV2StartApiRequest browser contract", () => {
  test("posts IdP start payload and returns relative redirectUrl", async () => {
    globalThis.fetch = async (input, init) => {
      expect(String(input)).toBe(`https://worker.example/api/v2/identity-provider/start?flow=${validFlow}`)
      expect(init).toEqual({
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          idpId: "google-1",
          csrfToken: validCsrf,
        }),
      })
      return Response.json({
        success: true,
        data: { redirectUrl: `/api/v2/identity-provider/redirect?flow=${validFlow}` },
      })
    }

    const result = await identityProviderV2StartApiRequest("https://worker.example", validFlow, "google-1", validCsrf)

    expect(result).toEqual({
      success: true,
      data: { redirectUrl: `/api/v2/identity-provider/redirect?flow=${validFlow}` },
    })
  })

  test("rejects absolute redirect URL in JSON response", async () => {
    globalThis.fetch = async () =>
      Response.json({
        success: true,
        data: { redirectUrl: "https://accounts.google.com/o/oauth2/v2/auth?client_id=google" },
      })

    const result = await identityProviderV2StartApiRequest("https://worker.example", validFlow, "google-1", validCsrf)

    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.errorMessage).toBe("The sign-in service returned an invalid response.")
    }
  })

  test("returns fallback transition when Worker responds with fallback transition", async () => {
    globalThis.fetch = async () =>
      Response.json({
        success: true,
        data: { kind: "fallback", path: `/api/v2/flow/fallback?flow=${validFlow}` },
      })

    const result = await identityProviderV2StartApiRequest("https://worker.example", validFlow, "google-1", validCsrf)

    expect(result).toEqual({
      success: true,
      data: { transition: { kind: "fallback", path: `/api/v2/flow/fallback?flow=${validFlow}` } },
    })
  })

  test("returns mapped error message on non-OK status", async () => {
    globalThis.fetch = async () =>
      Response.json({ success: false, op: "identityProviderStart", errorMessage: "idp_not_found" }, { status: 404 })

    const result = await identityProviderV2StartApiRequest(
      "https://worker.example",
      validFlow,
      "unknown-idp",
      validCsrf,
    )

    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.errorMessage).toBe("Sign-in could not be completed. Please try again.")
    }
  })

  test("handles network exception with ResultErr", async () => {
    globalThis.fetch = async () => {
      throw new TypeError("Failed to fetch")
    }

    const result = await identityProviderV2StartApiRequest("https://worker.example", validFlow, "google-1", validCsrf)

    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.errorMessage).toBe("Sign-in is temporarily unavailable. Please try again.")
    }
  })
})
