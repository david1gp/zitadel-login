import { describe, expect, test } from "bun:test"

import type { WorkerBindings } from "../src/config/workerBindingsSchema"
import { zitadelClientCreate } from "../src/zitadel/zitadelClientCreate"

const identityOrigin = "https://identity.example"
const pagesOrigin = "https://login.example"
const resetTemplate = `${pagesOrigin}/api/v2/password/reset/ingress?userId={{.UserID}}&orgId={{.OrgID}}&code={{.Code}}`

const bindings = {
  ZITADEL_ORIGIN: identityOrigin,
  ZITADEL_ORGANIZATION_ID: "org-1",
  ZITADEL_ALLOWED_CLIENT_IDS: ["client-1"],
  LOGIN_V2_FALLBACK_URL: `${identityOrigin}/ui/v2/login`,
  PAGES_ORIGIN: pagesOrigin,
  SESSION_LIFETIME_SECONDS: 900,
  ZITADEL_LOGIN_CLIENT_PAT: "test-pat-not-a-real-secret-value",
  FLOW_COOKIE_KEY: "A".repeat(43),
  FLOW_COOKIE_PREVIOUS_KEY: undefined,
  RECENT_ACCOUNT_COOKIE_KEY: "A".repeat(43),
  RECENT_ACCOUNT_COOKIE_PREVIOUS_KEY: undefined,
  ZITADEL_LOGIN_V2_ENABLED: true,
  ZITADEL_EMAIL_OTP_V2_ENABLED: true,
  ZITADEL_PASSWORD_V2_ENABLED: true,
  ZITADEL_PASSWORD_RESET_V2_ENABLED: true,
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
    return response.clone()
  }
  return { client: zitadelClientCreate(bindings, fetch), calls }
}

