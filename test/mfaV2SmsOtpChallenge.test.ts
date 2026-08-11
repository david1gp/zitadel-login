import { describe, expect, test } from "bun:test"

import type { WorkerBindings } from "../src/config/workerBindingsSchema"
import type { FlowV2Cookie } from "../src/flow/model/flowV2CookieSchema"
import { mfaV2SmsOtpChallenge } from "../src/mfa/domain/mfaV2SmsOtpChallenge"
import { mfaV2SmsOtpResend } from "../src/mfa/domain/mfaV2SmsOtpResend"
import { zitadelClientCreate } from "../src/zitadel/zitadelClientCreate"

const identityOrigin = "https://identity.example"
const verifiedAt = "2026-08-11T12:00:00Z"
const now = 1_800_000_000

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
  userId: "user-1",
  sessionId: "session-1",
  sessionToken: "secret-old-token",
  mfaMethods: ["AUTHENTICATION_METHOD_TYPE_OTP_SMS"],
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
  RECENT_ACCOUNT_COOKIE_KEY: "A".repeat(43),
  RECENT_ACCOUNT_COOKIE_PREVIOUS_KEY: undefined,
  ZITADEL_LOGIN_V2_ENABLED: true,
  ZITADEL_EMAIL_OTP_V2_ENABLED: true,
  ZITADEL_RECENT_ACCOUNT_V2_ENABLED: true,
  ZITADEL_PASSWORD_V2_ENABLED: true,
  ZITADEL_PASSKEY_V2_ENABLED: true,
  ZITADEL_IDP_V2_ENABLED: true,
  ZITADEL_MFA_V2_ENABLED: true,
  RATE_LIMITER: { limit: async () => ({ success: true }) },
} satisfies WorkerBindings

type NativeOptions = {
  challengeStatus?: number
  sessionStatus?: number
  latestToken?: string
  factors?: Record<string, unknown>
  methods?: string[]
  secondFactors?: string[]
  phoneVerified?: boolean
  hasPhone?: boolean
}

function nativeCreate(options: NativeOptions = {}) {
  const calls: Array<{ method: string; url: string; body?: unknown }> = []
  const fetch = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const url = String(input)
    const method = init?.method ?? "GET"
    let body: unknown
    if (init?.body) {
      try {
        body = JSON.parse(String(init.body))
      } catch {
        body = String(init.body)
      }
    }
    calls.push({ method, url, body })

    if (url === `${identityOrigin}/v2/sessions/session-1` && method === "PATCH") {
      if (options.challengeStatus)
        return Response.json({ error: "challenge failed" }, { status: options.challengeStatus })
      return Response.json({ sessionToken: options.latestToken ?? "secret-latest-sms-challenge-token" })
    }
    if (url.startsWith(`${identityOrigin}/v2/sessions/session-1?`) && method === "GET") {
      if (options.sessionStatus) return Response.json({}, { status: options.sessionStatus })
      return Response.json({
        session: {
          id: "session-1",
          sessionToken: options.latestToken ?? "secret-latest-token",
          factors: options.factors ?? {
            user: { id: "user-1", organizationId: "org-1" },
            password: { verifiedAt },
          },
        },
      })
    }
    if (url === `${identityOrigin}/v2/users/user-1` && method === "GET") {
      return Response.json({
        user: {
          userId: "user-1",
          state: "USER_STATE_ACTIVE",
          details: { resourceOwner: "org-1" },
          human: {
            phone:
              options.hasPhone === false
                ? undefined
                : { phone: "+15551234567", isVerified: options.phoneVerified ?? true },
          },
        },
      })
    }
    if (url === `${identityOrigin}/v2/users/user-1/authentication_methods` && method === "GET") {
      return Response.json({
        authMethodTypes: options.methods ?? [
          "AUTHENTICATION_METHOD_TYPE_PASSWORD",
          "AUTHENTICATION_METHOD_TYPE_OTP_SMS",
        ],
      })
    }
    if (url === `${identityOrigin}/v2/settings/login` && method === "GET") {
      return Response.json({
        settings: {
          forceMfa: true,
          secondFactors: options.secondFactors ?? ["SECOND_FACTOR_TYPE_OTP_SMS"],
        },
      })
    }
    throw new Error(`Unexpected request: ${method} ${url}`)
  }
  return { client: zitadelClientCreate(bindings, fetch), calls }
}

