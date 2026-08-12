import { afterEach, describe, expect, mock, test } from "bun:test"

import { passwordRecoveryBootstrapApiRequest } from "../client/src/password-recovery/api/passwordRecoveryBootstrapApiRequest"
import { passwordResetRequestApiRequest } from "../client/src/password-recovery/api/passwordResetRequestApiRequest"
import { passwordResetSetApiRequest } from "../client/src/password-recovery/api/passwordResetSetApiRequest"
import { passwordResetSetBootstrapApiRequest } from "../client/src/password-recovery/api/passwordResetSetBootstrapApiRequest"
import { passwordRecoveryRouteRead } from "../client/src/password-recovery/model/passwordRecoveryRouteRead"

const apiOrigin = "https://login.example"
const csrfToken = "B".repeat(43)
const nextCsrfToken = "C".repeat(43)
const originalFetch = globalThis.fetch

afterEach(() => {
  globalThis.fetch = originalFetch
})

function fetchMockSet(response: Response) {
  const calls: Array<{ url: string; init: RequestInit }> = []
  globalThis.fetch = mock(async (input: RequestInfo | URL, init?: RequestInit) => {
    calls.push({ url: String(input), init: init ?? {} })
    return response.clone()
  }) as unknown as typeof fetch
  return calls
}

describe("passwordRecoveryRouteRead", () => {
  test("resolves only the canonical standalone recovery routes", () => {
    expect(passwordRecoveryRouteRead("/password/forgot")).toBe("request")
    expect(passwordRecoveryRouteRead("/password/reset")).toBe("reset")
    expect(passwordRecoveryRouteRead("/password/reset/")).toBe("reset")
    expect(passwordRecoveryRouteRead("/login/password")).toBeUndefined()
    expect(passwordRecoveryRouteRead("/password")).toBeUndefined()
  })
})

describe("passwordRecoveryBootstrapApiRequest", () => {
  test("posts an empty credentialed JSON body and returns the memory-only CSRF token", async () => {
    const calls = fetchMockSet(Response.json({ success: true, data: { status: "ready", csrfToken, expiresAt: 1000 } }))

    const result = await passwordRecoveryBootstrapApiRequest(apiOrigin)

    expect(result.success).toBe(true)
    expect(calls).toHaveLength(1)
    expect(calls[0]?.url).toBe("https://login.example/api/v2/password/reset/bootstrap")
    expect(calls[0]?.init.method).toBe("POST")
    expect(calls[0]?.init.credentials).toBe("include")
    expect(calls[0]?.init.body).toBe("{}")
    if (result.success) expect(result.data.csrfToken).toBe(csrfToken)
  })

  test("maps disabled capability to a non-leaking message", async () => {
    fetchMockSet(
      Response.json(
        { success: false, op: "passwordRecoveryBootstrap", errorMessage: "capability_disabled" },
        { status: 404 },
      ),
    )

    const result = await passwordRecoveryBootstrapApiRequest(apiOrigin)

    expect(result.success).toBe(false)
    if (!result.success) expect(result.errorMessage).toBe("Password recovery is not available.")
  })
})

describe("passwordResetRequestApiRequest", () => {
  test("sends exactly the normalized email and CSRF token", async () => {
    const calls = fetchMockSet(Response.json({ success: true, data: { status: "accepted" } }, { status: 202 }))

    const result = await passwordResetRequestApiRequest(apiOrigin, { email: "user@example.com", csrfToken })

    expect(result.success).toBe(true)
    expect(calls[0]?.url).toBe("https://login.example/api/v2/password/reset/request")
    expect(JSON.parse(String(calls[0]?.init.body))).toEqual({ email: "user@example.com", csrfToken })
  })

  test("never reveals account existence for any successful outcome", async () => {
    fetchMockSet(Response.json({ success: true, data: { status: "accepted" } }, { status: 202 }))

    const result = await passwordResetRequestApiRequest(apiOrigin, { email: "unknown@example.com", csrfToken })

    expect(result).toEqual({ success: true, data: undefined })
  })
})

describe("passwordResetSetBootstrapApiRequest", () => {
  test("posts an empty credentialed body and returns rotated CSRF without native credentials", async () => {
    const calls = fetchMockSet(
      Response.json({
        success: true,
        data: { status: "ready", screen: "password_reset", csrfToken, expiresAt: 1000 },
      }),
    )

    const result = await passwordResetSetBootstrapApiRequest(apiOrigin)

    expect(calls[0]?.init.body).toBe("{}")
    expect(calls[0]?.init.credentials).toBe("include")
    expect(result.success).toBe(true)
    if (result.success) {
      expect(Object.keys(result.data).sort()).toEqual(["csrfToken", "expiresAt", "screen", "status"])
    }
  })

  test("collapses replayed or expired state to an invalid-link message", async () => {
    fetchMockSet(
      Response.json({ success: false, op: "passwordResetSetBootstrap", errorMessage: "invalid_link" }, { status: 409 }),
    )

    const result = await passwordResetSetBootstrapApiRequest(apiOrigin)

    expect(result.success).toBe(false)
    if (!result.success) expect(result.errorMessage).toBe("This password reset link is invalid or has expired.")
  })
})

describe("passwordResetSetApiRequest", () => {
  test("sends only the password and CSRF token", async () => {
    const calls = fetchMockSet(Response.json({ success: true, data: { status: "complete" } }))

    const result = await passwordResetSetApiRequest(apiOrigin, { password: "new-password", csrfToken })

    expect(result.success).toBe(true)
    expect(JSON.parse(String(calls[0]?.init.body))).toEqual({ password: "new-password", csrfToken })
    expect(String(calls[0]?.init.body)).not.toContain("confirmation")
    expect(String(calls[0]?.init.body)).not.toContain("code")
    expect(String(calls[0]?.init.body)).not.toContain("userId")
    expect(String(calls[0]?.init.body)).not.toContain("email")
  })

  test("returns a retryable outcome with rotated CSRF on policy failure", async () => {
    fetchMockSet(
      Response.json(
        {
          success: false,
          op: "passwordResetSet",
          errorMessage: "password_policy_invalid",
          csrfToken: nextCsrfToken,
          expiresAt: 2000,
        },
        { status: 400 },
      ),
    )

    const result = await passwordResetSetApiRequest(apiOrigin, { password: "weak", csrfToken })

    expect(result.success).toBe(true)
    if (result.success && result.data.status === "retryable") {
      expect(result.data.csrfToken).toBe(nextCsrfToken)
      expect(result.data.errorMessage).toBe("This password does not meet the password policy.")
    } else {
      throw new Error("expected retryable outcome")
    }
  })

  test("returns a terminal outcome for invalid links", async () => {
    fetchMockSet(
      Response.json({ success: false, op: "passwordResetSet", errorMessage: "invalid_link" }, { status: 409 }),
    )

    const result = await passwordResetSetApiRequest(apiOrigin, { password: "new-password", csrfToken })

    expect(result.success).toBe(true)
    if (result.success) expect(result.data.status).toBe("terminal")
  })

  test("keeps unknown service failures retryable as a generic error", async () => {
    fetchMockSet(
      Response.json({ success: false, op: "passwordResetSet", errorMessage: "service_unavailable" }, { status: 503 }),
    )

    const result = await passwordResetSetApiRequest(apiOrigin, { password: "new-password", csrfToken })

    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.errorMessage).toBe("Password recovery is temporarily unavailable. Please try again.")
    }
  })
})