describe("zitadelClientCreate password lifecycle", () => {
  test("requests an email reset link with the v4.16 path and oneof body", async () => {
    const native = nativeCreate(Response.json({ details: { sequence: "2", resourceOwner: "org-1" } }))

    const result = await native.client.passwordResetRequest("user/id", resetTemplate)

    expect(native.calls).toEqual([
      {
        method: "POST",
        url: `${identityOrigin}/v2/users/user%2Fid/password_reset`,
        body: {
          sendLink: {
            notificationType: "NOTIFICATION_TYPE_EMAIL",
            urlTemplate: resetTemplate,
          },
        },
      },
    ])
    expect(result).toEqual({ success: true, data: { details: { sequence: "2", resourceOwner: "org-1" } } })
  })

  test("rejects reset templates that cannot safely reach the Worker ingress", async () => {
    const native = nativeCreate(Response.json({}))
    const missingCode = await native.client.passwordResetRequest(
      "user-1",
      `${pagesOrigin}/api/v2/password/reset/ingress?userId={{.UserID}}&orgId={{.OrgID}}`,
    )
    const external = await native.client.passwordResetRequest(
      "user-1",
      "https://attacker.example/reset?userID={{.UserID}}&orgID={{.OrgID}}&code={{.Code}}",
    )
    const injected = await native.client.passwordResetRequest(
      "user-1",
      `${pagesOrigin}/api/v2/password/reset/ingress?userId={{.UserID}}&orgId={{.OrgID}}&code={{.Code}}{{.Unexpected}}`,
    )

    expect(missingCode.success).toBe(false)
    expect(external.success).toBe(false)
    expect(injected.success).toBe(false)
    expect(native.calls).toHaveLength(0)
  })

  test("sets passwords with exactly one verification oneof", async () => {
    const native = nativeCreate(Response.json({ details: { sequence: "3", resourceOwner: "org-1" } }))

    const byCode = await native.client.passwordSet(
      "user/id",
      "new-password-secret",
      { mode: "verification_code", verificationCode: "reset-code-secret" },
      true,
    )
    const byCurrentPassword = await native.client.passwordSet("user/id", "another-new-password-secret", {
      mode: "current_password",
      currentPassword: "current-password-secret",
    })

    expect(native.calls).toEqual([
      {
        method: "POST",
        url: `${identityOrigin}/v2/users/user%2Fid/password`,
        body: {
          newPassword: { password: "new-password-secret", changeRequired: true },
          verificationCode: "reset-code-secret",
        },
      },
      {
        method: "POST",
        url: `${identityOrigin}/v2/users/user%2Fid/password`,
        body: {
          newPassword: { password: "another-new-password-secret", changeRequired: false },
          currentPassword: "current-password-secret",
        },
      },
    ])
    expect(byCode).toEqual({ success: true, data: { details: { sequence: "3", resourceOwner: "org-1" } } })
    expect(byCurrentPassword).toEqual({ success: true, data: { details: { sequence: "3", resourceOwner: "org-1" } } })
  })

  test("bounds secrets and maps reset and set failures by exact v4.16 IDs without native-detail leaks", async () => {
    const native = nativeCreate(
      Response.json({ id: "COMMAND-SAF4f", error: "user missing; secret=native-secret" }, { status: 404 }),
    )
    const resetFailure = await native.client.passwordResetRequest("user-1", resetTemplate)
    const setFailure = await native.client.passwordSet("user-1", "new-password-secret", {
      mode: "verification_code",
      verificationCode: "reset-code-secret",
    })
    const invalid = await native.client.passwordSet("user-1", "x".repeat(201), {
      mode: "verification_code",
      verificationCode: "x".repeat(21),
    })
    const malformed = await zitadelClientCreate(bindings, async () =>
      Response.json({ verificationCode: "native-secret" }),
    ).passwordSet("user-1", "new-password-secret", { mode: "verification_code", verificationCode: "reset-code-secret" })
    const unavailableReset = await zitadelClientCreate(bindings, async () => {
      throw new Error("transport secret")
    }).passwordResetRequest("user-1", resetTemplate)
    const unclassifiedClientError = await zitadelClientCreate(bindings, async () =>
      Response.json({ id: "OTHER-ID" }, { status: 400 }),
    ).passwordResetRequest("user-1", resetTemplate)

    expect(resetFailure).toEqual({
      success: false,
      op: "passwordResetRequest",
      errorMessage: "password_reset_account_failure",
    })
    expect(setFailure).toEqual({ success: false, op: "passwordSet", errorMessage: "password_set_unavailable" })
    expect(unavailableReset).toEqual({
      success: false,
      op: "passwordResetRequest",
      errorMessage: "password_reset_unavailable",
    })
    expect(unclassifiedClientError).toEqual({
      success: false,
      op: "passwordResetRequest",
      errorMessage: "password_reset_unavailable",
    })
    expect(invalid.success).toBe(false)
    expect(native.calls).toHaveLength(2)
    expect(malformed).toEqual({ success: false, op: "passwordSet", errorMessage: "password_set_unavailable" })
    expect(JSON.stringify({ resetFailure, setFailure, invalid, malformed })).not.toContain("secret")
  })

  test("classifies only exact v4.16 password-policy and terminal reset IDs", async () => {
    const policyIds = ["DOMAIN-HuJf6", "DOMAIN-co3Xw", "DOMAIN-VoaRj", "DOMAIN-ZBv4H", "DOMAIN-ZDLwA"]
    const terminalIds = ["CODE-QvUQ4P", "CODE-woT0xc", "CRYPT-aqrFV", "COMMAND-G8dh3", "COMMAND-M9dse"]

    for (const id of policyIds) {
      const result = await nativeCreate(Response.json({ id }, { status: 400 })).client.passwordSet(
        "user-1",
        "new-password-secret",
        { mode: "verification_code", verificationCode: "reset-code-secret" },
      )
      expect(result).toEqual({ success: false, op: "passwordSet", errorMessage: "password_policy_invalid" })
    }
    for (const id of terminalIds) {
      const result = await nativeCreate(Response.json({ error: { id } }, { status: 400 })).client.passwordSet(
        "user-1",
        "new-password-secret",
        { mode: "verification_code", verificationCode: "reset-code-secret" },
      )
      expect(result).toEqual({ success: false, op: "passwordSet", errorMessage: "password_reset_link_invalid" })
    }
    const broadStatus = await nativeCreate(Response.json({ id: "OTHER-ID" }, { status: 400 })).client.passwordSet(
      "user-1",
      "new-password-secret",
      { mode: "verification_code", verificationCode: "reset-code-secret" },
    )
    expect(broadStatus).toEqual({ success: false, op: "passwordSet", errorMessage: "password_set_unavailable" })
  })

  test("classifies exact current-password failures without changing the native request body", async () => {
    for (const id of ["COMMAND-3M0fs", "COMMAND-JLK35", "COMMAND-SFA3t"]) {
      const native = nativeCreate(Response.json({ id }, { status: 400 }))
      const result = await native.client.passwordSet(
        "user-1",
        "new-password-secret",
        { mode: "current_password", currentPassword: "current-password-secret" },
        false,
      )

      expect(result).toEqual({ success: false, op: "passwordSet", errorMessage: "password_current_invalid" })
      expect(native.calls[0]?.body).toEqual({
        newPassword: { password: "new-password-secret", changeRequired: false },
        currentPassword: "current-password-secret",
      })
    }
  })
})
