import { describe, expect, test } from "bun:test"

import type { WorkerBindingsInput } from "../src/config/workerBindingsSchema"
import { flowV2CookieOpen } from "../src/flow/domain/flowV2CookieOpen"
import { workerAppCreate } from "../src/worker/workerAppCreate"
import { emailOtpCooldownNamespaceFakeCreate } from "./emailOtpCooldownNamespaceFakeCreate"

const origin = "https://login.example"
const identityOrigin = "https://identity.example"
const key = "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA"
const now = 1_800_000_000

const authRequest = {
  id: "request-1",
  clientId: "client-1",
  redirectUri: "https://client.example/callback",
  scope: ["openid", "urn:zitadel:iam:org:id:org-1"],
  prompt: ["PROMPT_LOGIN"],
}

function nativeCreate() {
  const calls: Array<{ method: string; url: string }> = []
  let token = "created-token"
  const fetch = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const url = String(input)
    const method = init?.method ?? "GET"
    calls.push({ method, url })
    if (url === `${identityOrigin}/v2/oidc/auth_requests/${authRequest.id}` && method === "GET") {
      return Response.json({ authRequest })
    }
    if (url === `${identityOrigin}/v2/settings/login` && method === "GET") {
      return Response.json({ settings: { allowLocalAuthentication: true } })
    }
    if (url === `${identityOrigin}/v2/users` && method === "POST") {
      return Response.json({
        result: [
          {
            userId: "user-1",
            state: "USER_STATE_ACTIVE",
            details: { resourceOwner: "org-1" },
            human: { email: { email: "person@example.com", isVerified: true } },
          },
        ],
      })
    }
    if (url === `${identityOrigin}/v2/users/user-1/authentication_methods` && method === "GET") {
      return Response.json({ authMethodTypes: ["AUTHENTICATION_METHOD_TYPE_OTP_EMAIL"] })
    }
    if (url === `${identityOrigin}/v2/sessions` && method === "POST") {
      token = "created-token"
      return Response.json({ sessionId: "session-1", sessionToken: token }, { status: 201 })
    }
    if (url === `${identityOrigin}/v2/sessions/session-1` && method === "PATCH") {
      token = "resent-token"
      return Response.json({ sessionToken: token })
    }
    throw new Error(`Unexpected native request: ${method} ${url}`)
  }
  return { fetch, calls }
}

function cookieGet(response: Response): string {
  const header = response.headers.get("set-cookie")
  if (!header) throw new Error("Expected flow cookie")
  return header.split(";", 1)[0] ?? ""
}

function jsonHeaders(cookie?: string): HeadersInit {
  return {
    origin,
    "content-type": "application/json",
    ...(cookie ? { cookie } : {}),
  }
}

async function flowInitialize(app: ReturnType<typeof workerAppCreate>, bindings: WorkerBindingsInput) {
  const response = await app.request(
    `${origin}/api/v2/flow/initialize`,
    { method: "POST", headers: jsonHeaders(), body: JSON.stringify({ authRequest: authRequest.id }) },
    bindings,
  )
  const body = await response.json()
  if (!body.success) throw new Error(`Initialization failed: ${body.errorMessage}`)
  const flow = new URL(`${origin}${body.data.route}`).searchParams.get("flow")
  if (!flow) throw new Error("Expected opaque flow handle")
  return { flow, cookie: cookieGet(response), csrfToken: body.data.csrfToken as string }
}

