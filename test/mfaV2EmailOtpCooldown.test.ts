import { describe, expect, test } from "bun:test"

import type { WorkerBindingsInput } from "../src/config/workerBindingsSchema"
import { flowV2CookieOpen } from "../src/flow/domain/flowV2CookieOpen"
import { flowV2CookieSeal } from "../src/flow/domain/flowV2CookieSeal"
import type { FlowV2Cookie } from "../src/flow/model/flowV2CookieSchema"
import { workerAppCreate } from "../src/worker/workerAppCreate"
import { emailOtpCooldownNamespaceFakeCreate } from "./emailOtpCooldownNamespaceFakeCreate"

const origin = "https://login.example"
const identityOrigin = "https://identity.example"
const key = "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA"
const now = 1_800_000_000
const flowHandle = "AAAAAAAAAAAAAAAAAAAAAA"
const csrfToken = "B".repeat(43)
const cookieName = `__Host-zitadel-login-flow-${flowHandle}`

const authRequest = {
  id: "request-1",
  clientId: "client-1",
  redirectUri: "https://client.example/callback",
  scope: ["openid", "urn:zitadel:iam:org:id:org-1"],
  prompt: ["PROMPT_LOGIN"],
}

function nativeCreate(options: { challengeStatus?: number; enroll?: boolean } = {}) {
  const calls: Array<{ method: string; url: string }> = []
  let token = "secret-session-token"
  const fetch = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const url = String(input)
    const method = init?.method ?? "GET"
    calls.push({ method, url })
    if (url === `${identityOrigin}/v2/oidc/auth_requests/${authRequest.id}` && method === "GET") {
      return Response.json({ authRequest })
    }
    if (url === `${identityOrigin}/v2/sessions/session-1` && method === "PATCH") {
      if (options.challengeStatus) {
        return Response.json({ error: "challenge failed" }, { status: options.challengeStatus })
      }
      token = "rotated-secret-token"
      return Response.json({ sessionToken: token })
    }
    if (url.startsWith(`${identityOrigin}/v2/sessions/session-1?`) && method === "GET") {
      return Response.json({
        session: {
          id: "session-1",
          sessionToken: token,
          factors: {
            user: { id: "user-1", organizationId: "org-1" },
            password: { verifiedAt: "2026-08-11T12:00:00Z" },
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
          human: { email: { email: "person@example.com", isVerified: true } },
        },
      })
    }
    if (url === `${identityOrigin}/v2/users/user-1/authentication_methods` && method === "GET") {
      return Response.json({
        authMethodTypes: options.enroll
          ? ["AUTHENTICATION_METHOD_TYPE_PASSWORD"]
          : ["AUTHENTICATION_METHOD_TYPE_PASSWORD", "AUTHENTICATION_METHOD_TYPE_OTP_EMAIL"],
      })
    }
    if (url === `${identityOrigin}/v2/settings/login` && method === "GET") {
      return Response.json({
        settings: { forceMfa: true, secondFactors: ["SECOND_FACTOR_TYPE_OTP_EMAIL"] },
      })
    }
    if (url === `${identityOrigin}/v2/users/user-1/otp_email` && method === "POST") {
      return Response.json({ details: { resourceOwner: "org-1", sequence: "4" } })
    }
    throw new Error(`Unexpected native request: ${method} ${url}`)
  }
  return { fetch, calls }
}

function bindingsCreate(overrides: Partial<WorkerBindingsInput> = {}): WorkerBindingsInput {
  return {
    ZITADEL_ORIGIN: identityOrigin,
    ZITADEL_ORGANIZATION_ID: "org-1",
    ZITADEL_ALLOWED_CLIENT_IDS: "client-1",
    LOGIN_V2_FALLBACK_URL: `${identityOrigin}/ui/v2/login`,
    PAGES_ORIGIN: origin,
    SESSION_LIFETIME_SECONDS: "900",
    ZITADEL_LOGIN_CLIENT_PAT: "test-pat-not-a-real-secret-value",
    FLOW_COOKIE_KEY: key,
    RATE_LIMITER: { limit: async () => ({ success: true }) },
    EMAIL_OTP_COOLDOWN: emailOtpCooldownNamespaceFakeCreate(),
    ...overrides,
  }
}

