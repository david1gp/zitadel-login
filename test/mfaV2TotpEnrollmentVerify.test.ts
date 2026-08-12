import { describe, expect, test } from "bun:test"

import type { WorkerBindings } from "../src/config/workerBindingsSchema"
import type { FlowV2Cookie } from "../src/flow/model/flowV2CookieSchema"
import { mfaV2TotpEnrollmentVerify } from "../src/mfa/domain/mfaV2TotpEnrollmentVerify"
import { zitadelClientCreate } from "../src/zitadel/zitadelClientCreate"

const identityOrigin = "https://identity.example"
const now = 1_800_000_000
const verifiedAt = "2027-01-15T08:00:00Z"
const state: Extract<FlowV2Cookie, { stage: "mfa_totp_setup" }> = {
  version: 2,
  flowHandle: "AAAAAAAAAAAAAAAAAAAAAA",
  requestKind: "oidc",
  authRequestId: "request-1",
  clientId: "client-1",
  redirectUri: "https://client.example/callback",
  organizationId: "org-1",
  prompt: ["PROMPT_LOGIN"],
  csrfToken: "B".repeat(43),
  issuedAt: now,
  expiresAt: now + 900,
  transitionCounter: 3,
  stage: "mfa_totp_setup",
  delegable: false,
  userId: "user-secret-id",
  sessionId: "session-secret-id",
  sessionToken: "initial-secret-token",
  mfaMethods: [],
  enrollmentStartedAt: now,
}
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
  RECENT_ACCOUNT_COOKIE_KEY: undefined,
  RECENT_ACCOUNT_COOKIE_PREVIOUS_KEY: undefined,
  ZITADEL_LOGIN_V2_ENABLED: true,
  ZITADEL_EMAIL_OTP_V2_ENABLED: true,
  ZITADEL_PASSWORD_V2_ENABLED: true,
  ZITADEL_PASSKEY_V2_ENABLED: true,
  ZITADEL_IDP_V2_ENABLED: true,
  ZITADEL_MFA_V2_ENABLED: true,
  ZITADEL_RECENT_ACCOUNT_V2_ENABLED: false,
  RATE_LIMITER: { limit: async () => ({ success: true }) },
} satisfies WorkerBindings

type NativeOptions = {
  sessionGetStatusAt?: number
  userStatusAt?: number
  methodsStatusAt?: number
  settingsStatusAt?: number
  enrollmentStatus?: number
  sessionVerifyStatus?: number
  bindingOrganizationId?: string
  firstMethods?: string[]
  postMethods?: string[]
  forceMfa?: boolean
  postFactors?: Record<string, unknown>
  postSecondFactors?: string[]
}

function nativeCreate(options: NativeOptions = {}) {
  const calls: Array<{ method: string; url: string; body?: unknown }> = []
  let sessionGetCount = 0
  let userGetCount = 0
  let methodsGetCount = 0
  let settingsGetCount = 0
  const fetch = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const url = String(input)
    const method = init?.method ?? "GET"
    const body = init?.body ? JSON.parse(String(init.body)) : undefined
    calls.push({ method, url, ...(body === undefined ? {} : { body }) })

    if (url.startsWith(`${identityOrigin}/v2/sessions/session-secret-id?`) && method === "GET") {
      sessionGetCount += 1
      if (options.sessionGetStatusAt === sessionGetCount) return Response.json({}, { status: 503 })
      const post = sessionGetCount === 3
      return Response.json({
        session: {
          id: "session-secret-id",
          sessionToken: post ? "post-policy-secret-token" : `preflight-secret-token-${sessionGetCount}`,
          expirationDate: "2027-01-15T08:15:00Z",
          factors: post
            ? (options.postFactors ?? {
                user: { id: "user-secret-id", organizationId: "org-1" },
                password: { verifiedAt },
                totp: { verifiedAt },
              })
            : {
                user: {
                  id: "user-secret-id",
                  organizationId: options.bindingOrganizationId ?? "org-1",
                },
                password: { verifiedAt },
              },
        },
      })
    }
    if (url === `${identityOrigin}/v2/users/user-secret-id` && method === "GET") {
      userGetCount += 1
      if (options.userStatusAt === userGetCount) return Response.json({}, { status: 503 })
      return Response.json({
        user: {
          userId: "user-secret-id",
          state: "USER_STATE_ACTIVE",
          details: { resourceOwner: "org-1" },
          human: { email: { email: "secret-person@example.com", isVerified: true } },
        },
      })
    }
    if (url === `${identityOrigin}/v2/users/user-secret-id/authentication_methods` && method === "GET") {
      methodsGetCount += 1
      if (options.methodsStatusAt === methodsGetCount) return Response.json({}, { status: 503 })
      return Response.json({
        authMethodTypes:
          methodsGetCount === 1
            ? (options.firstMethods ?? ["AUTHENTICATION_METHOD_TYPE_PASSWORD"])
            : (options.postMethods ?? ["AUTHENTICATION_METHOD_TYPE_PASSWORD", "AUTHENTICATION_METHOD_TYPE_TOTP"]),
      })
    }
    if (url === `${identityOrigin}/v2/settings/login` && method === "GET") {
      settingsGetCount += 1
      if (options.settingsStatusAt === settingsGetCount) return Response.json({}, { status: 503 })
      return Response.json({
        settings: {
          forceMfa: options.forceMfa ?? true,
          secondFactors:
            settingsGetCount === 1
              ? ["SECOND_FACTOR_TYPE_OTP"]
              : (options.postSecondFactors ?? ["SECOND_FACTOR_TYPE_OTP"]),
          multiFactors: [],
        },
      })
    }
    if (url === `${identityOrigin}/v2/users/user-secret-id/totp/verify` && method === "POST") {
      if (options.enrollmentStatus) {
        return Response.json({ nativeSecret: "must-not-leak" }, { status: options.enrollmentStatus })
      }
      return Response.json({ details: { sequence: "4", resourceOwner: "org-1" } })
    }
    if (url === `${identityOrigin}/v2/sessions/session-secret-id` && method === "PATCH") {
      if (options.sessionVerifyStatus) {
        return Response.json({ nativeSecret: "must-not-leak" }, { status: options.sessionVerifyStatus })
      }
      return Response.json({ sessionToken: "checked-secret-token" })
    }
    throw new Error(`Unexpected request: ${method} ${url}`)
  }
  return { client: zitadelClientCreate(bindings, fetch), calls }
}