describe("V2 primary email OTP Durable Object cooldown", () => {
  test("admits only one concurrent initial send and returns the stored expiry on the loser", async () => {
    const native = nativeCreate()
    const bindings: WorkerBindingsInput = {
      ZITADEL_ORIGIN: identityOrigin,
      ZITADEL_ORGANIZATION_ID: "org-1",
      ZITADEL_ALLOWED_CLIENT_IDS: "client-1",
      LOGIN_V2_FALLBACK_URL: `${identityOrigin}/ui/v2/login`,
      PAGES_ORIGIN: origin,
      SESSION_LIFETIME_SECONDS: "900",
      ZITADEL_LOGIN_CLIENT_PAT: "test-pat-not-a-real-secret-value",
      FLOW_COOKIE_KEY: key,
      ZITADEL_CUSTOM_LOGIN_ENABLED: "true",
      RATE_LIMITER: { limit: async () => ({ success: true }) },
      EMAIL_OTP_COOLDOWN: emailOtpCooldownNamespaceFakeCreate(),
    }
    const app = workerAppCreate({
      fetch: native.fetch,
      now: () => now,
      randomBytes: (length) => new Uint8Array(length).fill(21),
    })
    const initialized = await flowInitialize(app, bindings)
    const request = {
      method: "POST",
      headers: jsonHeaders(initialized.cookie),
      body: JSON.stringify({ email: "person@example.com", csrfToken: initialized.csrfToken }),
    } as const
    const [first, second] = await Promise.all([
      app.request(`${origin}/api/v2/email-otp/start?flow=${initialized.flow}`, request, bindings),
      app.request(`${origin}/api/v2/email-otp/start?flow=${initialized.flow}`, request, bindings),
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
      op: "emailOtpStart",
      errorMessage: "rate_limited",
      data: { cooldownExpiresAt: now + 60, cooldownRemainingSeconds: 60 },
    })
    expect(native.calls.filter((call) => call.url === `${identityOrigin}/v2/sessions`)).toHaveLength(1)
  })

  test("reads authoritative Durable Object status after active-flow validation", async () => {
    const native = nativeCreate()
    const bindings: WorkerBindingsInput = {
      ZITADEL_ORIGIN: identityOrigin,
      ZITADEL_ORGANIZATION_ID: "org-1",
      ZITADEL_ALLOWED_CLIENT_IDS: "client-1",
      LOGIN_V2_FALLBACK_URL: `${identityOrigin}/ui/v2/login`,
      PAGES_ORIGIN: origin,
      SESSION_LIFETIME_SECONDS: "900",
      ZITADEL_LOGIN_CLIENT_PAT: "test-pat-not-a-real-secret-value",
      FLOW_COOKIE_KEY: key,
      ZITADEL_CUSTOM_LOGIN_ENABLED: "true",
      RATE_LIMITER: { limit: async () => ({ success: true }) },
      EMAIL_OTP_COOLDOWN: {
        getByName: () => ({
          reserve: async (reserveNow) => ({ accepted: true, expiresAt: reserveNow + 60 }),
          status: async () => ({ expiresAt: now + 12 }),
        }),
      },
    }
    const app = workerAppCreate({
      fetch: native.fetch,
      now: () => now,
      randomBytes: (length) => new Uint8Array(length).fill(22),
    })
    const initialized = await flowInitialize(app, bindings)
    const started = await app.request(
      `${origin}/api/v2/email-otp/start?flow=${initialized.flow}`,
      {
        method: "POST",
        headers: jsonHeaders(initialized.cookie),
        body: JSON.stringify({ email: "person@example.com", csrfToken: initialized.csrfToken }),
      },
      bindings,
    )
    const startedCookie = cookieGet(started)
    const startedState = await flowV2CookieOpen(startedCookie.split("=", 2)[1] ?? "", initialized.flow, [key], now)
    expect(
      startedState.success && startedState.data.stage === "otp" ? startedState.data.cooldownExpiresAt : undefined,
    ).toBe(now + 60)
    const status = await app.request(
      `${origin}/api/v2/email-otp/cooldown?flow=${initialized.flow}`,
      { headers: { cookie: startedCookie } },
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
    const bindings: WorkerBindingsInput = {
      ZITADEL_ORIGIN: identityOrigin,
      ZITADEL_ORGANIZATION_ID: "org-1",
      ZITADEL_ALLOWED_CLIENT_IDS: "client-1",
      LOGIN_V2_FALLBACK_URL: `${identityOrigin}/ui/v2/login`,
      PAGES_ORIGIN: origin,
      SESSION_LIFETIME_SECONDS: "900",
      ZITADEL_LOGIN_CLIENT_PAT: "test-pat-not-a-real-secret-value",
      FLOW_COOKIE_KEY: key,
      ZITADEL_CUSTOM_LOGIN_ENABLED: "true",
      RATE_LIMITER: { limit: async () => ({ success: true }) },
    }
    const app = workerAppCreate({
      fetch: native.fetch,
      now: () => now,
      randomBytes: (length) => new Uint8Array(length).fill(23),
    })
    const initialized = await flowInitialize(app, bindings)
    const started = await app.request(
      `${origin}/api/v2/email-otp/start?flow=${initialized.flow}`,
      {
        method: "POST",
        headers: jsonHeaders(initialized.cookie),
        body: JSON.stringify({ email: "person@example.com", csrfToken: initialized.csrfToken }),
      },
      bindings,
    )
    expect(started.status).toBe(503)
    expect(await started.json()).toEqual({
      success: false,
      op: "emailOtpStart",
      errorMessage: "cooldown_unavailable",
    })
    expect(native.calls.some((call) => call.url === `${identityOrigin}/v2/sessions`)).toBe(false)
  })

  test("admits only one concurrent resend through the Durable Object", async () => {
    const native = nativeCreate()
    let currentNow = now
    const bindings: WorkerBindingsInput = {
      ZITADEL_ORIGIN: identityOrigin,
      ZITADEL_ORGANIZATION_ID: "org-1",
      ZITADEL_ALLOWED_CLIENT_IDS: "client-1",
      LOGIN_V2_FALLBACK_URL: `${identityOrigin}/ui/v2/login`,
      PAGES_ORIGIN: origin,
      SESSION_LIFETIME_SECONDS: "900",
      ZITADEL_LOGIN_CLIENT_PAT: "test-pat-not-a-real-secret-value",
      FLOW_COOKIE_KEY: key,
      ZITADEL_CUSTOM_LOGIN_ENABLED: "true",
      RATE_LIMITER: { limit: async () => ({ success: true }) },
      EMAIL_OTP_COOLDOWN: emailOtpCooldownNamespaceFakeCreate(),
    }
    const app = workerAppCreate({
      fetch: native.fetch,
      now: () => currentNow,
      randomBytes: (length) => new Uint8Array(length).fill(24),
    })
    const initialized = await flowInitialize(app, bindings)
    const started = await app.request(
      `${origin}/api/v2/email-otp/start?flow=${initialized.flow}`,
      {
        method: "POST",
        headers: jsonHeaders(initialized.cookie),
        body: JSON.stringify({ email: "person@example.com", csrfToken: initialized.csrfToken }),
      },
      bindings,
    )
    currentNow = now + 60
    const request = {
      method: "POST",
      headers: jsonHeaders(cookieGet(started)),
      body: JSON.stringify({ csrfToken: initialized.csrfToken }),
    } as const
    const [first, second] = await Promise.all([
      app.request(`${origin}/api/v2/email-otp/resend?flow=${initialized.flow}`, request, bindings),
      app.request(`${origin}/api/v2/email-otp/resend?flow=${initialized.flow}`, request, bindings),
    ])
    const statuses = [first.status, second.status].sort()
    expect(statuses).toEqual([202, 429])
    const rejected = first.status === 429 ? first : second
    expect(rejected.headers.get("retry-after")).toBe("60")
    expect(rejected.headers.get("x-cooldown-expires-at")).toBe(String(now + 120))
    expect(await rejected.json()).toEqual({
      success: false,
      op: "emailOtpResend",
      errorMessage: "rate_limited",
      data: { cooldownExpiresAt: now + 120, cooldownRemainingSeconds: 60 },
    })
    expect(native.calls.filter((call) => call.method === "PATCH")).toHaveLength(1)
  })
})
