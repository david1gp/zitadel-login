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

describe("zitadelClientCreate TOTP enrollment", () => {
  test("creates enrollment with the native path and maps provisioning data", async () => {
    const native = nativeCreate(
      Response.json({
        details: { sequence: "2", resourceOwner: "org-1" },
        uri: "otpauth://totp/ZITADEL:person@example.com?secret=ABC234",
        secret: "ABC234",
      }),
    )

    const result = await native.client.totpEnrollmentCreate("user/id")

    expect(native.calls).toEqual([
      {
        method: "POST",
        url: `${identityOrigin}/v2/users/user%2Fid/totp`,
        body: {},
      },
    ])
    expect(result).toEqual({
      success: true,
      data: {
        uri: "otpauth://totp/ZITADEL:person@example.com?secret=ABC234",
        secret: "ABC234",
      },
    })
  })

  test("verifies enrollment with the native path and body", async () => {
    const native = nativeCreate(Response.json({ details: { sequence: "3" } }))

    const result = await native.client.totpEnrollmentVerify("user-1", "123456")

    expect(native.calls).toEqual([
      {
        method: "POST",
        url: `${identityOrigin}/v2/users/user-1/totp/verify`,
        body: { code: "123456" },
      },
    ])
    expect(result).toEqual({ success: true, data: { details: { sequence: "3" } } })
  })

  test("rejects invalid input and malformed enrollment data before continuing", async () => {
    const native = nativeCreate(Response.json({}))

    const invalidUser = await native.client.totpEnrollmentCreate("")
    const invalidCode = await native.client.totpEnrollmentVerify("user-1", "12345")
    const malformedResponse = await zitadelClientCreate(bindings, async () =>
      Response.json({ uri: "https://example.com", secret: "not-a-totp-secret" }),
    ).totpEnrollmentCreate("user-1")

    expect(invalidUser.success).toBe(false)
    expect(invalidCode.success).toBe(false)
    expect(native.calls).toHaveLength(0)
    expect(malformedResponse).toEqual({
      success: false,
      op: "totpEnrollmentCreate",
      errorMessage: "ZITADEL returned an invalid payload",
      rawData: { status: 200 },
    })
  })

  test("bounds transport failures to a generic error and status", async () => {
    const network = nativeCreate(new Error("network failure"))
    const networkResult = await network.client.totpEnrollmentVerify("user-1", "123456")

    const rejected = nativeCreate(Response.json({ secret: "should-not-leak" }, { status: 502 }))
    const rejectedResult = await rejected.client.totpEnrollmentVerify("user-1", "123456")

    expect(networkResult).toEqual({
      success: false,
      op: "totpEnrollmentVerify",
      errorMessage: "ZITADEL request failed",
    })
    expect(rejectedResult).toEqual({
      success: false,
      op: "totpEnrollmentVerify",
      errorMessage: "ZITADEL rejected the request",
      rawData: { status: 502 },
    })
  })
})