describe("mfaV2TotpEnrollmentVerify", () => {
  test("activates enrollment, records TOTPChecked with the same code, retains rotations, and completes", async () => {
    const native = nativeCreate()
    const result = await mfaV2TotpEnrollmentVerify({ state, code: "123456", now, client: native.client })

    expect(result.success).toBe(true)
    if (!result.success) return
    expect(result.data.state.stage).toBe("verified")
    expect(result.data.state.sessionToken).toBe("post-policy-secret-token")
    expect(result.data.state.transitionCounter).toBe(4)
    expect(result.data.transition).toEqual({
      kind: "complete",
      path: `/api/v2/flow/continue?flow=${state.flowHandle}`,
    })
    expect(native.calls.filter((call) => call.url.endsWith("/totp/verify"))[0]?.body).toEqual({ code: "123456" })
    expect(native.calls.filter((call) => call.method === "PATCH")[0]?.body).toEqual({
      sessionToken: "preflight-secret-token-2",
      checks: { totp: { code: "123456" } },
      lifetime: "900s",
    })
    expect(JSON.stringify(result.data.state)).not.toContain("123456")
  })

  test("rejects invalid, expired, rebound, and changed-policy setup before activation", async () => {
    const invalid = nativeCreate()
    const invalidResult = await mfaV2TotpEnrollmentVerify({ state, code: "12345", now, client: invalid.client })
    expect(invalidResult.success).toBe(false)
    expect(invalid.calls).toHaveLength(0)

    const expired = nativeCreate()
    const expiredResult = await mfaV2TotpEnrollmentVerify({
      state: { ...state, expiresAt: now },
      code: "123456",
      now,
      client: expired.client,
    })
    expect(expiredResult.success).toBe(false)
    expect(expired.calls).toHaveLength(0)

    const rebound = nativeCreate({ bindingOrganizationId: "other-org" })
    const reboundResult = await mfaV2TotpEnrollmentVerify({ state, code: "123456", now, client: rebound.client })
    expect(reboundResult.success).toBe(false)
    if (!reboundResult.success) expect(reboundResult.errorMessage).toBe("session_stale")

    const changedPolicy = nativeCreate({ forceMfa: false })
    const changedPolicyResult = await mfaV2TotpEnrollmentVerify({
      state,
      code: "123456",
      now,
      client: changedPolicy.client,
    })
    expect(changedPolicyResult.success).toBe(false)
    if (!changedPolicyResult.success) expect(changedPolicyResult.errorMessage).toBe("mfa_enrollment_not_allowed")

    for (const native of [rebound, changedPolicy]) {
      expect(native.calls.some((call) => call.url.endsWith("/totp/verify"))).toBe(false)
    }
  })

  test("bounds native failures before activation and never proceeds to Session verification", async () => {
    for (const options of [
      { sessionGetStatusAt: 1 },
      { userStatusAt: 1 },
      { methodsStatusAt: 1 },
      { settingsStatusAt: 1 },
      { enrollmentStatus: 503 },
    ]) {
      const native = nativeCreate(options)
      const result = await mfaV2TotpEnrollmentVerify({ state, code: "123456", now, client: native.client })
      expect(result.success).toBe(false)
      expect(native.calls.some((call) => call.method === "PATCH")).toBe(false)
      expect(JSON.stringify(result)).not.toContain("must-not-leak")
    }
  })

  test("maps a rejected registration code without exposing native failure data", async () => {
    const native = nativeCreate({ enrollmentStatus: 400 })
    const result = await mfaV2TotpEnrollmentVerify({ state, code: "000000", now, client: native.client })

    expect(result).toEqual({
      success: false,
      op: "mfaV2TotpEnrollmentVerify",
      errorMessage: "code_invalid",
      rawData: { status: 400 },
    })
    expect(JSON.stringify(result)).not.toContain("must-not-leak")
  })

  test("advances to recoverable enrolled TOTP after activation when Session verification fails", async () => {
    for (const sessionVerifyStatus of [400, 503]) {
      const native = nativeCreate({ sessionVerifyStatus })
      const result = await mfaV2TotpEnrollmentVerify({ state, code: "123456", now, client: native.client })

      expect(result.success).toBe(true)
      if (!result.success) continue
      expect(result.data.state.stage).toBe("mfa")
      expect(result.data.state.sessionToken).toBe("preflight-secret-token-2")
      expect(result.data.state.mfaMethods).toContain("AUTHENTICATION_METHOD_TYPE_TOTP")
      expect(result.data.transition).toEqual({
        kind: "render",
        route: `/login/mfa?flow=${state.flowHandle}`,
        screen: { name: "mfa", factors: ["AUTHENTICATION_METHOD_TYPE_TOTP"] },
        csrfToken: state.csrfToken,
      })
      expect(native.calls.filter((call) => call.url.endsWith("/totp/verify"))).toHaveLength(1)
    }
  })

  test("retains the checked token and renders recovery when post-check policy refresh fails", async () => {
    const native = nativeCreate({ sessionGetStatusAt: 3 })
    const result = await mfaV2TotpEnrollmentVerify({ state, code: "123456", now, client: native.client })

    expect(result.success).toBe(true)
    if (!result.success) return
    expect(result.data.state.stage).toBe("mfa")
    expect(result.data.state.sessionToken).toBe("checked-secret-token")
    expect(result.data.transition.kind).toBe("render")
  })

  test("routes to the next factor or fallback after post-check policy evaluation", async () => {
    const next = nativeCreate({
      postFactors: {
        user: { id: "user-secret-id", organizationId: "org-1" },
        password: { verifiedAt },
      },
      postMethods: [
        "AUTHENTICATION_METHOD_TYPE_PASSWORD",
        "AUTHENTICATION_METHOD_TYPE_TOTP",
        "AUTHENTICATION_METHOD_TYPE_U2F",
      ],
      postSecondFactors: ["SECOND_FACTOR_TYPE_OTP", "SECOND_FACTOR_TYPE_U2F"],
    })
    const nextResult = await mfaV2TotpEnrollmentVerify({ state, code: "123456", now, client: next.client })
    expect(nextResult.success).toBe(true)
    if (nextResult.success) expect(nextResult.data.transition.kind).toBe("render")

    const fallback = nativeCreate({
      postMethods: [
        "AUTHENTICATION_METHOD_TYPE_PASSWORD",
        "AUTHENTICATION_METHOD_TYPE_TOTP",
        "AUTHENTICATION_METHOD_TYPE_RECOVERY_CODE",
      ],
    })
    const fallbackResult = await mfaV2TotpEnrollmentVerify({ state, code: "123456", now, client: fallback.client })
    expect(fallbackResult.success).toBe(true)
    if (fallbackResult.success) {
      expect(fallbackResult.data.transition).toEqual({
        kind: "fallback",
        path: `/api/v2/flow/fallback?flow=${state.flowHandle}`,
      })
      expect(fallbackResult.data.state.sessionToken).toBe("post-policy-secret-token")
    }
  })

  test("recovers an already activated enrollment without replaying registration verification", async () => {
    const native = nativeCreate({
      firstMethods: ["AUTHENTICATION_METHOD_TYPE_PASSWORD", "AUTHENTICATION_METHOD_TYPE_TOTP"],
    })
    const result = await mfaV2TotpEnrollmentVerify({ state, code: "123456", now, client: native.client })

    expect(result.success).toBe(true)
    expect(native.calls.filter((call) => call.url.endsWith("/totp/verify"))).toHaveLength(0)
    expect(native.calls.filter((call) => call.method === "PATCH")).toHaveLength(1)
  })
})
