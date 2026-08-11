import { afterEach, beforeEach, describe, expect, test, vi } from "vitest"

import { passkeyV2ChallengeApiRequest } from "../client/src/passkey/api/passkeyV2ChallengeApiRequest"

const originalFetch = globalThis.fetch
const validCsrf = "C".repeat(43)
const validFlow = "A".repeat(22)

describe("passkeyV2ChallengeApiRequest", () => {
  beforeEach(() => {
    globalThis.fetch = originalFetch
  })

  afterEach(() => {
    globalThis.fetch = originalFetch
  })

  test("sends challenge options request and parses render transition", async () => {
    const mockOptions = {
      publicKey: {
        challenge: "GAOHYz2jE69kJMYo6Laij8yWw9-dKKgbViNhfuy0StA",
        rpId: "login.example",
      },
    }

    globalThis.fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input)
      expect(url).toContain("/api/v2/passkey/challenge?flow=" + validFlow)
      expect(init?.method).toBe("POST")
      const body = JSON.parse(String(init?.body))
      expect(body.identifier).toBe("user@example.com")
      expect(body.csrfToken).toBe(validCsrf)

      return Response.json({
        success: true,
        data: {
          kind: "render",
          route: `/login/passkey?flow=${validFlow}`,
          screen: {
            name: "passkey",
            options: mockOptions,
          },
          csrfToken: validCsrf,
        },
      })
    })

    const result = await passkeyV2ChallengeApiRequest("https://api.example", validFlow, {
      identifier: "user@example.com",
      csrfToken: validCsrf,
    })

    expect(result.success).toBe(true)
    if (!result.success) return
    expect(result.data.kind).toBe("render")
  })

  test("handles non-ok response with mapped error message", async () => {
    globalThis.fetch = vi.fn(async () => {
      return Response.json(
        {
          success: false,
          op: "passkeyChallengeCreate",
          errorMessage: "passkey_unavailable",
        },
        { status: 503 },
      )
    })

    const result = await passkeyV2ChallengeApiRequest("https://api.example", validFlow, {
      csrfToken: validCsrf,
    })

    expect(result.success).toBe(false)
    if (result.success) return
    expect(result.errorMessage).toBe("Passkey sign-in is temporarily unavailable.")
  })
})
