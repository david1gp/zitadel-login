import { describe, expect, test } from "bun:test"

import type { WorkerBindingsInput } from "../src/config/workerBindingsSchema"
import { flowV2CookieOpen } from "../src/flow/domain/flowV2CookieOpen"
import { flowV2CookieSeal } from "../src/flow/domain/flowV2CookieSeal"
import type { FlowV2Cookie } from "../src/flow/model/flowV2CookieSchema"
import { workerAppCreate } from "../src/worker/workerAppCreate"

const origin = "https://login.example"
const identityOrigin = "https://identity.example"
const key = "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA"
const now = 1_800_000_000
const flowHandle = "AAAAAAAAAAAAAAAAAAAAAA"

const bindings: WorkerBindingsInput = {
  ZITADEL_ORIGIN: identityOrigin,
  ZITADEL_ORGANIZATION_ID: "org-1",
  ZITADEL_ALLOWED_CLIENT_IDS: "client-1",
  LOGIN_V2_FALLBACK_URL: `${identityOrigin}/ui/v2/login`,
  PAGES_ORIGIN: origin,
  SESSION_LIFETIME_SECONDS: "900",
  ZITADEL_LOGIN_CLIENT_PAT: "test-pat-not-a-real-secret-value",
  FLOW_COOKIE_KEY: key,
  ZITADEL_LOGIN_V2_ENABLED: "true",
  ZITADEL_EMAIL_OTP_V2_ENABLED: "true",
  ZITADEL_PASSWORD_V2_ENABLED: "true",
  ZITADEL_PASSKEY_V2_ENABLED: "true",
  ZITADEL_MFA_V2_ENABLED: "true",
  RATE_LIMITER: { limit: async () => ({ success: true }) },
}

const authRequest = {
  id: "request-1",
  clientId: "client-1",
  redirectUri: "https://client.example/callback",
  scope: ["openid", "urn:zitadel:iam:org:id:org-1"],
  prompt: ["PROMPT_LOGIN"],
}

type NativeOptions = {
  totpStatus?: number
  sessionStatus?: number
  latestToken?: string
  methods?: string[]
  secondFactors?: string[]
  factors?: Record<string, unknown>
  rateLimitSuccess?: boolean
  callbackStatus?: number
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
      if (options.totpStatus) {
        return Response.json({ error: "totp check failed" }, { status: options.totpStatus })
      }
      return Response.json({ sessionToken: options.latestToken ?? "updated-secret-totp-token" })
    }
    if (url.startsWith(`${identityOrigin}/v2/sessions/session-1?`) && method === "GET") {
      if (options.sessionStatus) return Response.json({}, { status: options.sessionStatus })
      return Response.json({
        session: {
          id: "session-1",
          sessionToken: options.latestToken ?? "updated-secret-totp-token",
          factors: options.factors ?? {
            user: { id: "user-1", organizationId: "org-1" },
            password: { verifiedAt: "2026-08-11T12:00:00Z" },
            totp: { verifiedAt: "2026-08-11T12:05:00Z" },
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
          human: { email: { email: "secret-user@example.com", isVerified: true } },
        },
      })
    }
    if (url === `${identityOrigin}/v2/users/user-1/authentication_methods` && method === "GET") {
      return Response.json({
        authMethodTypes: options.methods ?? ["AUTHENTICATION_METHOD_TYPE_PASSWORD", "AUTHENTICATION_METHOD_TYPE_TOTP"],
      })
    }
    if (url === `${identityOrigin}/v2/settings/login` && method === "GET") {
      return Response.json({
        settings: {
          forceMfa: true,
          secondFactors: options.secondFactors ?? ["SECOND_FACTOR_TYPE_OTP"],
        },
      })
    }
    if (url === `${identityOrigin}/v2/oidc/auth_requests/${authRequest.id}` && method === "POST") {
      if (options.callbackStatus) {
        return Response.json({ error: "callback failed" }, { status: options.callbackStatus })
      }
      return Response.json({ callbackUrl: "https://client.example/callback?code=secret-oauth-code" })
    }

    throw new Error(`Unexpected request: ${method} ${url}`)
  }
  return { fetch, calls }
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
    csrfToken: "B".repeat(43),
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
            mfaMethods: ["AUTHENTICATION_METHOD_TYPE_TOTP"],
            ...customState,
          }

  const sealed = await flowV2CookieSeal(cookieState, key, new Uint8Array(12))
  if (!sealed.success) throw new Error("Failed to seal cookie")
  return {
    header: `__Host-zitadel-login-flow-${flowHandle}=${sealed.data}`,
    state: cookieState,
  }
}

