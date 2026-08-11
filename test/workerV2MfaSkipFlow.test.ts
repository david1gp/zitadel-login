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
const cookieName = `__Host-zitadel-login-flow-${flowHandle}`
const csrfToken = "B".repeat(43)
const verifiedAt = "2027-01-15T08:00:00Z"

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

const mfaState: Extract<FlowV2Cookie, { stage: "mfa" }> = {
  version: 2,
  flowHandle,
  requestKind: "oidc",
  authRequestId: "request-1",
  clientId: "client-1",
  redirectUri: "https://client.example/callback",
  organizationId: "org-1",
  prompt: ["PROMPT_LOGIN"],
  csrfToken,
  issuedAt: now,
  expiresAt: now + 900,
  transitionCounter: 2,
  stage: "mfa",
  delegable: false,
  userId: "user-secret-id",
  sessionId: "session-secret-id",
  sessionToken: "old-secret-session-token",
  mfaMethods: [],
}

type NativeOptions = {
  forceMfa?: boolean
  callbackStatus?: number
}

function nativeCreate(options: NativeOptions = {}) {
  const calls: Array<{ method: string; url: string; body?: unknown }> = []
  const fetch = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const url = String(input)
    const method = init?.method ?? "GET"
    const body = init?.body ? JSON.parse(String(init.body)) : undefined
    calls.push({ method, url, ...(body === undefined ? {} : { body }) })

    if (url === `${identityOrigin}/v2/oidc/auth_requests/request-1` && method === "GET") {
      return Response.json({ authRequest })
    }
    if (url.startsWith(`${identityOrigin}/v2/sessions/session-secret-id?`) && method === "GET") {
      return Response.json({
        session: {
          id: "session-secret-id",
          sessionToken: "latest-secret-session-token",
          expirationDate: "2027-01-15T08:15:00Z",
          factors: {
            user: { id: "user-secret-id", organizationId: "org-1" },
            password: { verifiedAt },
          },
        },
      })
    }
    if (url === `${identityOrigin}/v2/users/user-secret-id` && method === "GET") {
      return Response.json({
        user: {
          userId: "user-secret-id",
          state: "USER_STATE_ACTIVE",
          details: { resourceOwner: "org-1" },
          human: { email: { email: "secret-person@example.com", isVerified: true } },
        },
      })
    }
    if (url === `${identityOrigin}/v2/users/user-secret-id/authentication_methods` && method === "GET") {
      return Response.json({ authMethodTypes: ["AUTHENTICATION_METHOD_TYPE_PASSWORD"] })
    }
    if (url === `${identityOrigin}/v2/settings/login` && method === "GET") {
      return Response.json({
        settings: {
          forceMfa: options.forceMfa ?? false,
          secondFactors: ["SECOND_FACTOR_TYPE_OTP"],
          multiFactors: [],
        },
      })
    }
    if (url === `${identityOrigin}/v2/users/user-secret-id/mfa_init_skipped` && method === "POST") {
      return Response.json({ details: { changeDate: "2027-01-15T08:00:00Z" } })
    }
    if (url === `${identityOrigin}/v2/oidc/auth_requests/request-1` && method === "POST") {
      if (options.callbackStatus) return Response.json({}, { status: options.callbackStatus })
      return Response.json({ callbackUrl: "https://client.example/callback?code=secret-oauth-code" })
    }
    throw new Error(`Unexpected request: ${method} ${url}`)
  }
  return { fetch, calls }
}

async function cookieCreate(state: FlowV2Cookie = mfaState) {
  const sealed = await flowV2CookieSeal(state, key, new Uint8Array(12).fill(9))
  if (!sealed.success) throw new Error("Expected sealed flow")
  return `${cookieName}=${sealed.data}`
}

function skipRequest(cookie: string, body: Record<string, unknown> = { csrfToken }) {
  return new Request(`${origin}/api/v2/mfa/skip?flow=${flowHandle}`, {
    method: "POST",
    headers: { origin, "content-type": "application/json", cookie },
    body: JSON.stringify(body),
  })
}

function responseFlowCookieGet(response: Response): string {
  const value = response.headers.get("set-cookie")?.match(new RegExp(`${cookieName}=([^;]+)`))?.[1]
  if (!value) throw new Error("Expected flow cookie")
  return `${cookieName}=${value}`
}

async function verifiedCookieCreate(app: ReturnType<typeof workerAppCreate>) {
  const response = await app.request(skipRequest(await cookieCreate()), undefined, bindings)
  expect(response.status).toBe(200)
  return responseFlowCookieGet(response)
}