async function cookieCreate(stage: "mfa" | "mfa_email_otp_code" = "mfa", extra: Partial<FlowV2Cookie> = {}) {
  const base = {
    version: 2 as const,
    flowHandle,
    requestKind: "oidc" as const,
    authRequestId: "request-1",
    clientId: "client-1",
    redirectUri: "https://client.example/callback",
    organizationId: "org-1",
    prompt: ["PROMPT_LOGIN"],
    csrfToken,
    issuedAt: now,
    expiresAt: now + 900,
    transitionCounter: 2,
    delegable: false,
    userId: "user-1",
    sessionId: "session-1",
    sessionToken: "secret-session-token",
    mfaMethods:
      stage === "mfa_email_otp_code"
        ? ["AUTHENTICATION_METHOD_TYPE_PASSWORD", "AUTHENTICATION_METHOD_TYPE_OTP_EMAIL"]
        : ["AUTHENTICATION_METHOD_TYPE_OTP_EMAIL"],
  }
  const state: FlowV2Cookie =
    stage === "mfa_email_otp_code"
      ? {
          ...base,
          stage: "mfa_email_otp_code",
          challengeIssuedAt: now,
          cooldownExpiresAt: now + 60,
          ...extra,
        }
      : { ...base, stage: "mfa", ...extra }
  const sealed = await flowV2CookieSeal(state, key, new Uint8Array(12).fill(8))
  if (!sealed.success) throw new Error("Expected sealed flow")
  return `${cookieName}=${sealed.data}`
}

function jsonHeaders(cookie: string): HeadersInit {
  return { origin, "content-type": "application/json", cookie }
}

