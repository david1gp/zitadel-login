import { describe, expect, test } from "bun:test"

import type { WorkerBindings } from "../src/config/workerBindingsSchema"
import { zitadelClientCreate } from "../src/zitadel/zitadelClientCreate"

const identityOrigin = "https://identity.example"

const bindings = {
  ZITADEL_ORIGIN: identityOrigin,
  ZITADEL_ORGANIZATION_ID: "org-1",
  ZITADEL_ALLOWED_CLIENT_IDS: ["client-1"],
  LOGIN_V2_FALLBACK_URL: `${identityOrigin}/ui/v2/login`,
  PAGES_ORIGIN: "https://login.example",
  SESSION_LIFETIME_SECONDS: 900,
  ZITADEL_LOGIN_CLIENT_PAT: "test-pat-not-a-real-secret-value",
  FLOW_COOKIE_KEY: "A".repeat(43),
  FLOW_COOKIE_PREVIOUS_KEY: undefined,
  RECENT_ACCOUNT_COOKIE_KEY: "A".repeat(43),
  RECENT_ACCOUNT_COOKIE_PREVIOUS_KEY: undefined,
  ZITADEL_LOGIN_V2_ENABLED: true,
  ZITADEL_EMAIL_OTP_V2_ENABLED: true,
  ZITADEL_PASSWORD_V2_ENABLED: true,
  ZITADEL_PASSKEY_V2_ENABLED: true,
  ZITADEL_IDP_V2_ENABLED: true,
  ZITADEL_MFA_V2_ENABLED: true,
  ZITADEL_RECENT_ACCOUNT_V2_ENABLED: true,
  RATE_LIMITER: { limit: async () => ({ success: true }) },
} satisfies WorkerBindings

function nativeCreate(response: Response | Error) {
  const calls: Array<{ method: string; url: string; body?: unknown }> = []
  const fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
    const body = init?.body === undefined ? undefined : JSON.parse(String(init.body))
    calls.push({ method: init?.method ?? "GET", url: String(input), body })
    if (response instanceof Error) throw response
    return response
  }
  return { client: zitadelClientCreate(bindings, fetch), calls }
}

describe("zitadelClientCreate AddOTPEmail", () => {
  test("uses the native path and maps bounded response details", async () => {
    const native = nativeCreate(
      Response.json({ details: { sequence: "2", changeDate: "2026-08-12T10:00:00Z", resourceOwner: "org-1" } }),
    )

    const result = await native.client.addOTPEmail("user/id")

    expect(native.calls).toEqual([
      {
        method: "POST",
        url: `${identityOrigin}/v2/users/user%2Fid/otp_email`,
        body: {},
      },
    ])
    expect(result).toEqual({
      success: true,
      data: { details: { sequence: "2", changeDate: "2026-08-12T10:00:00Z", resourceOwner: "org-1" } },
    })
  })

  test("bounds user IDs before mutation and rejects malformed details", async () => {
    const native = nativeCreate(Response.json({ details: { resourceOwner: "org-1", secret: "must-not-leak" } }))
    const invalidUser = await native.client.addOTPEmail("")
    const tooLongUser = await native.client.addOTPEmail("x".repeat(201))
    const malformed = await native.client.addOTPEmail("user-1")

    expect(invalidUser.success).toBe(false)
    expect(tooLongUser.success).toBe(false)
    expect(malformed).toEqual({
      success: false,
      op: "addOTPEmail",
      errorMessage: "ZITADEL returned an invalid payload",
      rawData: { status: 200 },
    })
    expect(native.calls).toHaveLength(1)
    expect(JSON.stringify(malformed)).not.toContain("must-not-leak")
  })

  test("maps native enrollment failures without leaking response bodies", async () => {
    const cases = [
      [409, "method_already_enrolled"],
      [412, "email_not_verified"],
      [403, "permission_denied"],
      [503, "service_unavailable"],
    ] as const

    for (const [status, errorMessage] of cases) {
      const native = nativeCreate(Response.json({ error: "native secret detail" }, { status }))
      const result = await native.client.addOTPEmail("user-1")

      expect(result).toEqual({ success: false, op: "addOTPEmail", errorMessage, rawData: { status } })
      expect(JSON.stringify(result)).not.toContain("native secret detail")
    }
  })

  test("maps transport failure to a generic service error", async () => {
    const native = nativeCreate(new Error("native secret transport detail"))

    const result = await native.client.addOTPEmail("user-1")

    expect(result).toEqual({ success: false, op: "addOTPEmail", errorMessage: "service_unavailable" })
    expect(JSON.stringify(result)).not.toContain("native secret transport detail")
  })
})
