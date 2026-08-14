import { describe, expect, test } from "bun:test"

import type { WorkerBindings } from "../src/config/workerBindingsSchema"
import { emailOtpCooldownClientCreate } from "../src/email-otp/cooldown/emailOtpCooldownClientCreate"
import type { FlowV2Cookie } from "../src/flow/model/flowV2CookieSchema"
import { mfaV2EmailOtpChallenge } from "../src/mfa/domain/mfaV2EmailOtpChallenge"
import { mfaV2EmailOtpResend } from "../src/mfa/domain/mfaV2EmailOtpResend"
import { zitadelClientCreate } from "../src/zitadel/zitadelClientCreate"
import { emailOtpCooldownNamespaceFakeCreate } from "./emailOtpCooldownNamespaceFakeCreate"

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
  challengeStatus?: number
  sessionStatus?: number
  latestToken?: string
  factors?: Record<string, unknown>
  methods?: string[]
  secondFactors?: string[]
  emailVerified?: boolean
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
      return Response.json({ sessionToken: options.latestToken ?? "secret-latest-challenge-token" })
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
            email: { email: "person@example.com", isVerified: options.emailVerified ?? true },
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
          forceMfa: true,
          secondFactors: options.secondFactors ?? ["SECOND_FACTOR_TYPE_OTP_EMAIL"],
        },
      })
    }
    throw new Error(`Unexpected request: ${method} ${url}`)
  }
  return { client: zitadelClientCreate(bindings, fetch), calls }
}

function cooldownCreate(namespace = emailOtpCooldownNamespaceFakeCreate()) {
  return emailOtpCooldownClientCreate({
    namespace,
    cookieKey: bindings.FLOW_COOKIE_KEY,
    purpose: "mfa-email-otp",
    identifier: state.authRequestId,
  })
}

describe("mfaV2EmailOtpChallenge", () => {
  test("delivers MFA email OTP challenge when method is enrolled and allowed", async () => {
    const native = nativeCreate()
    const result = await mfaV2EmailOtpChallenge({
      state,
      now,
      client: native.client,
      cooldown: cooldownCreate(),
    })

    expect(result.success).toBe(true)
    if (!result.success) return
    expect(result.data.state.sessionToken).toBe("secret-latest-challenge-token")
    expect(result.data.state.transitionCounter).toBe(3)
    expect(result.data.transition).toEqual({
      kind: "render",
      route: `/login/mfa?flow=${state.flowHandle}`,
      screen: { name: "mfa_email_otp_code", challengeIssued: true },
      csrfToken: state.csrfToken,
    })
    expect(native.calls.some((c) => c.method === "PATCH" && c.url === `${identityOrigin}/v2/sessions/session-1`)).toBe(
      true,
    )
  })

  test("mfaV2EmailOtpResend delegates to challenge and rotates sessionToken", async () => {
    const native = nativeCreate({ latestToken: "secret-resend-token" })
    const result = await mfaV2EmailOtpResend({
      state,
      now,
      client: native.client,
      cooldown: cooldownCreate(),
    })

    expect(result.success).toBe(true)
    if (!result.success) return
    expect(result.data.state.sessionToken).toBe("secret-resend-token")
    expect(result.data.state.transitionCounter).toBe(3)
    expect(result.data.state.cooldownExpiresAt).toBe(now + 60)
  })

  test("reserves before the ZITADEL challenge and rejects a second concurrent send without calling ZITADEL", async () => {
    const native = nativeCreate()
    const cooldown = cooldownCreate()
    const first = await mfaV2EmailOtpChallenge({ state, now, client: native.client, cooldown })
    expect(first.success).toBe(true)
    if (!first.success) return
    expect(first.data.state.cooldownExpiresAt).toBe(now + 60)
    const second = await mfaV2EmailOtpChallenge({ state, now, client: native.client, cooldown })
    expect(second.success).toBe(false)
    if (second.success) return
    expect(second.errorMessage).toBe("rate_limited")
    expect(second.rawData).toEqual({ expiresAt: now + 60 })
    expect(native.calls.filter((call) => call.method === "PATCH")).toHaveLength(1)
  })

  test("fails closed when the Durable Object is unavailable and never challenges ZITADEL", async () => {
    const native = nativeCreate()
    const result = await mfaV2EmailOtpChallenge({
      state,
      now,
      client: native.client,
      cooldown: emailOtpCooldownClientCreate({
        namespace: undefined,
        cookieKey: bindings.FLOW_COOKIE_KEY,
        purpose: "mfa-email-otp",
        identifier: state.authRequestId,
      }),
    })
    expect(result.success).toBe(false)
    if (result.success) return
    expect(result.errorMessage).toBe("cooldown_unavailable")
    expect(native.calls.some((call) => call.method === "PATCH")).toBe(false)
  })

  test("rejects challenge when email OTP is not enrolled for the user", async () => {
    const native = nativeCreate({
      methods: ["AUTHENTICATION_METHOD_TYPE_PASSWORD", "AUTHENTICATION_METHOD_TYPE_TOTP"],
      secondFactors: ["SECOND_FACTOR_TYPE_OTP"],
    })
    const result = await mfaV2EmailOtpChallenge({
      state,
      now,
      client: native.client,
      cooldown: cooldownCreate(),
    })

    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.errorMessage).toBe("method_not_enrolled")
    }
  })

  test("rejects challenge when email OTP already satisfied the primary factor", async () => {
    const native = nativeCreate({
      factors: {
        user: { id: "user-1", organizationId: "org-1" },
        otpEmail: { verifiedAt },
      },
    })
    const result = await mfaV2EmailOtpChallenge({
      state,
      now,
      client: native.client,
      cooldown: cooldownCreate(),
    })

    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.errorMessage).toBe("method_not_enrolled")
    }
  })

  test("rejects challenge when explicit method argument is not email OTP", async () => {
    const native = nativeCreate()
    const result = await mfaV2EmailOtpChallenge({
      state,
      method: "totp",
      now,
      client: native.client,
      cooldown: cooldownCreate(),
    })

    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.errorMessage).toBe("method_not_enrolled")
    }
  })

  test("handles upstream challenge failure safely", async () => {
    const native = nativeCreate({ challengeStatus: 500 })
    const result = await mfaV2EmailOtpChallenge({
      state,
      now,
      client: native.client,
      cooldown: cooldownCreate(),
    })

    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.errorMessage).toBe("challenge_unavailable")
    }
  })

  test("handles stale native session safely", async () => {
    const native = nativeCreate({ sessionStatus: 401 })
    const result = await mfaV2EmailOtpChallenge({
      state,
      now,
      client: native.client,
      cooldown: cooldownCreate(),
    })

    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.errorMessage).toBe("session_stale")
    }
  })
})
