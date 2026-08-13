import { describe, expect, test } from "bun:test"
import * as v from "valibot"
import type { WorkerBindingsInput } from "../src/config/workerBindingsSchema"
import { flowV2CookieOpen } from "../src/flow/domain/flowV2CookieOpen"
import { flowV2CookieSeal } from "../src/flow/domain/flowV2CookieSeal"
import type { FlowV2Cookie } from "../src/flow/model/flowV2CookieSchema"
import { passwordChangeRequiredResponseSchema } from "../src/password/model/passwordChangeRequiredResponseSchema"
import { workerAppCreate } from "../src/worker/workerAppCreate"

const origin = "https://login.example"
const identityOrigin = "https://identity.example"
const flowHandle = "A".repeat(22)
const csrfToken = "B".repeat(43)
const key = "A".repeat(43)
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
  RATE_LIMITER: { limit: async () => ({ success: true }) },
}

const state: Extract<FlowV2Cookie, { stage: "password_change_required" }> = {
  version: 2,
  flowHandle,
  requestKind: "oidc",
  authRequestId: "request-1",
  clientId: "client-1",
  redirectUri: "https://client.example/callback",
  organizationId: "org-1",
  prompt: ["PROMPT_LOGIN"],
  csrfToken,
  issuedAt: now - 60,
  expiresAt: now + 900,
  transitionCounter: 1,
  stage: "password_change_required",
  delegable: false,
  userId: "user-1",
  sessionId: "session-1",
  sessionToken: "session-token",
  expired: false,
}

type NativeOptions = {
  authClientId?: string
  sessionOrganizationId?: string
  explicit?: boolean
  passwordErrorId?: string
  postRequired?: boolean
  postUserStatus?: number
  methods?: string[]
  forceMfa?: boolean
  postSessionStatus?: number
  sessionToken?: string
}

function nativeCreate(options: NativeOptions = {}) {
  const calls: Array<{ method: string; url: string; body?: unknown }> = []
  let userCalls = 0
  let sessionCalls = 0
  const fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input)
    const method = init?.method ?? "GET"
    const body = init?.body ? JSON.parse(String(init.body)) : undefined
    calls.push({ method, url, ...(body === undefined ? {} : { body }) })

    if (url === `${identityOrigin}/v2/oidc/auth_requests/request-1`) {
      return Response.json({
        authRequest: {
          id: "request-1",
          clientId: options.authClientId ?? "client-1",
          redirectUri: "https://client.example/callback",
          scope: ["openid"],
          prompt: ["PROMPT_LOGIN"],
        },
      })
    }
    if (url.startsWith(`${identityOrigin}/v2/sessions/session-1?`)) {
      sessionCalls += 1
      if (options.postSessionStatus && sessionCalls > 1) {
        return Response.json({ id: "SESSION-FAILED" }, { status: options.postSessionStatus })
      }
      return Response.json({
        session: {
          id: "session-1",
          ...(options.sessionToken ? { sessionToken: options.sessionToken } : {}),
          expirationDate: new Date((now + 600) * 1000).toISOString(),
          factors: {
            user: { id: "user-1", organizationId: options.sessionOrganizationId ?? "org-1" },
            password: { verifiedAt: new Date((now - 30) * 1000).toISOString() },
          },
        },
      })
    }
    if (url === `${identityOrigin}/v2/users/user-1` && method === "GET") {
      userCalls += 1
      if (options.postUserStatus && userCalls > 1) {
        return Response.json({ id: "USER-FAILED" }, { status: options.postUserStatus })
      }
      return Response.json({
        user: {
          userId: "user-1",
          state: "USER_STATE_ACTIVE",
          details: { resourceOwner: "org-1" },
          human: {
            email: { email: "person@example.com", isVerified: true },
            passwordChangeRequired: userCalls > 1 ? (options.postRequired ?? false) : (options.explicit ?? true),
            passwordChanged: new Date(now * 1000).toISOString(),
          },
        },
      })
    }
    if (url === `${identityOrigin}/v2/settings/password/expiry`) {
      return Response.json({ settings: { maxAgeDays: "90" } })
    }
    if (url === `${identityOrigin}/v2/users/user-1/authentication_methods`) {
      return Response.json({
        authMethodTypes: options.methods ?? ["AUTHENTICATION_METHOD_TYPE_PASSWORD"],
      })
    }
    if (url === `${identityOrigin}/v2/settings/login`) {
      return Response.json({
        settings: {
          allowLocalAuthentication: true,
          forceMfa: options.forceMfa ?? false,
          secondFactors: options.methods?.includes("AUTHENTICATION_METHOD_TYPE_TOTP") ? ["SECOND_FACTOR_TYPE_OTP"] : [],
          multiFactors: [],
        },
      })
    }
    if (url === `${identityOrigin}/v2/users/user-1/password` && method === "POST") {
      if (options.passwordErrorId) return Response.json({ id: options.passwordErrorId }, { status: 400 })
      return Response.json({})
    }
    throw new Error(`Unexpected native request: ${method} ${url}`)
  }
  return { fetch, calls }
}

