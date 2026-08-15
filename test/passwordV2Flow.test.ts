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
  ZITADEL_CUSTOM_LOGIN_ENABLED: "true",
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
  listedPasswordChangeRequired?: boolean
  listedPasswordChanged?: string
  passwordChangeRequired?: boolean
  passwordChanged?: string
  passwordMaxAgeDays?: number
  sessionToken?: string
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
      return Response.json({
        settings: {
          allowLocalAuthentication: true,
          forceMfa: options.mfa ?? false,
          secondFactors:
            options.methods?.includes("AUTHENTICATION_METHOD_TYPE_TOTP") || options.mfa
              ? ["SECOND_FACTOR_TYPE_OTP"]
              : [],
        },
      })
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
              passwordChangeRequired: options.listedPasswordChangeRequired ?? options.passwordChangeRequired ?? false,
              passwordChanged:
                options.listedPasswordChanged ?? options.passwordChanged ?? new Date(now * 1000).toISOString(),
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
          ...(options.sessionToken ? { sessionToken: options.sessionToken } : {}),
          factors: {
            user: { id: "user-1", organizationId: "org-1" },
            password: { verifiedAt: new Date(now * 1000).toISOString() },
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
            passwordChangeRequired: options.passwordChangeRequired ?? false,
            passwordChanged: options.passwordChanged ?? new Date(now * 1000).toISOString(),
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

  test("falls back before native mutation when custom login is disabled", async () => {
    const native = nativeCreate()
    const app = workerAppCreate({ fetch: native.fetch, now: () => now })
    const initialized = await initialize(app)
    const response = await passwordVerify(app, initialized.flow, initialized.cookie, initialized.csrfToken, {
      ...bindings,
      ZITADEL_CUSTOM_LOGIN_ENABLED: "false",
    })
    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({
      success: true,
      data: { kind: "fallback", path: `/api/v2/flow/fallback?flow=${initialized.flow}` },
    })
    expect(native.calls.some((call) => call.url === `${identityOrigin}/v2/sessions`)).toBe(false)
  })

  test("uses live policy for password primary admission and rejects malformed lifecycle", async () => {
    const cases: Array<{ name: string; options: NativeOptions; kind: "render" | "fallback"; session: boolean }> = [
      {
        name: "enrolled MFA",
        options: { methods: ["AUTHENTICATION_METHOD_TYPE_PASSWORD", "AUTHENTICATION_METHOD_TYPE_TOTP"] },
        kind: "fallback",
        session: true,
      },
      { name: "forced MFA", options: { mfa: true }, kind: "fallback", session: true },
      {
        name: "malformed password timestamp",
        options: { passwordChanged: "not-a-timestamp" },
        kind: "fallback",
        session: false,
      },
    ]

    for (const item of cases) {
      const native = nativeCreate(item.options)
      const app = workerAppCreate({ fetch: native.fetch, now: () => now })
      const initialized = await initialize(app)
      const response = await passwordVerify(app, initialized.flow, initialized.cookie, initialized.csrfToken)

      expect(response.status, item.name).toBe(200)
      const body = await response.json()
      expect(body.success, item.name).toBe(true)
      expect(body.data.kind, item.name).toBe(item.kind)
      expect(
        native.calls.some((call) => call.url === `${identityOrigin}/v2/sessions`),
        item.name,
      ).toBe(item.session)
    }
  })

  test("renders explicit and expired password change before MFA or completion without exposing bound state", async () => {
    for (const item of [
      {
        name: "explicit",
        options: {
          methods: ["AUTHENTICATION_METHOD_TYPE_PASSWORD", "AUTHENTICATION_METHOD_TYPE_TOTP"],
          listedPasswordChangeRequired: false,
          passwordChangeRequired: true,
          sessionToken: "rotated-password-token",
        },
        expired: false,
      },
      {
        name: "expired",
        options: {
          listedPasswordChanged: new Date(now * 1000).toISOString(),
          passwordChanged: "2020-01-01T00:00:00Z",
          passwordMaxAgeDays: 30,
        },
        expired: true,
      },
    ]) {
      const native = nativeCreate(item.options)
      const app = workerAppCreate({ fetch: native.fetch, now: () => now })
      const initialized = await initialize(app)
      const response = await passwordVerify(app, initialized.flow, initialized.cookie, initialized.csrfToken, bindings)

      expect(response.status, item.name).toBe(200)
      const body = await response.clone().json()
      expect(body).toEqual({
        success: true,
        data: {
          kind: "render",
          route: `/login/password?flow=${initialized.flow}`,
          screen: { name: "password_change_required", expired: item.expired },
          csrfToken: initialized.csrfToken,
        },
      })
      for (const secret of ["user-1", "session-1", "password-token", "rotated-password-token"]) {
        expect(JSON.stringify(body), `${item.name}:${secret}`).not.toContain(secret)
      }
      const cookie = cookieGet(response)
      const opened = await flowV2CookieOpen(cookie.split("=", 2)[1] ?? "", initialized.flow, [key], now)
      expect(opened).toEqual(
        expect.objectContaining({
          success: true,
          data: expect.objectContaining({
            stage: "password_change_required",
            delegable: false,
            expired: item.expired,
            transitionCounter: 1,
            sessionToken: item.options.sessionToken ?? "password-token",
          }),
        }),
      )
      const sessionIndex = native.calls.findIndex((call) => call.url === `${identityOrigin}/v2/sessions`)
      const refreshIndex = native.calls.findIndex((call) => call.url === `${identityOrigin}/v2/users/user-1`)
      expect(sessionIndex).toBeGreaterThan(-1)
      expect(refreshIndex).toBeGreaterThan(sessionIndex)

      const resumed = await app.request(
        `${origin}/api/v2/flow/resume?flow=${initialized.flow}`,
        { headers: { cookie } },
        bindings,
      )
      expect(resumed.status).toBe(200)
      expect(await resumed.json()).toEqual(body)

      const mfaOptions = await app.request(
        `${origin}/api/v2/mfa/options?flow=${initialized.flow}`,
        { headers: { cookie } },
        bindings,
      )
      expect(mfaOptions.status).toBe(409)
      expect(await mfaOptions.json()).toEqual({
        success: false,
        op: "mfaOptions",
        errorMessage: "flow_stage_invalid",
      })

      const continued = await app.request(
        `${origin}/api/v2/flow/continue?flow=${initialized.flow}`,
        { headers: { cookie } },
        bindings,
      )
      expect(continued.status).toBe(409)
      expect(await continued.json()).toEqual({
        success: false,
        op: "flowContinue",
        errorMessage: "flow_stage_invalid",
      })

      const delegated = await app.request(
        `${origin}/api/v2/flow/fallback?flow=${initialized.flow}`,
        { headers: { cookie } },
        bindings,
      )
      expect(delegated.status).toBe(409)
      expect(await delegated.json()).toEqual({
        success: false,
        op: "flowFallback",
        errorMessage: "fallback_forbidden",
      })

      const replayed = await passwordVerify(app, initialized.flow, cookie, initialized.csrfToken, bindings)
      expect(replayed.status).toBe(409)
      expect(await replayed.json()).toEqual({
        success: false,
        op: "passwordVerify",
        errorMessage: "flow_replayed",
      })

      if (!opened.success || opened.data.stage !== "password_change_required") {
        throw new Error("Expected password change state")
      }
      const expiredState: FlowV2Cookie = { ...opened.data, expiresAt: now - 1 }
      const expiredCookie = await flowV2CookieSeal(expiredState, key, new Uint8Array(12).fill(31))
      if (!expiredCookie.success) throw new Error("Expected expired password change state")
      const expiredResume = await app.request(
        `${origin}/api/v2/flow/resume?flow=${initialized.flow}`,
        {
          headers: {
            cookie: `__Host-zitadel-login-flow-${initialized.flow}=${expiredCookie.data}`,
          },
        },
        bindings,
      )
      expect(expiredResume.status).toBe(409)
      expect(await expiredResume.json()).toEqual({
        success: false,
        op: "flowResume",
        errorMessage: "flow_expired",
      })
    }
  })

  test("rejects browser-supplied password lifecycle flags before native requests", async () => {
    const native = nativeCreate()
    const app = workerAppCreate({ fetch: native.fetch, now: () => now })
    const initialized = await initialize(app)
    const callsBefore = native.calls.length
    const response = await passwordVerify(app, initialized.flow, initialized.cookie, initialized.csrfToken, bindings, {
      identifier: "person@example.com",
      password: "correct-password",
      csrfToken: initialized.csrfToken,
      passwordChangeRequired: true,
    })
    expect(response.status).toBe(400)
    expect(native.calls).toHaveLength(callsBefore)
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

  test("delegates MFA-required password flows to native Login V2", async () => {
    const native = nativeCreate({ methods: ["AUTHENTICATION_METHOD_TYPE_PASSWORD", "AUTHENTICATION_METHOD_TYPE_TOTP"] })
    const app = workerAppCreate({ fetch: native.fetch, now: () => now })
    const initialized = await initialize(app)
    const response = await passwordVerify(app, initialized.flow, initialized.cookie, initialized.csrfToken, bindings)
    expect(response.status).toBe(200)
    const body = await response.clone().json()
    expect(body.data).toEqual({
      kind: "fallback",
      path: `/api/v2/flow/fallback?flow=${initialized.flow}`,
    })
    expect(native.calls.some((call) => call.url === `${identityOrigin}/v2/sessions` && call.method === "POST")).toBe(
      true,
    )

    const fallback = await app.request(
      `${origin}${body.data.path}`,
      { headers: { cookie: cookieGet(response) } },
      bindings,
    )
    expect(fallback.status).toBe(302)
    expect(fallback.headers.get("location")).toBe(`${identityOrigin}/ui/v2/login?authRequest=request-1`)
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
