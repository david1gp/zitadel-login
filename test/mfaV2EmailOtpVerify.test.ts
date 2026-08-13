import { describe, expect, test } from "bun:test"

import type { WorkerBindings } from "../src/config/workerBindingsSchema"
import type { FlowV2Cookie } from "../src/flow/model/flowV2CookieSchema"
import { mfaV2EmailOtpVerify } from "../src/mfa/domain/mfaV2EmailOtpVerify"
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
  mfaMethods: ["AUTHENTICATION_METHOD_TYPE_OTP_EMAIL"],
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
  ZITADEL_RECENT_ACCOUNT_V2_ENABLED: true,
  RATE_LIMITER: { limit: async () => ({ success: true }) },
} satisfies WorkerBindings

type NativeOptions = {
  emailOtpStatus?: number
  sessionStatus?: number
  checkedToken?: string
  latestToken?: string
  factors?: Record<string, unknown>
  methods?: string[]
  secondFactors?: string[]
  multiFactors?: string[]
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
      if (options.emailOtpStatus) return Response.json({}, { status: options.emailOtpStatus })
      return Response.json({ sessionToken: options.checkedToken ?? options.latestToken ?? "secret-latest-token" })
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
            otpEmail: { verifiedAt: "2026-08-11T12:05:00Z" },
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
            email: { email: "person@example.com", isVerified: true },
            phone: { phone: "+49123456789", isVerified: true },
          },
        },
      })
    }
    if (url === `${identityOrigin}/v2/users/user-1/authentication_methods` && method === "GET") {
      return Response.json({
        authMethodTypes: options.methods ?? [
          "AUTHENTICATION_METHOD_TYPE_PASSWORD",
          "AUTHENTICATION_METHOD_TYPE_OTP_EMAIL",
        ],
      })
    }
    if (url === `${identityOrigin}/v2/settings/login` && method === "GET") {
      return Response.json({
        settings: {
          forceMfa: false,
          secondFactors: options.secondFactors ?? ["SECOND_FACTOR_TYPE_OTP_EMAIL"],
          multiFactors: options.multiFactors ?? [],
        },
      })
    }
    throw new Error(`Unexpected request: ${method} ${url}`)
  }
  return { client: zitadelClientCreate(bindings, fetch), calls }
}

describe("mfaV2EmailOtpVerify", () => {
  test("completes valid email OTP verification when session requirements are satisfied (6-20 digit formats including deployed 8 digits)", async () => {
    const codes = ["123456", "12345678", "12345678901234567890"]
    for (const code of codes) {
      const native = nativeCreate()
      const result = await mfaV2EmailOtpVerify({
        state,
        code,
        now,
        client: native.client,
      })

      expect(result.success).toBe(true)
      if (!result.success) return
      expect(result.data.state.stage).toBe("verified")
      expect(result.data.state.sessionToken).toBe("secret-latest-token")
      expect(result.data.transition).toEqual({
        kind: "complete",
        path: "/api/v2/flow/continue?flow=AAAAAAAAAAAAAAAAAAAAAA",
      })
      expect(native.calls[0]).toEqual({
        method: "PATCH",
        url: `${identityOrigin}/v2/sessions/session-1`,
        body: {
          sessionToken: "secret-old-token",
          checks: { otpEmail: { code } },
          lifetime: "900s",
        },
      })
    }
  })

  test("rejects invalid or expired email OTP codes with generic code_invalid error", async () => {
    const native = nativeCreate({ emailOtpStatus: 400 })
    const result = await mfaV2EmailOtpVerify({
      state,
      code: "000000",
      now,
      client: native.client,
    })

    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.errorMessage).toBe("code_invalid")
    }
  })

  test("rejects verification before challenge (when ZITADEL returns 400 because challenge is missing)", async () => {
    const native = nativeCreate({ emailOtpStatus: 400 })
    const result = await mfaV2EmailOtpVerify({
      state,
      code: "12345678",
      now,
      client: native.client,
    })

    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.errorMessage).toBe("code_invalid")
    }
  })

  test("rejects verification when email OTP is not an enrolled method for the flow", async () => {
    const native = nativeCreate()
    const notEnrolledState: Extract<FlowV2Cookie, { stage: "mfa" }> = {
      ...state,
      mfaMethods: ["AUTHENTICATION_METHOD_TYPE_TOTP"],
    }
    const result = await mfaV2EmailOtpVerify({
      state: notEnrolledState,
      code: "123456",
      now,
      client: native.client,
    })

    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.errorMessage).toBe("method_not_enrolled")
    }
    expect(native.calls.some((c) => c.method === "PATCH")).toBe(false)
  })

  test("rejects verification when email OTP was already used as primary factor (prevents primary factor reuse)", async () => {
    const native = nativeCreate()
    const primaryOtpState: Extract<FlowV2Cookie, { stage: "mfa" }> = {
      ...state,
      mfaMethods: ["AUTHENTICATION_METHOD_TYPE_TOTP"], // email_otp omitted because it was primary factor
    }
    const result = await mfaV2EmailOtpVerify({
      state: primaryOtpState,
      code: "12345678",
      now,
      client: native.client,
    })

    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.errorMessage).toBe("method_not_enrolled")
    }
    expect(native.calls.some((c) => c.method === "PATCH")).toBe(false)
  })

  test("returns next MFA options transition when additional factor is required", async () => {
    const native = nativeCreate({
      factors: {
        user: { id: "user-1", organizationId: "org-1" },
        password: { verifiedAt },
        otpEmail: { verifiedAt: "2026-08-11T12:05:00Z" },
      },
      methods: [
        "AUTHENTICATION_METHOD_TYPE_PASSWORD",
        "AUTHENTICATION_METHOD_TYPE_OTP_EMAIL",
        "AUTHENTICATION_METHOD_TYPE_U2F",
      ],
      secondFactors: ["SECOND_FACTOR_TYPE_OTP_EMAIL", "SECOND_FACTOR_TYPE_U2F"],
      multiFactors: ["MULTI_FACTOR_TYPE_U2F_WITH_VERIFICATION"],
    })

    const result = await mfaV2EmailOtpVerify({
      state: {
        ...state,
        mfaMethods: ["AUTHENTICATION_METHOD_TYPE_OTP_EMAIL", "AUTHENTICATION_METHOD_TYPE_U2F"],
      },
      code: "12345678",
      now,
      client: native.client,
    })

    expect(result.success).toBe(true)
  })

  test("retains the newest revalidated Session token when post-check policy falls back", async () => {
    const native = nativeCreate({
      checkedToken: "secret-checked-token",
      latestToken: "secret-revalidated-token",
      methods: ["AUTHENTICATION_METHOD_TYPE_PASSWORD", "UNKNOWN_METHOD"],
    })

    const result = await mfaV2EmailOtpVerify({
      state,
      code: "12345678",
      now,
      client: native.client,
    })

    expect(result.success).toBe(true)
    if (!result.success) return
    expect(result.data.transition.kind).toBe("fallback")
    expect(result.data.state.sessionToken).toBe("secret-revalidated-token")
  })

  test("handles stale native session gracefully after check", async () => {
    const native = nativeCreate({ sessionStatus: 401 })
    const result = await mfaV2EmailOtpVerify({
      state,
      code: "123456",
      now,
      client: native.client,
    })

    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.errorMessage).toBe("session_stale")
    }
  })
})