describe("V2 MFA email OTP Durable Object cooldown", () => {
  test("admits only one concurrent initial challenge and returns the stored expiry on the loser", async () => {
    const native = nativeCreate()
    const bindings = bindingsCreate()
    const app = workerAppCreate({
      fetch: native.fetch,
      now: () => now,
      randomBytes: (length) => new Uint8Array(length).fill(21),
    })
    const cookie = await cookieCreate()
    const request = {
      method: "POST",
      headers: jsonHeaders(cookie),
      body: JSON.stringify({ csrfToken }),
    } as const
    const [first, second] = await Promise.all([
      app.request(`${origin}/api/v2/mfa/email-otp/challenge?flow=${flowHandle}`, request, bindings),
      app.request(`${origin}/api/v2/mfa/otp/challenge?flow=${flowHandle}`, request, bindings),
    ])
    const statuses = [first.status, second.status].sort()
    expect(statuses).toEqual([202, 429])
    const accepted = first.status === 202 ? first : second
    const rejected = first.status === 429 ? first : second
    expect(accepted.headers.get("x-cooldown-expires-at")).toBe(String(now + 60))
    expect(rejected.headers.get("retry-after")).toBe("60")
    expect(rejected.headers.get("x-cooldown-expires-at")).toBe(String(now + 60))
    expect(await rejected.json()).toEqual({
      success: false,
      op: "mfaOtpChallenge",
      errorMessage: "rate_limited",
      data: { cooldownExpiresAt: now + 60, cooldownRemainingSeconds: 60 },
    })
    expect(native.calls.filter((call) => call.method === "PATCH")).toHaveLength(1)
  })

  test("admits only one concurrent enrollment activation challenge through the Durable Object", async () => {
    const native = nativeCreate({ enroll: true })
    const bindings = bindingsCreate()
    const app = workerAppCreate({
      fetch: native.fetch,
      now: () => now,
      randomBytes: (length) => new Uint8Array(length).fill(22),
    })
    const cookie = await cookieCreate("mfa", {
      mfaMethods: ["AUTHENTICATION_METHOD_TYPE_PASSWORD"],
    })
    const request = {
      method: "POST",
      headers: jsonHeaders(cookie),
      body: JSON.stringify({ method: "email_otp", csrfToken }),
    } as const
    const [first, second] = await Promise.all([
      app.request(`${origin}/api/v2/mfa/email-otp/enroll?flow=${flowHandle}`, request, bindings),
      app.request(`${origin}/api/v2/mfa/email-otp/enroll?flow=${flowHandle}`, request, bindings),
    ])
    const statuses = [first.status, second.status].sort()
    expect(statuses).toEqual([201, 429])
    const rejected = first.status === 429 ? first : second
    expect(rejected.headers.get("retry-after")).toBe("60")
    expect(rejected.headers.get("x-cooldown-expires-at")).toBe(String(now + 60))
    expect(await rejected.json()).toEqual({
      success: false,
      op: "mfaEmailOtpEnrollment",
      errorMessage: "rate_limited",
      data: { cooldownExpiresAt: now + 60, cooldownRemainingSeconds: 60 },
    })
    expect(native.calls.filter((call) => call.method === "PATCH")).toHaveLength(1)
  })

  test("admits only one concurrent resend alias and returns the exact Durable Object expiry", async () => {
    const native = nativeCreate()
    let currentNow = now
    const bindings = bindingsCreate()
    const app = workerAppCreate({
      fetch: native.fetch,
      now: () => currentNow,
      randomBytes: (length) => new Uint8Array(length).fill(23),
    })
    const cookie = await cookieCreate()
    const challenged = await app.request(
      `${origin}/api/v2/mfa/email-otp/challenge?flow=${flowHandle}`,
      {
        method: "POST",
        headers: jsonHeaders(cookie),
        body: JSON.stringify({ csrfToken }),
      },
      bindings,
    )
    const challengedCookie = challenged.headers.get("set-cookie")?.match(new RegExp(`${cookieName}=([^;]+)`))?.[1]
    expect(challengedCookie).toBeTruthy()
    currentNow = now + 60
    const request = {
      method: "POST",
      headers: jsonHeaders(`${cookieName}=${challengedCookie}`),
      body: JSON.stringify({ csrfToken }),
    } as const
    const [first, second] = await Promise.all([
      app.request(`${origin}/api/v2/mfa/email-otp/resend?flow=${flowHandle}`, request, bindings),
      app.request(`${origin}/api/v2/mfa/otp/resend?flow=${flowHandle}`, request, bindings),
    ])
    const statuses = [first.status, second.status].sort()
    expect(statuses).toEqual([202, 429])
    const rejected = first.status === 429 ? first : second
    expect(rejected.headers.get("retry-after")).toBe("60")
    expect(rejected.headers.get("x-cooldown-expires-at")).toBe(String(now + 120))
    expect(await rejected.json()).toEqual({
      success: false,
      op: "mfaOtpResend",
      errorMessage: "rate_limited",
      data: { cooldownExpiresAt: now + 120, cooldownRemainingSeconds: 60 },
    })
    expect(native.calls.filter((call) => call.method === "PATCH")).toHaveLength(2)
  })

  test("reads authoritative Durable Object status after active-flow validation", async () => {
    const native = nativeCreate()
    const bindings = bindingsCreate({
      EMAIL_OTP_COOLDOWN: {
        getByName: () => ({
          reserve: async (reserveNow) => ({ accepted: true, expiresAt: reserveNow + 60 }),
          status: async () => ({ expiresAt: now + 12 }),
        }),
      },
    })
    const app = workerAppCreate({
      fetch: native.fetch,
      now: () => now,
      randomBytes: (length) => new Uint8Array(length).fill(24),
    })
    const cookie = await cookieCreate()
    const challenged = await app.request(
      `${origin}/api/v2/mfa/email-otp/challenge?flow=${flowHandle}`,
      {
        method: "POST",
        headers: jsonHeaders(cookie),
        body: JSON.stringify({ csrfToken }),
      },
      bindings,
    )
    const challengedCookie = challenged.headers.get("set-cookie")?.match(new RegExp(`${cookieName}=([^;]+)`))?.[1]
    expect(challengedCookie).toBeTruthy()
    const challengedState = await flowV2CookieOpen(challengedCookie!, flowHandle, [key], now)
    expect(
      challengedState.success && challengedState.data.stage === "mfa_email_otp_code"
        ? challengedState.data.cooldownExpiresAt
        : undefined,
    ).toBe(now + 60)
    const status = await app.request(
      `${origin}/api/v2/mfa/email-otp/cooldown?flow=${flowHandle}`,
      { headers: { cookie: `${cookieName}=${challengedCookie}` } },
      bindings,
    )
    expect(status.status).toBe(200)
    expect(await status.json()).toEqual({
      success: true,
      data: { cooldownExpiresAt: now + 12, cooldownRemainingSeconds: 12 },
    })
  })

  test("fails closed with 503 when the Durable Object is unavailable and never calls ZITADEL send", async () => {
    const native = nativeCreate()
    const bindings = bindingsCreate({ EMAIL_OTP_COOLDOWN: undefined })
    const app = workerAppCreate({
      fetch: native.fetch,
      now: () => now,
      randomBytes: (length) => new Uint8Array(length).fill(25),
    })
    const cookie = await cookieCreate()
    const challenged = await app.request(
      `${origin}/api/v2/mfa/email-otp/challenge?flow=${flowHandle}`,
      {
        method: "POST",
        headers: jsonHeaders(cookie),
        body: JSON.stringify({ csrfToken }),
      },
      bindings,
    )
    expect(challenged.status).toBe(503)
    expect(await challenged.json()).toEqual({
      success: false,
      op: "mfaOtpChallenge",
      errorMessage: "cooldown_unavailable",
    })
    expect(native.calls.some((call) => call.method === "PATCH")).toBe(false)
  })
})
