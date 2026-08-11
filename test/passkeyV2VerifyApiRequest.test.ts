import { afterEach, beforeEach, describe, expect, test, vi } from "vitest"

import { passkeyV2VerifyApiRequest } from "../client/src/passkey/api/passkeyV2VerifyApiRequest"
import type { PasskeyCredentialAssertion } from "../client/src/passkey/model/passkeyVerifyRequestSchema"

const originalFetch = globalThis.fetch
const validCsrf = "C".repeat(43)
const validFlow = "A".repeat(22)

const validAssertion: PasskeyCredentialAssertion = {
  id: "ATmqBg-99qyOZk2zloPdJQyS2R7IkFT7v9Hoos_B_nM",
  rawId: "ATmqBg-99qyOZk2zloPdJQyS2R7IkFT7v9Hoos_B_nM",
  type: "public-key",
  response: {
    clientDataJSON: "eyJ0eXBlIjoid2ViYXV0aG4uZ2V0In0",
    authenticatorData: "SZYN5YgOjGh0NBcPZHZgW4_km1u5-GLWIyG5ZUXrW4E",
    signature: "MEUCIQDa1234567890",
  },
}

describe("passkeyV2VerifyApiRequest", () => {
  beforeEach(() => {
    globalThis.fetch = originalFetch
  })

  afterEach(() => {
    globalThis.fetch = originalFetch
  })

  test("sends assertion verification request and parses complete transition", async () => {
    globalThis.fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input)
      expect(url).toContain("/api/v2/passkey/verify?flow=" + validFlow)
      expect(init?.method).toBe("POST")
      const body = JSON.parse(String(init?.body))
      expect(body.credential).toEqual(validAssertion)
      expect(body.csrfToken).toBe(validCsrf)

      return Response.json({
        success: true,
        data: {
          kind: "complete",
          path: `/api/v2/flow/continue?flow=${validFlow}`,
        },
      })
    })

    const result = await passkeyV2VerifyApiRequest("https://api.example", validFlow, {
      credential: validAssertion,
      csrfToken: validCsrf,
    })

    expect(result.success).toBe(true)
    if (!result.success) return
    expect(result.data.kind).toBe("complete")
  })

  test("handles verification failure with mapped error message", async () => {
    globalThis.fetch = vi.fn(async () => {
      return Response.json(
        {
          success: false,
          op: "passkeyVerify",
          errorMessage: "credentials_invalid",
        },
        { status: 401 },
      )
    })

    const result = await passkeyV2VerifyApiRequest("https://api.example", validFlow, {
      credential: validAssertion,
      csrfToken: validCsrf,
    })

    expect(result.success).toBe(false)
    if (result.success) return
    expect(result.errorMessage).toBe("Invalid username or password.")
  })
})
