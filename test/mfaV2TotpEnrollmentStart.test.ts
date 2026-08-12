import { describe, expect, test } from "bun:test"

import type { WorkerBindings } from "../src/config/workerBindingsSchema"
import type { FlowV2Cookie } from "../src/flow/model/flowV2CookieSchema"
import { mfaV2TotpEnrollmentStart } from "../src/mfa/domain/mfaV2TotpEnrollmentStart"
import { zitadelClientCreate } from "../src/zitadel/zitadelClientCreate"

const identityOrigin = "https://identity.example"
const now = 1_800_000_000
const verifiedAt = "2027-01-15T08:00:00Z"
const state: Extract<FlowV2Cookie, { stage: "mfa" }> = {
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
  transitionCounter: 2,
  stage: "mfa",
  delegable: false,
  userId: "user-secret-id",
  sessionId: "session-secret-id",
  sessionToken: "old-secret-session-token",
  mfaMethods: [],
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
  forceMfa?: boolean
  methods?: string[]
  factors?: Record<string, unknown>
  createStatus?: number
}

function nativeCreate(options: NativeOptions = {}) {
  const calls: Array<{ method: string; url: string }> = []
  const fetch = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const url = String(input)
    const method = init?.method ?? "GET"
    calls.push({ method, url })
    if (url.startsWith(`${identityOrigin}/v2/sessions/session-secret-id?`) && method === "GET") {
      return Response.json({
        session: {
          id: "session-secret-id",
          sessionToken: "latest-secret-session-token",
          expirationDate: "2027-01-15T08:15:00Z",
          factors: {
            user: { id: "user-secret-id", organizationId: "org-1" },
            ...(options.factors ?? { password: { verifiedAt } }),
          },
        },
      })
    }
    if (url === `${identityOrigin}/v2/users/user-secret-id` && method === "GET") {
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
      return Response.json({ authMethodTypes: options.methods ?? ["AUTHENTICATION_METHOD_TYPE_PASSWORD"] })
    }
    if (url === `${identityOrigin}/v2/settings/login` && method === "GET") {
      return Response.json({
        settings: {
          forceMfa: options.forceMfa ?? true,
          secondFactors: ["SECOND_FACTOR_TYPE_OTP"],
          multiFactors: [],
        },
      })
    }
    if (url === `${identityOrigin}/v2/users/user-secret-id/totp` && method === "POST") {
      if (options.createStatus)
        return Response.json({ nativeSecret: "must-not-leak" }, { status: options.createStatus })
      return Response.json({
        uri: "otpauth://totp/ZITADEL:secret-person@example.com?secret=ABC234",
        secret: "ABC234",
      })
    }
    throw new Error(`Unexpected request: ${method} ${url}`)
  }
  return { client: zitadelClientCreate(bindings, fetch), calls }
}

describe("mfaV2TotpEnrollmentStart", () => {
  test("authorizes a current forced TOTP enrollment and binds pending setup to the next flow transition", async () => {
    const native = nativeCreate()
    const result = await mfaV2TotpEnrollmentStart({ state, now, client: native.client })

    expect(result.success).toBe(true)
    if (!result.success) return
    expect(result.data.provisioningUri).toBe("otpauth://totp/ZITADEL:secret-person@example.com?secret=ABC234")
    expect(result.data.secret).toBe("ABC234")
    expect(result.data.transition).toEqual({
      kind: "render",
      route: `/login/mfa?flow=${state.flowHandle}`,
      screen: { name: "mfa_totp_setup" },
      csrfToken: state.csrfToken,
    })
    expect(result.data.state.stage).toBe("mfa_totp_setup")
    expect(result.data.state.transitionCounter).toBe(3)
    expect(result.data.state.sessionToken).toBe("latest-secret-session-token")
    expect(JSON.stringify(result.data.state)).not.toContain("ABC234")
    expect(native.calls.filter((call) => call.url.endsWith("/totp"))).toHaveLength(1)
  })

  test("rejects an untrusted primary authorization before policy lookup or mutation", async () => {
    const native = nativeCreate({ factors: { otpEmail: { verifiedAt } } })
    const result = await mfaV2TotpEnrollmentStart({ state, now, client: native.client })

    expect(result.success).toBe(false)
    if (!result.success) expect(result.errorMessage).toBe("mfa_setup_forbidden")
    expect(native.calls.some((call) => call.url.endsWith("/authentication_methods"))).toBe(false)
    expect(native.calls.some((call) => call.url.endsWith("/totp"))).toBe(false)
  })

  test("rejects an expired transition before native access", async () => {
    const native = nativeCreate()
    const result = await mfaV2TotpEnrollmentStart({
      state: { ...state, expiresAt: now },
      now,
      client: native.client,
    })

    expect(result.success).toBe(false)
    if (!result.success) expect(result.errorMessage).toBe("flow_expired")
    expect(native.calls).toHaveLength(0)
  })

  test("rejects policy changes that no longer produce a forced enroll transition", async () => {
    const native = nativeCreate({ forceMfa: false })
    const result = await mfaV2TotpEnrollmentStart({ state, now, client: native.client })

    expect(result.success).toBe(false)
    if (!result.success) expect(result.errorMessage).toBe("mfa_enrollment_not_allowed")
    expect(native.calls.some((call) => call.url.endsWith("/totp"))).toBe(false)
  })

  test("rejects currently enrolled TOTP before native mutation", async () => {
    const native = nativeCreate({
      methods: ["AUTHENTICATION_METHOD_TYPE_PASSWORD", "AUTHENTICATION_METHOD_TYPE_TOTP"],
    })
    const result = await mfaV2TotpEnrollmentStart({ state, now, client: native.client })

    expect(result.success).toBe(false)
    if (!result.success) expect(result.errorMessage).toBe("method_already_enrolled")
    expect(native.calls.filter((call) => call.url.endsWith("/totp"))).toHaveLength(0)
  })

  test("bounds native enrollment failure without returning native data", async () => {
    const native = nativeCreate({ createStatus: 502 })
    const result = await mfaV2TotpEnrollmentStart({ state, now, client: native.client })

    expect(result).toEqual({
      success: false,
      op: "mfaV2TotpEnrollmentStart",
      errorMessage: "enrollment_unavailable",
      rawData: { status: 502 },
    })
    expect(JSON.stringify(result)).not.toContain("must-not-leak")
  })
})
