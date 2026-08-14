import { describe, expect, test } from "bun:test"

import type { WorkerBindingsInput } from "../src/config/workerBindingsSchema"
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
  const calls: Array<{ method: string; url: string; body?: unknown }> = []
  const fetch = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const url = String(input)
    const method = init?.method ?? "GET"
    const body = init?.body ? JSON.parse(String(init.body)) : undefined
    calls.push({ method, url, body })
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
      return Response.json({ sessionId: "session-1", sessionToken: "created-token" }, { status: 201 })
    }
    if (url === `${identityOrigin}/v2/sessions/session-1` && method === "PATCH") {
      return Response.json({ sessionToken: "challenged-token" })
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
    ZITADEL_CUSTOM_LOGIN_ENABLED: "true",
    RATE_LIMITER: { limit: async () => ({ success: true }) },
    ...overrides,
  }
}

async function flowInitialize(
  app: ReturnType<typeof workerAppCreate>,
  bindings: WorkerBindingsInput,
): Promise<{ cookie: string; csrfToken: string }> {
  const response = await app.request(
    `${origin}/api/auth-request?authRequest=${authRequest.id}`,
    { headers: { origin } },
    bindings,
  )
  const body = await response.json()
  if (body.status !== "ready") throw new Error(`Initialization failed: ${JSON.stringify(body)}`)
  return { cookie: cookieGet(response), csrfToken: body.csrfToken as string }
}

function challengeCallsGet(calls: Array<{ method: string; url: string; body?: unknown }>) {
  return calls.filter(
    (call) =>
      call.method === "PATCH" &&
      call.url === `${identityOrigin}/v2/sessions/session-1` &&
      Boolean((call.body as { challenges?: unknown } | undefined)?.challenges),
  )
}

describe("legacy primary email OTP Durable Object cooldown", () => {
  test("admits only one concurrent initial send and returns the stored expiry on the loser", async () => {
    const native = nativeCreate()
    const bindings = bindingsCreate({ EMAIL_OTP_COOLDOWN: emailOtpCooldownNamespaceFakeCreate() })
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
      app.request(`${origin}/api/email-otp/start`, request, bindings),
      app.request(`${origin}/api/email-otp/start`, request, bindings),
    ])
    const statuses = [first.status, second.status].sort()
    expect(statuses).toEqual([202, 429])
    const accepted = first.status === 202 ? first : second
    const rejected = first.status === 429 ? first : second
    expect(accepted.headers.get("x-cooldown-expires-at")).toBe(String(now + 60))
    expect(accepted.headers.get("x-cooldown-remaining-seconds")).toBe("60")
    expect(await accepted.json()).toEqual({ status: "code_sent" })
    expect(rejected.headers.get("retry-after")).toBe("60")
    expect(rejected.headers.get("x-cooldown-expires-at")).toBe(String(now + 60))
    expect(rejected.headers.get("x-cooldown-remaining-seconds")).toBe("60")
    expect(await rejected.json()).toEqual({
      error: { code: "rate_limited", message: "Too many sign-in attempts. Please retry later." },
    })
    expect(challengeCallsGet(native.calls)).toHaveLength(1)
  })

  test("fails closed with 503 when the Durable Object is unavailable and never calls ZITADEL send", async () => {
    const native = nativeCreate()
    const bindings = bindingsCreate()
    const app = workerAppCreate({
      fetch: native.fetch,
      now: () => now,
      randomBytes: (length) => new Uint8Array(length).fill(23),
    })
    const initialized = await flowInitialize(app, bindings)
    const started = await app.request(
      `${origin}/api/email-otp/start`,
      {
        method: "POST",
        headers: jsonHeaders(initialized.cookie),
        body: JSON.stringify({ email: "person@example.com", csrfToken: initialized.csrfToken }),
      },
      bindings,
    )
    expect(started.status).toBe(503)
    expect(await started.json()).toEqual({
      error: { code: "service_unavailable", message: "The sign-in service is temporarily unavailable." },
    })
    expect(challengeCallsGet(native.calls)).toHaveLength(0)
  })

  test("admits only one concurrent resend and still consults RATE_LIMITER", async () => {
    const native = nativeCreate()
    let currentNow = now
    const limiterKeys: string[] = []
    const bindings = bindingsCreate({
      EMAIL_OTP_COOLDOWN: emailOtpCooldownNamespaceFakeCreate(),
      RATE_LIMITER: {
        limit: async ({ key: limitKey }) => {
          limiterKeys.push(limitKey)
          return { success: true }
        },
      },
    })
    const app = workerAppCreate({
      fetch: native.fetch,
      now: () => currentNow,
      randomBytes: (length) => new Uint8Array(length).fill(24),
    })
    const initialized = await flowInitialize(app, bindings)
    const started = await app.request(
      `${origin}/api/email-otp/start`,
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
      app.request(`${origin}/api/email-otp/resend`, request, bindings),
      app.request(`${origin}/api/email-otp/resend`, request, bindings),
    ])
    const statuses = [first.status, second.status].sort()
    expect(statuses).toEqual([202, 429])
    const accepted = first.status === 202 ? first : second
    const rejected = first.status === 429 ? first : second
    expect(await accepted.json()).toEqual({ status: "code_sent" })
    expect(accepted.headers.get("x-cooldown-expires-at")).toBe(String(now + 120))
    expect(rejected.headers.get("retry-after")).toBe("60")
    expect(rejected.headers.get("x-cooldown-expires-at")).toBe(String(now + 120))
    expect(await rejected.json()).toEqual({
      error: { code: "rate_limited", message: "Too many sign-in attempts. Please retry later." },
    })
    expect(limiterKeys.some((limitKey) => limitKey.startsWith("otp-resend:"))).toBe(true)
    expect(challengeCallsGet(native.calls)).toHaveLength(2)
  })

  test("shares the email-otp purpose reservation with V2 primary on the same auth request", async () => {
    const native = nativeCreate()
    const bindings = bindingsCreate({ EMAIL_OTP_COOLDOWN: emailOtpCooldownNamespaceFakeCreate() })
    const app = workerAppCreate({
      fetch: native.fetch,
      now: () => now,
      randomBytes: (length) => new Uint8Array(length).fill(25),
    })
    const initialized = await flowInitialize(app, bindings)
    const started = await app.request(
      `${origin}/api/email-otp/start`,
      {
        method: "POST",
        headers: jsonHeaders(initialized.cookie),
        body: JSON.stringify({ email: "person@example.com", csrfToken: initialized.csrfToken }),
      },
      bindings,
    )
    expect(started.status).toBe(202)
    const v2 = await app.request(
      `${origin}/api/v2/flow/initialize`,
      { method: "POST", headers: jsonHeaders(), body: JSON.stringify({ authRequest: authRequest.id }) },
      bindings,
    )
    const v2Body = await v2.json()
    const flow = new URL(`${origin}${v2Body.data.route}`).searchParams.get("flow")
    const v2Start = await app.request(
      `${origin}/api/v2/email-otp/start?flow=${flow}`,
      {
        method: "POST",
        headers: jsonHeaders(cookieGet(v2)),
        body: JSON.stringify({ email: "person@example.com", csrfToken: v2Body.data.csrfToken }),
      },
      bindings,
    )
    expect(v2Start.status).toBe(429)
    expect(v2Start.headers.get("x-cooldown-expires-at")).toBe(String(now + 60))
    expect(await v2Start.json()).toEqual({
      success: false,
      op: "emailOtpStart",
      errorMessage: "rate_limited",
      data: { cooldownExpiresAt: now + 60, cooldownRemainingSeconds: 60 },
    })
  })
})
