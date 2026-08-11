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
  methods?: string[]
  users?: unknown[]
  passwordStatus?: number
  passwordErrorId?: string
  mfa?: boolean
  passwordChangeRequired?: boolean
  passwordChanged?: string
  passwordMaxAgeDays?: number
}

function nativeCreate(options: NativeOptions = {}) {
  const calls: Array<{ method: string; url: string; body?: unknown }> = []
  let sessionToken = "password-token"
  const fetch = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const url = String(input)
    const method = init?.method ?? "GET"
    const body = init?.body ? JSON.parse(String(init.body)) : undefined
    calls.push({ method, url, ...(body === undefined ? {} : { body }) })

    if (url === `${identityOrigin}/v2/oidc/auth_requests/${authRequest.id}` && method === "GET") {
      return Response.json({ authRequest })
    }
    if (url === `${identityOrigin}/v2/settings/login` && method === "GET") {
      return Response.json({ settings: { allowLocalAuthentication: true, forceMfa: options.mfa ?? false } })
    }
    if (url === `${identityOrigin}/v2/settings/password/expiry` && method === "GET") {
      return Response.json({ settings: { maxAgeDays: String(options.passwordMaxAgeDays ?? 90) } })
    }
    if (url === `${identityOrigin}/v2/users` && method === "POST") {
      return Response.json({
        result: options.users ?? [
          {
            userId: "user-1",
            state: "USER_STATE_ACTIVE",
            details: { resourceOwner: "org-1" },
            human: {
              email: { email: "person@example.com", isVerified: true },
              passwordChangeRequired: options.passwordChangeRequired ?? false,
              passwordChanged: options.passwordChanged ?? new Date(now * 1000).toISOString(),
            },
          },
        ],
      })
    }
    if (url === `${identityOrigin}/v2/users/user-1/authentication_methods` && method === "GET") {
      return Response.json({
        authMethodTypes: options.methods ?? ["AUTHENTICATION_METHOD_TYPE_PASSWORD"],
      })
    }
    if (url === `${identityOrigin}/v2/sessions` && method === "POST") {
      if (options.passwordStatus) {
        return Response.json(
          options.passwordErrorId ? { id: options.passwordErrorId } : { error: "upstream failure" },
          { status: options.passwordStatus },
        )
      }
      sessionToken = "password-token"
      return Response.json({ sessionId: "session-1", sessionToken }, { status: 201 })
    }
    if (url.startsWith(`${identityOrigin}/v2/sessions/session-1?`) && method === "GET") {
      const query = new URL(url).searchParams
      if (query.get("sessionToken") !== sessionToken) return Response.json({}, { status: 401 })
      return Response.json({
        session: {
          id: "session-1",
          factors: {
            user: { id: "user-1", organizationId: "org-1" },
            password: { verifiedAt: new Date(now * 1000).toISOString() },
          },
        },
      })
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

async function initialize(app: ReturnType<typeof workerAppCreate>, inputBindings = bindings) {
  const response = await app.request(
    `${origin}/api/v2/flow/initialize`,
    { method: "POST", headers: jsonHeaders(), body: JSON.stringify({ authRequest: authRequest.id }) },
    inputBindings,
  )
  const body = await response.json()
  const route = body.data.route as string
  const flow = new URL(`${origin}${route}`).searchParams.get("flow")
  if (!flow) throw new Error("Expected flow handle")
  return { flow, cookie: cookieGet(response), csrfToken: body.data.csrfToken as string }
}

async function passwordVerify(
  app: ReturnType<typeof workerAppCreate>,
  flow: string,
  cookie: string,
  csrfToken: string,
  inputBindings = bindings,
  payload: Record<string, unknown> = { identifier: "person@example.com", password: "correct-password", csrfToken },
) {
  return app.request(
    `${origin}/api/v2/password/verify?flow=${flow}`,
    {
      method: "POST",
      headers: jsonHeaders(cookie),
      body: JSON.stringify(payload),
    },
    inputBindings,
  )
}

describe("Worker v2 password flow", () => {
  test("creates a native password session, stores only its latest token, and completes authorization", async () => {
    const native = nativeCreate()
    const app = workerAppCreate({
      fetch: native.fetch,
      now: () => now,
      randomBytes: (length) => new Uint8Array(length).fill(21),
    })
    const initialized = await initialize(app)
    const response = await passwordVerify(app, initialized.flow, initialized.cookie, initialized.csrfToken)

    expect(response.status).toBe(200)
    expect(await response.clone().json()).toEqual({
      success: true,
      data: { kind: "complete", path: `/api/v2/flow/continue?flow=${initialized.flow}` },
    })
    expect(native.calls.find((call) => call.url === `${identityOrigin}/v2/sessions`)?.body).toEqual({
      checks: { user: { userId: "user-1" }, password: { password: "correct-password" } },
      lifetime: "900s",
    })
    expect(
      native.calls.find((call) => call.method === "GET" && call.url.includes("/v2/sessions/session-1?"))?.url,
    ).toContain("sessionToken=password-token")
    const cookie = cookieGet(response)
    expect(cookie).not.toContain("correct-password")
    const opened = await flowV2CookieOpen(cookie.split("=", 2)[1] ?? "", initialized.flow, [key], now)
    expect(opened).toEqual(
      expect.objectContaining({
        success: true,
        data: expect.objectContaining({ stage: "verified", sessionToken: "password-token" }),
      }),
    )
  })

  test("returns one generic response for an invalid identifier or password without creating a session", async () => {
    for (const options of [
      { users: [] },
      { passwordStatus: 400, passwordErrorId: "COMMAND-3M0fs" },
      { passwordStatus: 412, passwordErrorId: "COMMAND-JLK35" },
    ]) {
      const native = nativeCreate(options)
      const app = workerAppCreate({ fetch: native.fetch, now: () => now })
      const initialized = await initialize(app)
      const response = await passwordVerify(app, initialized.flow, initialized.cookie, initialized.csrfToken)
      expect(response.status).toBe(401)
      expect(await response.json()).toEqual({
        success: false,
        op: "passwordVerify",
        errorMessage: "credentials_invalid",
      })
      expect(native.calls.some((call) => call.url === `${identityOrigin}/v2/sessions`)).toBe(
        options.users === undefined,
      )
    }
  })

  test("falls back before native mutation when the password capability is disabled", async () => {
    const native = nativeCreate()
    const app = workerAppCreate({ fetch: native.fetch, now: () => now })
    const initialized = await initialize(app)
    const response = await passwordVerify(app, initialized.flow, initialized.cookie, initialized.csrfToken, {
      ...bindings,
      ZITADEL_PASSWORD_V2_ENABLED: "false",
    })
    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({
      success: true,
      data: { kind: "fallback", path: `/api/v2/flow/fallback?flow=${initialized.flow}` },
    })
    expect(native.calls.some((call) => call.url === `${identityOrigin}/v2/sessions`)).toBe(false)
  })

  test("falls back before password Session mutation for unowned MFA and password-lifecycle branches", async () => {
    const cases: Array<{ name: string; options: NativeOptions }> = [
      {
        name: "enrolled MFA",
        options: { methods: ["AUTHENTICATION_METHOD_TYPE_PASSWORD", "AUTHENTICATION_METHOD_TYPE_TOTP"] },
      },
      { name: "forced MFA", options: { mfa: true } },
      { name: "required password change", options: { passwordChangeRequired: true } },
      {
        name: "expired password",
        options: { passwordChanged: "2020-01-01T00:00:00Z", passwordMaxAgeDays: 30 },
      },
    ]

    for (const item of cases) {
      const native = nativeCreate(item.options)
      const app = workerAppCreate({ fetch: native.fetch, now: () => now })
      const initialized = await initialize(app)
      const response = await passwordVerify(app, initialized.flow, initialized.cookie, initialized.csrfToken)

      expect(response.status, item.name).toBe(200)
      expect(await response.json(), item.name).toEqual({
        success: true,
        data: { kind: "fallback", path: `/api/v2/flow/fallback?flow=${initialized.flow}` },
      })
      expect(
        native.calls.some((call) => call.url === `${identityOrigin}/v2/sessions`),
        item.name,
      ).toBe(false)
    }
  })

  test("rate limits before native password mutation with opaque keys", async () => {
    const keys: string[] = []
    const native = nativeCreate()
    const app = workerAppCreate({ fetch: native.fetch, now: () => now })
    const limitedBindings: WorkerBindingsInput = {
      ...bindings,
      RATE_LIMITER: {
        limit: async ({ key: limitKey }) => {
          keys.push(limitKey)
          return { success: !limitKey.startsWith("v2-password-verify:") }
        },
      },
    }
    const initialized = await initialize(app, limitedBindings)
    const response = await passwordVerify(
      app,
      initialized.flow,
      initialized.cookie,
      initialized.csrfToken,
      limitedBindings,
    )
    expect(response.status).toBe(429)
    expect(keys.some((keyValue) => keyValue.includes("person@example.com"))).toBe(false)
    expect(native.calls.some((call) => call.url === `${identityOrigin}/v2/sessions`)).toBe(false)
  })

  test("rejects malformed strict input before opening or mutating flow state", async () => {
    const native = nativeCreate()
    const app = workerAppCreate({ fetch: native.fetch, now: () => now })
    const initialized = await initialize(app)
    const response = await passwordVerify(app, initialized.flow, initialized.cookie, initialized.csrfToken, bindings, {
      identifier: "person@example.com",
      password: "password",
      csrfToken: initialized.csrfToken,
      extra: true,
    })
    expect(response.status).toBe(400)
    expect(native.calls.filter((call) => call.url.endsWith("/v2/sessions")).length).toBe(0)
  })

  test("classifies upstream failures without exposing native response details", async () => {
    const native = nativeCreate({ passwordStatus: 503 })
    const app = workerAppCreate({ fetch: native.fetch, now: () => now })
    const initialized = await initialize(app)
    const response = await passwordVerify(app, initialized.flow, initialized.cookie, initialized.csrfToken)
    expect(response.status).toBe(503)
    expect(await response.json()).toEqual({
      success: false,
      op: "passwordVerify",
      errorMessage: "password_unavailable",
    })
  })

  test("returns an MFA continuation with the native session instead of completing it", async () => {
    const native = nativeCreate({ methods: ["AUTHENTICATION_METHOD_TYPE_PASSWORD", "AUTHENTICATION_METHOD_TYPE_TOTP"] })
    const app = workerAppCreate({ fetch: native.fetch, now: () => now })
    const mfaBindings = { ...bindings, ZITADEL_MFA_V2_ENABLED: "true" }
    const initialized = await initialize(app, mfaBindings)
    const response = await passwordVerify(app, initialized.flow, initialized.cookie, initialized.csrfToken, mfaBindings)
    expect(response.status).toBe(200)
    const body = await response.clone().json()
    expect(body.data).toEqual({
      kind: "render",
      route: `/login/mfa?flow=${initialized.flow}`,
      screen: { name: "mfa", factors: ["AUTHENTICATION_METHOD_TYPE_TOTP"] },
      csrfToken: initialized.csrfToken,
    })
    const continued = await app.request(
      `${origin}/api/v2/flow/continue?flow=${initialized.flow}`,
      {
        headers: { cookie: cookieGet(response) },
      },
      mfaBindings,
    )
    expect(continued.status).toBe(409)
    expect(await continued.json()).toEqual({ success: false, op: "flowContinue", errorMessage: "flow_stage_invalid" })
  })

  test("rejects expired, wrong-stage, and replayed password flows", async () => {
    const native = nativeCreate()
    const app = workerAppCreate({ fetch: native.fetch, now: () => now })
    const initialized = await initialize(app)
    const opened = await flowV2CookieOpen(initialized.cookie.split("=", 2)[1] ?? "", initialized.flow, [key], now)
    if (!opened.success) throw new Error("Expected initialized state")

    const { owned: _owned, ...otpStateBase } = opened.data
    const otpState: FlowV2Cookie = {
      ...otpStateBase,
      stage: "otp",
      delegable: false,
      userId: "user-1",
      sessionId: "session-1",
      sessionToken: "old-token",
    }
    const otpCookie = await flowV2CookieSeal(otpState, key, new Uint8Array(12).fill(22))
    if (!otpCookie.success) throw new Error("Expected OTP state")
    const wrongStage = await passwordVerify(
      app,
      initialized.flow,
      `__Host-zitadel-login-flow-${initialized.flow}=${otpCookie.data}`,
      initialized.csrfToken,
    )
    expect(wrongStage.status).toBe(409)
    expect(await wrongStage.json()).toEqual({
      success: false,
      op: "passwordVerify",
      errorMessage: "flow_stage_invalid",
    })

    const expiredState: FlowV2Cookie = { ...opened.data, expiresAt: now - 1 }
    const expiredCookie = await flowV2CookieSeal(expiredState, key, new Uint8Array(12).fill(23))
    if (!expiredCookie.success) throw new Error("Expected expired state")
    const expired = await passwordVerify(
      app,
      initialized.flow,
      `__Host-zitadel-login-flow-${initialized.flow}=${expiredCookie.data}`,
      initialized.csrfToken,
    )
    expect(expired.status).toBe(409)
    expect(await expired.json()).toEqual({ success: false, op: "passwordVerify", errorMessage: "flow_expired" })

    const success = await passwordVerify(app, initialized.flow, initialized.cookie, initialized.csrfToken)
    const replayed = await passwordVerify(app, initialized.flow, cookieGet(success), initialized.csrfToken)
    expect(replayed.status).toBe(409)
    expect(await replayed.json()).toEqual({ success: false, op: "passwordVerify", errorMessage: "flow_replayed" })
  })
})