async function cookieCreate(inputState: FlowV2Cookie = state) {
  const sealed = await flowV2CookieSeal(inputState, key, new Uint8Array(12).fill(5))
  if (!sealed.success) throw new Error("Expected sealed state")
  return `__Host-zitadel-login-flow-${flowHandle}=${sealed.data}`
}

function requestCreate(
  cookie: string,
  payload: Record<string, unknown> = {
    currentPassword: "current-password-secret",
    newPassword: "new-password-secret",
    csrfToken,
  },
) {
  return new Request(`${origin}/api/v2/password/change-required?flow=${flowHandle}`, {
    method: "POST",
    headers: { origin, "content-type": "application/json", cookie, "cf-connecting-ip": "203.0.113.1" },
    body: JSON.stringify(payload),
  })
}

function latestCookieValueGet(response: Response) {
  const header = response.headers.get("set-cookie")
  if (!header) throw new Error("Expected flow cookie")
  const matches = [...header.matchAll(new RegExp(`__Host-zitadel-login-flow-${flowHandle}=([^;,]+)`, "g"))]
  const value = matches.at(-1)?.[1]
  if (!value) throw new Error("Expected flow cookie value")
  return value
}

describe("Worker required password change", () => {
  test("uses exact native body, retains token, completes, and exposes no secrets", async () => {
    const native = nativeCreate({ sessionToken: "rotated-token" })
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
    const response = await app.request(requestCreate(await cookieCreate()), undefined, {
      ...bindings,
      ZITADEL_CUSTOM_LOGIN_ENABLED: "false",
    })
    const body = await response.clone().json()

    expect(response.status).toBe(200)
    expect(body).toEqual({
      success: true,
      data: { kind: "complete", path: `/api/v2/flow/continue?flow=${flowHandle}` },
    })
    expect(v.safeParse(passwordChangeRequiredResponseSchema, body).success).toBe(true)
    expect(native.calls.find((call) => call.url.endsWith("/password"))?.body).toEqual({
      newPassword: { password: "new-password-secret", changeRequired: false },
      currentPassword: "current-password-secret",
    })
    const opened = await flowV2CookieOpen(latestCookieValueGet(response), flowHandle, [key], now)
    expect(opened).toEqual(
      expect.objectContaining({
        success: true,
        data: expect.objectContaining({ stage: "verified", sessionToken: "rotated-token" }),
      }),
    )
    const exposed = JSON.stringify({ body, logs, cookie: response.headers.get("set-cookie") })
    for (const secret of ["current-password-secret", "new-password-secret", "user-1", "rotated-token"]) {
      expect(exposed).not.toContain(secret)
    }

    const completedCookie = `__Host-zitadel-login-flow-${flowHandle}=${latestCookieValueGet(response)}`
    const reload = await app.request(
      `${origin}/api/v2/flow/resume?flow=${flowHandle}`,
      { headers: { cookie: completedCookie } },
      bindings,
    )
    expect(await reload.json()).toEqual({
      success: true,
      data: { kind: "complete", path: `/api/v2/flow/continue?flow=${flowHandle}` },
    })
    const duplicate = await app.request(requestCreate(completedCookie), undefined, bindings)
    expect(duplicate.status).toBe(409)
    expect(native.calls.filter((call) => call.url.endsWith("/password"))).toHaveLength(1)
  })

  test("rotates CSRF and preserves the required stage for policy and current-password retries", async () => {
    for (const item of [
      { id: "DOMAIN-HuJf6", status: 400, message: "password_policy_invalid" },
      { id: "COMMAND-3M0fs", status: 401, message: "credentials_invalid" },
    ]) {
      const native = nativeCreate({ passwordErrorId: item.id })
      const app = workerAppCreate({
        fetch: native.fetch,
        now: () => now,
        randomBytes: (length) => new Uint8Array(length).fill(8),
      })
      const response = await app.request(requestCreate(await cookieCreate()), undefined, bindings)
      const body = await response.clone().json()

      expect(response.status).toBe(item.status)
      expect(body).toEqual({
        success: false,
        op: "passwordChangeRequired",
        errorMessage: item.message,
        csrfToken: expect.not.stringMatching(/^B+$/),
        expiresAt: state.expiresAt,
      })
      expect(v.safeParse(passwordChangeRequiredResponseSchema, body).success).toBe(true)
      const opened = await flowV2CookieOpen(latestCookieValueGet(response), flowHandle, [key], now)
      expect(opened).toEqual(
        expect.objectContaining({
          success: true,
          data: expect.objectContaining({
            stage: "password_change_required",
            csrfToken: body.csrfToken,
            transitionCounter: 2,
          }),
        }),
      )
    }
  })

  test("continues to MFA and falls back after post-change failure without replay", async () => {
    const mfaNative = nativeCreate({
      methods: ["AUTHENTICATION_METHOD_TYPE_PASSWORD", "AUTHENTICATION_METHOD_TYPE_TOTP"],
    })
    const mfaApp = workerAppCreate({ fetch: mfaNative.fetch, now: () => now })
    const mfa = await mfaApp.request(requestCreate(await cookieCreate()), undefined, bindings)
    expect(await mfa.clone().json()).toEqual({
      success: true,
      data: {
        kind: "render",
        route: `/login/mfa?flow=${flowHandle}`,
        screen: { name: "mfa", factors: ["AUTHENTICATION_METHOD_TYPE_TOTP"] },
        csrfToken: expect.any(String),
      },
    })

    const partialNative = nativeCreate({ postUserStatus: 503 })
    const partialApp = workerAppCreate({ fetch: partialNative.fetch, now: () => now })
    const partial = await partialApp.request(requestCreate(await cookieCreate()), undefined, bindings)
    expect(await partial.clone().json()).toEqual({
      success: true,
      data: { kind: "fallback", path: `/api/v2/flow/fallback?flow=${flowHandle}` },
    })
    const partialCookie = `__Host-zitadel-login-flow-${flowHandle}=${latestCookieValueGet(partial)}`
    const replay = await partialApp.request(requestCreate(partialCookie), undefined, bindings)
    expect(replay.status).toBe(409)
    expect(await replay.json()).toEqual({
      success: false,
      op: "passwordChangeRequired",
      errorMessage: "flow_replayed",
    })
    expect(partialNative.calls.filter((call) => call.url.endsWith("/password"))).toHaveLength(1)

    const fallback = await partialApp.request(
      `${origin}/api/v2/flow/fallback?flow=${flowHandle}`,
      { headers: { cookie: partialCookie } },
      bindings,
    )
    expect(fallback.status).toBe(302)
    expect(fallback.headers.get("location")).toBe(`${identityOrigin}/ui/v2/login?authRequest=request-1`)
  })

  test("rejects validation, stale binding, auth mismatch, CSRF, and rates before password mutation", async () => {
    const cases: Array<{
      name: string
      options?: NativeOptions
      payload?: Record<string, unknown>
      inputBindings?: WorkerBindingsInput
      state?: FlowV2Cookie
      collectRates?: boolean
    }> = [
      { name: "strict payload", payload: { currentPassword: "a", newPassword: "b", csrfToken, confirm: "b" } },
      { name: "csrf", payload: { currentPassword: "a", newPassword: "b", csrfToken: "C".repeat(43) } },
      { name: "auth mismatch", options: { authClientId: "other-client" } },
      { name: "session mismatch", options: { sessionOrganizationId: "other-org" } },
      { name: "requirement cleared", options: { explicit: false } },
      {
        name: "rate denied",
        inputBindings: { ...bindings, RATE_LIMITER: { limit: async () => ({ success: false }) } },
      },
      { name: "rate scopes", options: { authClientId: "other-client" }, collectRates: true },
      { name: "expired", state: { ...state, expiresAt: now - 1 } },
      {
        name: "terminal",
        state: { ...state, stage: "verified", transitionCounter: 2 } as Extract<FlowV2Cookie, { stage: "verified" }>,
      },
    ]

    for (const item of cases) {
      const native = nativeCreate(item.options)
      const keys: string[] = []
      const inputBindings =
        item.inputBindings || item.collectRates
          ? {
              ...(item.inputBindings ?? bindings),
              RATE_LIMITER: {
                limit: async ({ key: rateKey }: { key: string }) => {
                  keys.push(rateKey)
                  return { success: item.collectRates === true }
                },
              },
            }
          : bindings
      const app = workerAppCreate({ fetch: native.fetch, now: () => now })
      const response = await app.request(
        requestCreate(await cookieCreate(item.state), item.payload),
        undefined,
        inputBindings,
      )
      expect(response.status, item.name).toBeGreaterThanOrEqual(400)
      expect(
        native.calls.some((call) => call.url.endsWith("/password")),
        item.name,
      ).toBe(false)
      if (item.name.startsWith("rate")) {
        expect(keys).toHaveLength(item.collectRates ? 3 : 1)
        for (const rateKey of keys) {
          expect(rateKey).not.toContain(flowHandle)
          expect(rateKey).not.toContain("session-1")
          expect(rateKey).not.toContain("203.0.113.1")
        }
      }
    }
  })

  test("requires exact origin, JSON, and exact flow query before native requests", async () => {
    const native = nativeCreate()
    const app = workerAppCreate({ fetch: native.fetch, now: () => now })
    const cookie = await cookieCreate()
    const requests = [
      new Request(`${origin}/api/v2/password/change-required?flow=${flowHandle}`, {
        method: "POST",
        headers: { "content-type": "application/json", cookie },
        body: JSON.stringify({ currentPassword: "current", newPassword: "new", csrfToken }),
      }),
      new Request(`${origin}/api/v2/password/change-required?flow=${flowHandle}`, {
        method: "POST",
        headers: { origin, "content-type": "application/json-patch+json", cookie },
        body: JSON.stringify({ currentPassword: "current", newPassword: "new", csrfToken }),
      }),
      new Request(`${origin}/api/v2/password/change-required?flow=${flowHandle}&extra=1`, {
        method: "POST",
        headers: { origin, "content-type": "application/json", cookie },
        body: JSON.stringify({ currentPassword: "current", newPassword: "new", csrfToken }),
      }),
    ]

    for (const request of requests) {
      const response = await app.request(request, undefined, bindings)
      expect(response.status).toBeGreaterThanOrEqual(400)
    }
    expect(native.calls).toEqual([])
  })
})
