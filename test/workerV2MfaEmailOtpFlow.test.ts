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

const authRequest = {
  id: "request-1",
  clientId: "client-1",
  redirectUri: "https://client.example/callback",
  scope: ["openid", "urn:zitadel:iam:org:id:org-1"],
  prompt: ["PROMPT_LOGIN"],
}

type NativeOptions = {
  challengeStatus?: number
  sessionStatus?: number
  latestToken?: string
  methods?: string[]
  secondFactors?: string[]
  factors?: Record<string, unknown>
  emailVerified?: boolean
}

function nativeCreate(options: NativeOptions = {}) {
  const calls: Array<{ method: string; url: string; body?: unknown }> = []
  const fetch = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const url = String(input)
    const method = init?.method ?? "GET"
    const body = init?.body ? JSON.parse(String(init.body)) : undefined
    calls.push({ method, url, ...(body === undefined ? {} : { body }) })

    if (url === `${identityOrigin}/v2/oidc/auth_requests/${authRequest.id}` && method === "GET") {
      return Response.json({ authRequest })
    }
    if (url === `${identityOrigin}/v2/sessions/session-1` && method === "PATCH") {
      if (options.challengeStatus) {
        return Response.json({ error: "challenge failed" }, { status: options.challengeStatus })
      }
      return Response.json({ sessionToken: options.latestToken ?? "updated-secret-mfa-token" })
    }
    if (url.startsWith(`${identityOrigin}/v2/sessions/session-1?`) && method === "GET") {
      if (options.sessionStatus) return Response.json({}, { status: options.sessionStatus })
      return Response.json({
        session: {
          id: "session-1",
          sessionToken: options.latestToken ?? "updated-secret-mfa-token",
          factors: options.factors ?? {
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
          human: { email: { email: "secret-user@example.com", isVerified: options.emailVerified ?? true } },
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
  return { fetch, calls }
}

function dependenciesCreate(
  fetch: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>,
  nowFn: () => number = () => now,
) {
  return {
    fetch,
    now: nowFn,
    randomBytes: (length: number) => new Uint8Array(length).fill(7),
    logger: { warn: () => {}, error: () => {} },
  }
}

async function flowCookieCreate(customState?: Partial<FlowV2Cookie>) {
  const baseState = {
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
  }

  const cookieState: FlowV2Cookie =
    customState?.stage === "verified"
      ? {
          ...baseState,
          stage: "verified",
          delegable: false,
          userId: "user-1",
          sessionId: "session-1",
          sessionToken: "secret-session-token",
          ...customState,
        }
      : customState?.stage === "ready"
        ? {
            ...baseState,
            stage: "ready",
            delegable: true,
            owned: true,
            ...customState,
          }
        : {
            ...baseState,
            stage: "mfa",
            delegable: false,
            userId: "user-1",
            sessionId: "session-1",
            sessionToken: "secret-session-token",
            mfaMethods: ["AUTHENTICATION_METHOD_TYPE_OTP_EMAIL"],
            ...customState,
          }

  const sealed = await flowV2CookieSeal(cookieState, key, new Uint8Array(12))
  if (!sealed.success) throw new Error("Failed to seal cookie")
  return `__Host-zitadel-login-flow-${flowHandle}=${sealed.data}`
}

describe("Worker MFA Email OTP Challenge & Resend Flow", () => {
  test("initial send: delivers MFA email OTP challenge and updates encrypted flow cookie", async () => {
    const native = nativeCreate()
    const app = workerAppCreate(dependenciesCreate(native.fetch))
    const cookie = await flowCookieCreate()

    const response = await app.request(
      `${origin}/api/v2/mfa/otp/challenge?flow=${flowHandle}`,
      {
        method: "POST",
        headers: {
          origin,
          "content-type": "application/json",
          cookie,
        },
        body: JSON.stringify({ csrfToken }),
      },
      bindingsCreate(),
    )

    expect(response.status).toBe(202)
    const body = (await response.json()) as { success: boolean; data: { kind: string; route: string; screen: unknown } }
    expect(body.success).toBe(true)
    expect(body.data.kind).toBe("render")
    expect(body.data.route).toBe(`/login/mfa?flow=${flowHandle}`)
    expect(body.data.screen).toEqual({ name: "mfa_email_otp_code", challengeIssued: true })

    const setCookie = response.headers.get("set-cookie")
    expect(setCookie).toBeTruthy()
    const match = setCookie?.match(/__Host-zitadel-login-flow-AAAAAAAAAAAAAAAAAAAAAA=([^;]+)/)
    expect(match).toBeTruthy()
    const opened = await flowV2CookieOpen(match![1]!, flowHandle, [key], now)
    expect(opened.success).toBe(true)
    if (opened.success && opened.data.stage === "mfa") {
      expect(opened.data.sessionToken).toBe("updated-secret-mfa-token")
      expect(opened.data.transitionCounter).toBe(3)
    }
    expect(
      opened.success && opened.data.stage === "mfa_email_otp_code" ? opened.data.cooldownExpiresAt : undefined,
    ).toBe(now + 60)
  })

  test("resend / token rotation: resends MFA email OTP and rotates sessionToken", async () => {
    let currentNow = now
    const native = nativeCreate({ latestToken: "rotated-mfa-token" })
    const app = workerAppCreate(dependenciesCreate(native.fetch, () => currentNow))
    const cookie = await flowCookieCreate()
    const flowBindings = bindingsCreate()

    const challenged = await app.request(
      `${origin}/api/v2/mfa/email-otp/challenge?flow=${flowHandle}`,
      {
        method: "POST",
        headers: { origin, "content-type": "application/json", cookie },
        body: JSON.stringify({ csrfToken }),
      },
      flowBindings,
    )
    const challengeCookie = challenged.headers
      .get("set-cookie")
      ?.match(/__Host-zitadel-login-flow-AAAAAAAAAAAAAAAAAAAAAA=([^;]+)/)?.[1]
    expect(challengeCookie).toBeTruthy()
    const challengedState = await flowV2CookieOpen(challengeCookie!, flowHandle, [key], now)
    expect(
      challengedState.success && challengedState.data.stage === "mfa_email_otp_code"
        ? challengedState.data.cooldownExpiresAt
        : undefined,
    ).toBe(now + 60)

    const cooldownStatus = await app.request(
      `${origin}/api/v2/mfa/email-otp/cooldown?flow=${flowHandle}`,
      {
        headers: {
          cookie: `__Host-zitadel-login-flow-${flowHandle}=${challengeCookie}`,
        },
      },
      flowBindings,
    )
    expect(cooldownStatus.status).toBe(200)
    expect(await cooldownStatus.json()).toEqual({
      success: true,
      data: { cooldownExpiresAt: now + 60, cooldownRemainingSeconds: 60 },
    })

    currentNow = now + 42
    const blocked = await app.request(
      `${origin}/api/v2/mfa/email-otp/resend?flow=${flowHandle}`,
      {
        method: "POST",
        headers: {
          origin,
          "content-type": "application/json",
          cookie: `__Host-zitadel-login-flow-${flowHandle}=${challengeCookie}`,
        },
        body: JSON.stringify({ csrfToken }),
      },
      flowBindings,
    )
    expect(blocked.status).toBe(429)
    expect(blocked.headers.get("retry-after")).toBe("18")
    expect(blocked.headers.get("x-cooldown-expires-at")).toBe(String(now + 60))
    expect(blocked.headers.get("x-cooldown-remaining-seconds")).toBe("18")
    expect(blocked.headers.get("set-cookie")).toBeNull()
    expect(await blocked.json()).toEqual({
      success: false,
      op: "mfaOtpResend",
      errorMessage: "rate_limited",
      data: { cooldownExpiresAt: now + 60, cooldownRemainingSeconds: 18 },
    })
    expect(native.calls.filter((call) => call.method === "PATCH")).toHaveLength(1)

    currentNow = now + 60
    const response = await app.request(
      `${origin}/api/v2/mfa/email-otp/resend?flow=${flowHandle}`,
      {
        method: "POST",
        headers: {
          origin,
          "content-type": "application/json",
          cookie: `__Host-zitadel-login-flow-${flowHandle}=${challengeCookie}`,
        },
        body: JSON.stringify({ csrfToken }),
      },
      flowBindings,
    )

    expect(response.status).toBe(202)
    const body = (await response.json()) as { success: boolean; data: { kind: string } }
    expect(body.success).toBe(true)
    expect(response.headers.get("x-cooldown-expires-at")).toBe(String(currentNow + 60))
    expect(response.headers.get("x-cooldown-remaining-seconds")).toBe("60")

    const setCookie = response.headers.get("set-cookie")
    const match = setCookie?.match(/__Host-zitadel-login-flow-AAAAAAAAAAAAAAAAAAAAAA=([^;]+)/)
    const opened = await flowV2CookieOpen(match![1]!, flowHandle, [key], now)
    expect(opened.success).toBe(true)
    if (opened.success && opened.data.stage === "mfa_email_otp_code") {
      expect(opened.data.sessionToken).toBe("rotated-mfa-token")
      expect(opened.data.cooldownExpiresAt).toBe(currentNow + 60)
    }

    const limited = await app.request(
      `${origin}/api/v2/mfa/email-otp/resend?flow=${flowHandle}`,
      {
        method: "POST",
        headers: {
          origin,
          "content-type": "application/json",
          cookie: `__Host-zitadel-login-flow-${flowHandle}=${match![1]}`,
        },
        body: JSON.stringify({ csrfToken }),
      },
      flowBindings,
    )
    expect(limited.status).toBe(429)
    expect(limited.headers.get("retry-after")).toBe("60")
    expect(limited.headers.get("x-cooldown-expires-at")).toBe(String(currentNow + 60))
    expect(limited.headers.get("x-cooldown-remaining-seconds")).toBe("60")
    expect(limited.headers.get("set-cookie")).toBeNull()
    expect(await limited.json()).toEqual({
      success: false,
      op: "mfaOtpResend",
      errorMessage: "rate_limited",
      data: { cooldownExpiresAt: currentNow + 60, cooldownRemainingSeconds: 60 },
    })
    expect(native.calls.filter((call) => call.method === "PATCH")).toHaveLength(2)
  })

  test("rejects MFA email OTP cooldown queries for the wrong origin or inactive flow", async () => {
    const native = nativeCreate()
    const app = workerAppCreate(dependenciesCreate(native.fetch))
    const cookie = await flowCookieCreate()
    const flowBindings = bindingsCreate()
    const challenged = await app.request(
      `${origin}/api/v2/mfa/email-otp/challenge?flow=${flowHandle}`,
      {
        method: "POST",
        headers: { origin, "content-type": "application/json", cookie },
        body: JSON.stringify({ csrfToken }),
      },
      flowBindings,
    )
    const challengeCookie = challenged.headers
      .get("set-cookie")
      ?.match(/__Host-zitadel-login-flow-AAAAAAAAAAAAAAAAAAAAAA=([^;]+)/)?.[1]
    expect(challengeCookie).toBeTruthy()

    const wrongOrigin = await app.request(
      `https://evil.example/api/v2/mfa/email-otp/cooldown?flow=${flowHandle}`,
      {
        headers: {
          cookie: `__Host-zitadel-login-flow-${flowHandle}=${challengeCookie}`,
        },
      },
      flowBindings,
    )
    expect(wrongOrigin.status).toBe(403)
    expect(await wrongOrigin.json()).toEqual({
      success: false,
      op: "mfaEmailOtpCooldown",
      errorMessage: "origin_rejected",
    })

    const inactive = await app.request(
      `${origin}/api/v2/mfa/email-otp/cooldown?flow=${flowHandle}`,
      { headers: { cookie } },
      flowBindings,
    )
    expect(inactive.status).toBe(409)
    expect(await inactive.json()).toEqual({
      success: false,
      op: "mfaEmailOtpCooldown",
      errorMessage: "flow_stage_invalid",
    })
  })

  test("not enrolled: returns 403 method_not_enrolled when email OTP is not in user authentication methods", async () => {
    const native = nativeCreate({
      methods: ["AUTHENTICATION_METHOD_TYPE_PASSWORD", "AUTHENTICATION_METHOD_TYPE_TOTP"],
      secondFactors: ["SECOND_FACTOR_TYPE_OTP"],
    })
    const app = workerAppCreate(dependenciesCreate(native.fetch))
    const cookie = await flowCookieCreate()

    const response = await app.request(
      `${origin}/api/v2/mfa/email-otp/challenge?flow=${flowHandle}`,
      {
        method: "POST",
        headers: {
          origin,
          "content-type": "application/json",
          cookie,
        },
        body: JSON.stringify({ csrfToken }),
      },
      bindingsCreate(),
    )

    expect(response.status).toBe(403)
    const body = (await response.json()) as { success: boolean; errorMessage: string }
    expect(body.success).toBe(false)
    expect(body.errorMessage).toBe("method_not_enrolled")
  })

  test("already-used factor: returns 403 method_not_enrolled when email OTP was primary factor", async () => {
    const native = nativeCreate({
      factors: {
        user: { id: "user-1", organizationId: "org-1" },
        otpEmail: { verifiedAt: "2026-08-11T12:00:00Z" },
      },
    })
    const app = workerAppCreate(dependenciesCreate(native.fetch))
    const cookie = await flowCookieCreate()

    const response = await app.request(
      `${origin}/api/v2/mfa/otp/challenge?flow=${flowHandle}`,
      {
        method: "POST",
        headers: {
          origin,
          "content-type": "application/json",
          cookie,
        },
        body: JSON.stringify({ csrfToken }),
      },
      bindingsCreate(),
    )

    expect(response.status).toBe(403)
    const body = (await response.json()) as { success: boolean; errorMessage: string }
    expect(body.success).toBe(false)
    expect(body.errorMessage).toBe("method_not_enrolled")
  })

  test("wrong stage: returns 409 flow_stage_invalid or flow_replayed", async () => {
    const native = nativeCreate()
    const app = workerAppCreate(dependenciesCreate(native.fetch))
    const readyCookie = await flowCookieCreate({ stage: "ready", delegable: true, owned: true })

    const flowBindings = bindingsCreate()
    const responseReady = await app.request(
      `${origin}/api/v2/mfa/otp/challenge?flow=${flowHandle}`,
      {
        method: "POST",
        headers: {
          origin,
          "content-type": "application/json",
          cookie: readyCookie,
        },
        body: JSON.stringify({ csrfToken }),
      },
      flowBindings,
    )

    expect(responseReady.status).toBe(409)
    const bodyReady = (await responseReady.json()) as { errorMessage: string }
    expect(bodyReady.errorMessage).toBe("flow_stage_invalid")

    const verifiedCookie = await flowCookieCreate({
      stage: "verified",
      delegable: false,
      userId: "user-1",
      sessionId: "session-1",
      sessionToken: "secret-token",
    })
    const responseVerified = await app.request(
      `${origin}/api/v2/mfa/otp/challenge?flow=${flowHandle}`,
      {
        method: "POST",
        headers: {
          origin,
          "content-type": "application/json",
          cookie: verifiedCookie,
        },
        body: JSON.stringify({ csrfToken }),
      },
      flowBindings,
    )

    expect(responseVerified.status).toBe(409)
    const bodyVerified = (await responseVerified.json()) as { errorMessage: string }
    expect(bodyVerified.errorMessage).toBe("flow_replayed")
  })

  test("rate limit: returns 429 rate_limited with Retry-After header when rate limit is exceeded", async () => {
    const native = nativeCreate()
    const customBindings = bindingsCreate({
      RATE_LIMITER: { limit: async () => ({ success: false }) },
    })
    const app = workerAppCreate(dependenciesCreate(native.fetch))
    const cookie = await flowCookieCreate()

    const response = await app.request(
      `${origin}/api/v2/mfa/otp/challenge?flow=${flowHandle}`,
      {
        method: "POST",
        headers: {
          origin,
          "content-type": "application/json",
          cookie,
        },
        body: JSON.stringify({ csrfToken }),
      },
      customBindings,
    )

    expect(response.status).toBe(429)
    expect(response.headers.get("retry-after")).toBe("60")
    const body = (await response.json()) as { errorMessage: string }
    expect(body.errorMessage).toBe("rate_limited")
  })

  test("upstream failure: returns 503 challenge_unavailable when ZITADEL returns 500 error", async () => {
    const native = nativeCreate({ challengeStatus: 500 })
    const app = workerAppCreate(dependenciesCreate(native.fetch))
    const cookie = await flowCookieCreate()

    const response = await app.request(
      `${origin}/api/v2/mfa/otp/challenge?flow=${flowHandle}`,
      {
        method: "POST",
        headers: {
          origin,
          "content-type": "application/json",
          cookie,
        },
        body: JSON.stringify({ csrfToken }),
      },
      bindingsCreate(),
    )

    expect(response.status).toBe(503)
    const body = (await response.json()) as { errorMessage: string }
    expect(body.errorMessage).toBe("challenge_unavailable")
  })

  test("no-contact / no-secret response: returns 403 or 503 without exposing internal contact/secret state", async () => {
    const native = nativeCreate({ emailVerified: false })
    const app = workerAppCreate(dependenciesCreate(native.fetch))
    const cookie = await flowCookieCreate()

    const response = await app.request(
      `${origin}/api/v2/mfa/otp/challenge?flow=${flowHandle}`,
      {
        method: "POST",
        headers: {
          origin,
          "content-type": "application/json",
          cookie,
        },
        body: JSON.stringify({ csrfToken }),
      },
      bindingsCreate(),
    )

    expect(response.status).toBe(403)
    const body = (await response.json()) as { success: boolean; errorMessage: string }
    expect(body.success).toBe(false)
    expect(body.errorMessage).toBe("method_not_enrolled")
    expect(JSON.stringify(body)).not.toContain("secret-user@example.com")
  })
})