describe("Worker V2 MFA TOTP flow", () => {
  test("completes valid TOTP verification and transitions to verified stage via /api/v2/mfa/otp/verify", async () => {
    const native = nativeCreate()
    const app = workerAppCreate({
      fetch: native.fetch,
      now: () => now,
      randomBytes: (length) => new Uint8Array(length).fill(7),
      logger: { warn: () => {}, error: () => {} },
    })

    const cookie = await flowCookieCreate()
    const response = await app.request(
      `https://login.example/api/v2/mfa/otp/verify?flow=${flowHandle}`,
      {
        method: "POST",
        headers: {
          origin,
          "content-type": "application/json",
          cookie: cookie.header,
        },
        body: JSON.stringify({
          code: "123456",
          csrfToken: "B".repeat(43),
        }),
      },
      bindings,
    )

    expect(response.status).toBe(200)
    const body = await response.json()
    expect(body).toEqual({
      success: true,
      data: {
        kind: "complete",
        path: `/api/v2/flow/continue?flow=${flowHandle}`,
      },
    })

    const setCookie = response.headers.get("Set-Cookie")
    expect(setCookie).toBeTruthy()
    const match = setCookie?.match(new RegExp(`__Host-zitadel-login-flow-${flowHandle}=([^;]+)`))
    expect(match).toBeTruthy()
    const opened = await flowV2CookieOpen(match![1]!, flowHandle, [key], now)
    expect(opened.success).toBe(true)
    if (!opened.success) return
    expect(opened.data.stage).toBe("verified")
    if (opened.data.stage !== "verified") return
    expect(opened.data.sessionId).toBe("session-1")
    expect(opened.data.sessionToken).toBe("updated-secret-totp-token")
  })

  test("works identically via /api/v2/mfa/totp/verify endpoint alias", async () => {
    const native = nativeCreate()
    const app = workerAppCreate({
      fetch: native.fetch,
      now: () => now,
      randomBytes: (length) => new Uint8Array(length).fill(7),
      logger: { warn: () => {}, error: () => {} },
    })

    const cookie = await flowCookieCreate()
    const response = await app.request(
      `https://login.example/api/v2/mfa/totp/verify?flow=${flowHandle}`,
      {
        method: "POST",
        headers: {
          origin,
          "content-type": "application/json",
          cookie: cookie.header,
        },
        body: JSON.stringify({
          code: "123456",
          method: "totp",
          csrfToken: "B".repeat(43),
        }),
      },
      bindings,
    )

    expect(response.status).toBe(200)
    const json = await response.json()
    expect(json.success).toBe(true)
  })

  test("rejects invalid or expired TOTP codes with 401 code_invalid", async () => {
    const native = nativeCreate({ totpStatus: 400 })
    const app = workerAppCreate({
      fetch: native.fetch,
      now: () => now,
      randomBytes: (length) => new Uint8Array(length).fill(7),
      logger: { warn: () => {}, error: () => {} },
    })

    const cookie = await flowCookieCreate()
    const response = await app.request(
      `https://login.example/api/v2/mfa/otp/verify?flow=${flowHandle}`,
      {
        method: "POST",
        headers: {
          origin,
          "content-type": "application/json",
          cookie: cookie.header,
        },
        body: JSON.stringify({
          code: "999999",
          csrfToken: "B".repeat(43),
        }),
      },
      bindings,
    )

    expect(response.status).toBe(401)
    expect(await response.json()).toEqual({
      success: false,
      op: "mfaOtpVerify",
      errorMessage: "code_invalid",
    })
  })

  test("rejects verification when TOTP is not an enrolled method", async () => {
    const native = nativeCreate()
    const app = workerAppCreate({
      fetch: native.fetch,
      now: () => now,
      randomBytes: (length) => new Uint8Array(length).fill(7),
      logger: { warn: () => {}, error: () => {} },
    })

    const cookie = await flowCookieCreate({
      mfaMethods: ["AUTHENTICATION_METHOD_TYPE_OTP_EMAIL"],
    })
    const response = await app.request(
      `https://login.example/api/v2/mfa/otp/verify?flow=${flowHandle}`,
      {
        method: "POST",
        headers: {
          origin,
          "content-type": "application/json",
          cookie: cookie.header,
        },
        body: JSON.stringify({
          code: "123456",
          csrfToken: "B".repeat(43),
        }),
      },
      bindings,
    )

    expect(response.status).toBe(403)
    expect(await response.json()).toEqual({
      success: false,
      op: "mfaOtpVerify",
      errorMessage: "method_not_enrolled",
    })
  })

  test("rejects malformed payload with 400 invalid_payload", async () => {
    const native = nativeCreate()
    const app = workerAppCreate({
      fetch: native.fetch,
      now: () => now,
      randomBytes: (length) => new Uint8Array(length).fill(7),
      logger: { warn: () => {}, error: () => {} },
    })

    const cookie = await flowCookieCreate()
    const response = await app.request(
      `https://login.example/api/v2/mfa/otp/verify?flow=${flowHandle}`,
      {
        method: "POST",
        headers: {
          origin,
          "content-type": "application/json",
          cookie: cookie.header,
        },
        body: JSON.stringify({
          // missing code
          csrfToken: "B".repeat(43),
        }),
      },
      bindings,
    )

    expect(response.status).toBe(400)
    expect(await response.json()).toEqual({
      success: false,
      op: "mfaOtpVerify",
      errorMessage: "invalid_payload",
    })
  })

  test("rejects stale flow stage ready with 409 flow_stage_invalid", async () => {
    const native = nativeCreate()
    const app = workerAppCreate({
      fetch: native.fetch,
      now: () => now,
      randomBytes: (length) => new Uint8Array(length).fill(7),
      logger: { warn: () => {}, error: () => {} },
    })

    const cookie = await flowCookieCreate({ stage: "ready" })
    const response = await app.request(
      `https://login.example/api/v2/mfa/otp/verify?flow=${flowHandle}`,
      {
        method: "POST",
        headers: {
          origin,
          "content-type": "application/json",
          cookie: cookie.header,
        },
        body: JSON.stringify({
          code: "123456",
          csrfToken: "B".repeat(43),
        }),
      },
      bindings,
    )

    expect(response.status).toBe(409)
    expect(await response.json()).toEqual({
      success: false,
      op: "mfaOtpVerify",
      errorMessage: "flow_stage_invalid",
    })
  })

  test("rejects replayed request on verified flow stage with 409 flow_replayed", async () => {
    const native = nativeCreate()
    const app = workerAppCreate({
      fetch: native.fetch,
      now: () => now,
      randomBytes: (length) => new Uint8Array(length).fill(7),
      logger: { warn: () => {}, error: () => {} },
    })

    const cookie = await flowCookieCreate({ stage: "verified" })
    const response = await app.request(
      `https://login.example/api/v2/mfa/otp/verify?flow=${flowHandle}`,
      {
        method: "POST",
        headers: {
          origin,
          "content-type": "application/json",
          cookie: cookie.header,
        },
        body: JSON.stringify({
          code: "123456",
          csrfToken: "B".repeat(43),
        }),
      },
      bindings,
    )

    expect(response.status).toBe(409)
    expect(await response.json()).toEqual({
      success: false,
      op: "mfaOtpVerify",
      errorMessage: "flow_replayed",
    })
  })

  test("handles rate limiting with 429 rate_limited", async () => {
    const native = nativeCreate()
    const rateLimitedBindings: WorkerBindingsInput = {
      ...bindings,
      RATE_LIMITER: { limit: async () => ({ success: false }) },
    }
    const app = workerAppCreate({
      fetch: native.fetch,
      now: () => now,
      randomBytes: (length) => new Uint8Array(length).fill(7),
      logger: { warn: () => {}, error: () => {} },
    })

    const cookie = await flowCookieCreate()
    const response = await app.request(
      `https://login.example/api/v2/mfa/otp/verify?flow=${flowHandle}`,
      {
        method: "POST",
        headers: {
          origin,
          "content-type": "application/json",
          cookie: cookie.header,
        },
        body: JSON.stringify({
          code: "123456",
          csrfToken: "B".repeat(43),
        }),
      },
      rateLimitedBindings,
    )

    expect(response.status).toBe(429)
    expect(response.headers.get("retry-after")).toBe("60")
    expect(await response.json()).toEqual({
      success: false,
      op: "mfaOtpVerify",
      errorMessage: "rate_limited",
    })
  })

  test("handles callback failure upon completion in /api/v2/flow/continue", async () => {
    const native = nativeCreate({ callbackStatus: 500 })
    const app = workerAppCreate({
      fetch: native.fetch,
      now: () => now,
      randomBytes: (length) => new Uint8Array(length).fill(7),
      logger: { warn: () => {}, error: () => {} },
    })

    const cookie = await flowCookieCreate({ stage: "verified" })
    const response = await app.request(
      `https://login.example/api/v2/flow/continue?flow=${flowHandle}`,
      {
        headers: {
          origin,
          cookie: cookie.header,
        },
      },
      bindings,
    )

    expect(response.status).toBe(502)
    expect(await response.json()).toEqual({
      success: false,
      op: "flowContinue",
      errorMessage: "callback_unavailable",
    })
  })

  test("verifies response contains no sensitive secrets", async () => {
    const native = nativeCreate()
    const logs: Array<{ event: string; context?: Record<string, unknown> }> = []
    const app = workerAppCreate({
      fetch: native.fetch,
      now: () => now,
      randomBytes: (length) => new Uint8Array(length).fill(7),
      logger: {
        warn: (event, context) => logs.push({ event, context }),
        error: (event, context) => logs.push({ event, context }),
      },
    })

    const cookie = await flowCookieCreate()
    const response = await app.request(
      `https://login.example/api/v2/mfa/otp/verify?flow=${flowHandle}`,
      {
        method: "POST",
        headers: {
          origin,
          "content-type": "application/json",
          cookie: cookie.header,
        },
        body: JSON.stringify({
          code: "123456",
          csrfToken: "B".repeat(43),
        }),
      },
      bindings,
    )

    const rawText = await response.text()
    expect(rawText).not.toContain("123456")
    expect(rawText).not.toContain("user-1")
    expect(rawText).not.toContain("session-1")
    expect(rawText).not.toContain("updated-secret-totp-token")
    expect(rawText).not.toContain("secret-user@example.com")

    for (const log of logs) {
      const logStr = JSON.stringify(log)
      expect(logStr).not.toContain("123456")
      expect(logStr).not.toContain("updated-secret-totp-token")
      expect(logStr).not.toContain("secret-user@example.com")
    }
  })
})