describe("POST /api/v2/mfa/skip", () => {
  test("records one optional setup skip and returns only a safe completion transition", async () => {
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
    const response = await app.request(skipRequest(await cookieCreate()), undefined, bindings)

    expect(response.status).toBe(200)
    const text = await response.text()
    expect(JSON.parse(text)).toEqual({
      success: true,
      data: { kind: "complete", path: `/api/v2/flow/continue?flow=${flowHandle}` },
    })
    for (const secret of [
      "user-secret-id",
      "session-secret-id",
      "old-secret-session-token",
      "latest-secret-session-token",
      "secret-person@example.com",
      "AUTHENTICATION_METHOD_TYPE_PASSWORD",
    ]) {
      expect(text).not.toContain(secret)
      expect(JSON.stringify(logs)).not.toContain(secret)
    }

    const skipCalls = native.calls.filter((call) => call.url.endsWith("/mfa_init_skipped"))
    expect(skipCalls).toEqual([
      {
        method: "POST",
        url: `${identityOrigin}/v2/users/user-secret-id/mfa_init_skipped`,
        body: {},
      },
    ])
    const opened = await flowV2CookieOpen(responseFlowCookieGet(response).split("=")[1]!, flowHandle, [key], now)
    expect(opened.success).toBe(true)
    if (!opened.success || opened.data.stage !== "verified") return
    expect(opened.data.sessionToken).toBe("latest-secret-session-token")
    expect(opened.data.transitionCounter).toBe(3)

    const continuation = await app.request(
      `${origin}/api/v2/flow/continue?flow=${flowHandle}`,
      { headers: { cookie: responseFlowCookieGet(response) } },
      bindings,
    )
    expect(continuation.status).toBe(302)
    expect(continuation.headers.get("location")).toBe("https://client.example/callback?code=secret-oauth-code")
    expect(native.calls.find((call) => call.method === "POST" && call.url.endsWith("/request-1"))?.body).toEqual({
      session: { sessionId: "session-secret-id", sessionToken: "latest-secret-session-token" },
    })
  })

  test("rejects forced setup without recording a skip", async () => {
    const native = nativeCreate({ forceMfa: true })
    const app = workerAppCreate({ fetch: native.fetch, now: () => now })
    const response = await app.request(skipRequest(await cookieCreate()), undefined, bindings)

    expect(response.status).toBe(403)
    expect(await response.json()).toEqual({ success: false, op: "mfaSkip", errorMessage: "mfa_skip_forbidden" })
    expect(native.calls.some((call) => call.url.endsWith("/mfa_init_skipped"))).toBe(false)
  })

  test("enforces strict payload, CSRF, stage, expiry, replay, and rate limit boundaries", async () => {
    const native = nativeCreate()
    const app = workerAppCreate({ fetch: native.fetch, now: () => now })

    const strict = await app.request(
      skipRequest(await cookieCreate(), { csrfToken, userId: "attacker-selected-user" }),
      undefined,
      bindings,
    )
    expect(strict.status).toBe(400)
    expect(await strict.json()).toEqual({ success: false, op: "mfaSkip", errorMessage: "invalid_payload" })

    const csrf = await app.request(
      skipRequest(await cookieCreate(), { csrfToken: "C".repeat(43) }),
      undefined,
      bindings,
    )
    expect(csrf.status).toBe(403)
    expect(await csrf.json()).toEqual({ success: false, op: "mfaSkip", errorMessage: "csrf_rejected" })

    const {
      userId: _userId,
      sessionId: _sessionId,
      sessionToken: _sessionToken,
      mfaMethods: _methods,
      ...base
    } = mfaState
    const ready: FlowV2Cookie = { ...base, stage: "ready", delegable: false, owned: true }
    const wrongStage = await app.request(skipRequest(await cookieCreate(ready)), undefined, bindings)
    expect(wrongStage.status).toBe(409)
    expect(await wrongStage.json()).toEqual({ success: false, op: "mfaSkip", errorMessage: "flow_stage_invalid" })

    const verified: FlowV2Cookie = {
      ...base,
      stage: "verified",
      delegable: false,
      userId: "user-secret-id",
      sessionId: "session-secret-id",
      sessionToken: "latest-secret-session-token",
    }
    const replay = await app.request(skipRequest(await cookieCreate(verified)), undefined, bindings)
    expect(replay.status).toBe(409)
    expect(await replay.json()).toEqual({ success: false, op: "mfaSkip", errorMessage: "flow_replayed" })

    const expired = await app.request(
      skipRequest(await cookieCreate({ ...mfaState, expiresAt: now })),
      undefined,
      bindings,
    )
    expect(expired.status).toBe(409)
    expect(await expired.json()).toEqual({ success: false, op: "mfaSkip", errorMessage: "flow_expired" })

    const limitedBindings: WorkerBindingsInput = {
      ...bindings,
      RATE_LIMITER: { limit: async () => ({ success: false }) },
    }
    const limited = await app.request(skipRequest(await cookieCreate()), undefined, limitedBindings)
    expect(limited.status).toBe(429)
    expect(limited.headers.get("retry-after")).toBe("60")
    expect(await limited.json()).toEqual({ success: false, op: "mfaSkip", errorMessage: "rate_limited" })
  })

  test("preserves verified state for callback retry and rejects a native callback replay", async () => {
    const failedNative = nativeCreate({ callbackStatus: 500 })
    const failedApp = workerAppCreate({ fetch: failedNative.fetch, now: () => now })
    const failedCookie = await verifiedCookieCreate(failedApp)
    const failed = await failedApp.request(
      `${origin}/api/v2/flow/continue?flow=${flowHandle}`,
      { headers: { cookie: failedCookie } },
      bindings,
    )
    expect(failed.status).toBe(502)
    expect(await failed.json()).toEqual({ success: false, op: "flowContinue", errorMessage: "callback_unavailable" })
    expect(failed.headers.get("set-cookie")).toBeNull()

    const replayNative = nativeCreate({ callbackStatus: 409 })
    const replayApp = workerAppCreate({ fetch: replayNative.fetch, now: () => now })
    const replayCookie = await verifiedCookieCreate(replayApp)
    const replay = await replayApp.request(
      `${origin}/api/v2/flow/continue?flow=${flowHandle}`,
      { headers: { cookie: replayCookie } },
      bindings,
    )
    expect(replay.status).toBe(409)
    expect(await replay.json()).toEqual({ success: false, op: "flowContinue", errorMessage: "flow_replayed" })
    expect(replay.headers.get("set-cookie")).toContain("Max-Age=0")
  })
})
