import { describe, expect, test } from "bun:test"

import type { WorkerBindings } from "../src/config/workerBindingsSchema"
import { passwordResetDeliveryExecute } from "../src/password-recovery/domain/passwordResetDeliveryExecute"
import { zitadelClientCreate } from "../src/zitadel/zitadelClientCreate"

const identityOrigin = "https://identity.example"
const pagesOrigin = "https://login.example"
const email = "person@example.com"
const template = `${pagesOrigin}/api/v2/password/reset/ingress?userId={{.UserID}}&orgId={{.OrgID}}&code={{.Code}}`

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
  RECENT_ACCOUNT_COOKIE_KEY: undefined,
  RECENT_ACCOUNT_COOKIE_PREVIOUS_KEY: undefined,
  ZITADEL_LOGIN_V2_ENABLED: false,
  ZITADEL_EMAIL_OTP_V2_ENABLED: false,
  ZITADEL_PASSWORD_V2_ENABLED: false,
  ZITADEL_PASSWORD_RESET_V2_ENABLED: true,
  ZITADEL_PASSKEY_V2_ENABLED: false,
  ZITADEL_IDP_V2_ENABLED: false,
  ZITADEL_MFA_V2_ENABLED: false,
  ZITADEL_RECENT_ACCOUNT_V2_ENABLED: false,
  RATE_LIMITER: { limit: async () => ({ success: true }) },
} satisfies WorkerBindings

type UserOverrides = {
  state?: string
  organizationId?: string
  email?: string
  verified?: boolean
  human?: boolean
}

function userCreate(overrides: UserOverrides = {}) {
  return {
    userId: "user-secret-1",
    state: overrides.state ?? "USER_STATE_ACTIVE",
    details: { resourceOwner: overrides.organizationId ?? "org-1" },
    ...(overrides.human === false
      ? {}
      : { human: { email: { email: overrides.email ?? email, isVerified: overrides.verified ?? true } } }),
  }
}

function nativeCreate(options: { users?: unknown[]; methods?: string[]; methodStatus?: number; resetStatus?: number }) {
  const calls: Array<{ url: string; method: string; body?: unknown }> = []
  const fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input)
    calls.push({
      url,
      method: init?.method ?? "GET",
      ...(init?.body === undefined ? {} : { body: JSON.parse(String(init.body)) }),
    })
    if (url.endsWith("/v2/settings/login")) {
      return Response.json({ settings: { allowLocalAuthentication: true, hidePasswordReset: false } })
    }
    if (url.endsWith("/v2/users")) return Response.json({ result: options.users ?? [userCreate()] })
    if (url.endsWith("/authentication_methods")) {
      return Response.json(
        { authMethodTypes: options.methods ?? ["AUTHENTICATION_METHOD_TYPE_PASSWORD"] },
        { status: options.methodStatus ?? 200 },
      )
    }
    return Response.json(options.resetStatus === undefined ? {} : { native: "hidden" }, {
      status: options.resetStatus ?? 200,
    })
  }
  return { client: zitadelClientCreate(bindings, fetch), calls }
}

async function execute(options: Parameters<typeof nativeCreate>[0]) {
  const native = nativeCreate(options)
  const result = await passwordResetDeliveryExecute({
    client: native.client,
    email,
    organizationId: "org-1",
    pagesOrigin,
  })
  return { ...native, result }
}

describe("passwordResetDeliveryExecute", () => {
  test("selects only one active organization human with an exact verified email and local password", async () => {
    const ineligible = [
      { users: [] },
      { users: [userCreate(), { ...userCreate(), userId: "user-secret-2" }] },
      { users: [userCreate({ state: "USER_STATE_INACTIVE" })] },
      { users: [userCreate({ organizationId: "foreign-org" })] },
      { users: [userCreate({ verified: false })] },
      { users: [userCreate({ email: "other@example.com" })] },
      { users: [userCreate({ human: false })] },
      { users: [userCreate()], methods: ["AUTHENTICATION_METHOD_TYPE_PASSKEY"] },
    ]

    for (const options of ineligible) {
      const outcome = await execute(options)
      expect(outcome.result).toEqual({ success: true, data: undefined })
      expect(outcome.calls.some((call) => call.url.endsWith("/password_reset"))).toBe(false)
    }
  })

  test("does not deliver when local authentication or native recovery is disabled", async () => {
    for (const settings of [
      { allowLocalAuthentication: false, hidePasswordReset: false },
      { allowLocalAuthentication: true, hidePasswordReset: true },
    ]) {
      const calls: string[] = []
      const client = zitadelClientCreate(bindings, async (input) => {
        calls.push(String(input))
        return Response.json({ settings })
      })
      const result = await passwordResetDeliveryExecute({ client, email, organizationId: "org-1", pagesOrigin })

      expect(result).toEqual({ success: true, data: undefined })
      expect(calls).toEqual([`${identityOrigin}/v2/settings/login`])
    }
  })

  test("uses the fixed exact-origin ingress template with only native placeholders", async () => {
    const outcome = await execute({ users: [userCreate({ email: "PERSON@EXAMPLE.COM" })] })

    expect(outcome.result).toEqual({ success: true, data: undefined })
    expect(outcome.calls.at(-1)).toEqual({
      method: "POST",
      url: `${identityOrigin}/v2/users/user-secret-1/password_reset`,
      body: {
        sendLink: {
          notificationType: "NOTIFICATION_TYPE_EMAIL",
          urlTemplate: template,
        },
      },
    })
    expect((JSON.stringify(outcome.calls).match(/{{\.[A-Za-z]+}}/g) ?? []).sort()).toEqual(
      ["{{.Code}}", "{{.OrgID}}", "{{.UserID}}"].sort(),
    )
  })

  test("accepts bounded native account failures without exposing details", async () => {
    const methodFailure = await execute({ methodStatus: 404 })
    const resetFailure = await execute({ resetStatus: 400 })

    expect(methodFailure.result).toEqual({ success: true, data: undefined })
    expect(methodFailure.calls.some((call) => call.url.endsWith("/password_reset"))).toBe(false)
    expect(resetFailure.result).toEqual({ success: true, data: undefined })
    expect(JSON.stringify({ methodFailure: methodFailure.result, resetFailure: resetFailure.result })).not.toContain(
      "native",
    )
  })

  test("keeps user-specific native failures indistinguishable after lookup", async () => {
    const lookupFailure = await execute({ methodStatus: 503 })
    const resetFailure = await execute({ resetStatus: 503 })

    expect(lookupFailure.result).toEqual({ success: true, data: undefined })
    expect(resetFailure.result).toEqual({ success: true, data: undefined })
    expect(JSON.stringify({ lookupFailure, resetFailure })).not.toContain("native")
  })
})