describe("mfaV2SmsOtpChallenge", () => {
  test("send: delivers MFA SMS OTP challenge when method is enrolled and phone is verified", async () => {
    const native = nativeCreate()
    const result = await mfaV2SmsOtpChallenge({
      state,
      now,
      client: native.client,
    })

    expect(result.success).toBe(true)
    if (!result.success) return
    expect(result.data.state.sessionToken).toBe("secret-latest-sms-challenge-token")
    expect(result.data.state.transitionCounter).toBe(3)
    expect(result.data.transition).toEqual({
      kind: "render",
      route: `/login/mfa?flow=${state.flowHandle}`,
      screen: { name: "mfa", factors: state.mfaMethods },
      csrfToken: state.csrfToken,
    })
    expect(
      native.calls.some(
        (c) =>
          c.method === "PATCH" &&
          c.url === `${identityOrigin}/v2/sessions/session-1` &&
          typeof c.body === "object" &&
          c.body !== null &&
          "challenges" in c.body &&
          typeof c.body.challenges === "object" &&
          c.body.challenges !== null &&
          "otpSms" in c.body.challenges,
      ),
    ).toBe(true)
  })

  test("resend / token rotation: mfaV2SmsOtpResend delegates to challenge and rotates sessionToken", async () => {
    const native = nativeCreate({ latestToken: "secret-resend-sms-token" })
    const result = await mfaV2SmsOtpResend({
      state,
      now,
      client: native.client,
    })

    expect(result.success).toBe(true)
    if (!result.success) return
    expect(result.data.state.sessionToken).toBe("secret-resend-sms-token")
    expect(result.data.state.transitionCounter).toBe(3)
  })

  test("missing/unverified phone: rejects challenge when phone is missing or unverified", async () => {
    const nativeUnverified = nativeCreate({ phoneVerified: false })
    const resultUnverified = await mfaV2SmsOtpChallenge({
      state,
      now,
      client: nativeUnverified.client,
    })
    expect(resultUnverified.success).toBe(false)
    if (!resultUnverified.success) {
      expect(resultUnverified.errorMessage).toBe("method_not_enrolled")
    }

    const nativeMissing = nativeCreate({ hasPhone: false })
    const resultMissing = await mfaV2SmsOtpChallenge({
      state,
      now,
      client: nativeMissing.client,
    })
    expect(resultMissing.success).toBe(false)
    if (!resultMissing.success) {
      expect(resultMissing.errorMessage).toBe("method_not_enrolled")
    }
  })

  test("not enrolled: rejects challenge when SMS OTP is not enrolled for the user", async () => {
    const native = nativeCreate({
      methods: ["AUTHENTICATION_METHOD_TYPE_PASSWORD", "AUTHENTICATION_METHOD_TYPE_TOTP"],
      secondFactors: ["SECOND_FACTOR_TYPE_OTP"],
    })
    const result = await mfaV2SmsOtpChallenge({
      state,
      now,
      client: native.client,
    })

    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.errorMessage).toBe("method_not_enrolled")
    }
  })

  test("already-used factor: rejects challenge when SMS OTP is already satisfied in session factors", async () => {
    const native = nativeCreate({
      factors: {
        user: { id: "user-1", organizationId: "org-1" },
        password: { verifiedAt },
        otpSms: { verifiedAt },
      },
    })
    const result = await mfaV2SmsOtpChallenge({
      state,
      now,
      client: native.client,
    })

    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.errorMessage).toBe("method_not_enrolled")
    }
  })

  test("rejects challenge when explicit method argument is not SMS OTP", async () => {
    const native = nativeCreate()
    const result = await mfaV2SmsOtpChallenge({
      state,
      method: "totp",
      now,
      client: native.client,
    })

    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.errorMessage).toBe("method_not_enrolled")
    }
  })

  test("upstream failure: handles upstream challenge failure safely", async () => {
    const native = nativeCreate({ challengeStatus: 500 })
    const result = await mfaV2SmsOtpChallenge({
      state,
      now,
      client: native.client,
    })

    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.errorMessage).toBe("challenge_unavailable")
    }
  })

  test("handles stale native session safely", async () => {
    const native = nativeCreate({ sessionStatus: 401 })
    const result = await mfaV2SmsOtpChallenge({
      state,
      now,
      client: native.client,
    })

    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.errorMessage).toBe("session_stale")
    }
  })
})
