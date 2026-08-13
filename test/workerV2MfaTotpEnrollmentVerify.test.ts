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
const setupState: Extract<FlowV2Cookie, { stage: "mfa_totp_setup" }> = {
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
  transitionCounter: 3,
  stage: "mfa_totp_setup",
  delegable: false,
  userId: "user-secret-id",
  sessionId: "session-secret-id",
  sessionToken: "initial-secret-token",
  mfaMethods: [],
  enrollmentStartedAt: now,
}

type NativeOptions = {
  authClientId?: string
  sessionOrganizationId?: string
  enrollmentStatus?: number
  sessionVerifyStatusAt?: number
}

function nativeCreate(options: NativeOptions = {}) {
  const calls: Array<{ method: string; url: string; body?: unknown }> = []
  let sessionGetCount = 0
  let methodsGetCount = 0
  let sessionVerifyCount = 0
  const fetch = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const url = String(input)
    const method = init?.method ?? "GET"
    const body = init?.body ? JSON.parse(String(init.body)) : undefined
    calls.push({ method, url, ...(body === undefined ? {} : { body }) })

    if (url === `${identityOrigin}/v2/oidc/auth_requests/request-1` && method === "GET") {
      return Response.json({
        authRequest: {
          id: "request-1",
          clientId: options.authClientId ?? "client-1",
          redirectUri: "https://client.example/callback",
          scope: ["openid", "urn:zitadel:iam:org:id:org-1"],
          prompt: ["PROMPT_LOGIN"],
        },
      })
    }
    if (url.startsWith(`${identityOrigin}/v2/sessions/session-secret-id?`) && method === "GET") {
      sessionGetCount += 1
      const postCheck = sessionGetCount >= 3
      return Response.json({
        session: {
          id: "session-secret-id",
          sessionToken: postCheck ? "post-policy-secret-token" : `preflight-secret-token-${sessionGetCount}`,
          expirationDate: "2027-01-15T08:15:00Z",
          factors: {
            user: {
              id: "user-secret-id",
              organizationId: options.sessionOrganizationId ?? "org-1",
            },
            password: { verifiedAt: "2027-01-15T08:00:00Z" },
            ...(postCheck ? { totp: { verifiedAt: "2027-01-15T08:01:00Z" } } : {}),
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
      methodsGetCount += 1
      return Response.json({
        authMethodTypes:
          methodsGetCount === 1
            ? ["AUTHENTICATION_METHOD_TYPE_PASSWORD"]
            : ["AUTHENTICATION_METHOD_TYPE_PASSWORD", "AUTHENTICATION_METHOD_TYPE_TOTP"],
      })
    }
    if (url === `${identityOrigin}/v2/settings/login` && method === "GET") {
      return Response.json({
        settings: { forceMfa: true, secondFactors: ["SECOND_FACTOR_TYPE_OTP"], multiFactors: [] },
      })
    }
    if (url === `${identityOrigin}/v2/users/user-secret-id/totp/verify` && method === "POST") {
      if (options.enrollmentStatus) {
        return Response.json({ nativeSecret: "must-not-leak" }, { status: options.enrollmentStatus })
      }
      return Response.json({ details: { sequence: "4", resourceOwner: "org-1" } })
    }
    if (url === `${identityOrigin}/v2/sessions/session-secret-id` && method === "PATCH") {
      sessionVerifyCount += 1
      if (options.sessionVerifyStatusAt === sessionVerifyCount) {
        return Response.json({ nativeSecret: "must-not-leak" }, { status: 503 })
      }
      return Response.json({ sessionToken: "checked-secret-token" })
    }
    throw new Error(`Unexpected request: ${method} ${url}`)
  }
  return { fetch, calls }
}

async function cookieCreate(state: FlowV2Cookie = setupState) {
  const sealed = await flowV2CookieSeal(state, key, new Uint8Array(12).fill(9))
  if (!sealed.success) throw new Error("Expected sealed flow")
  return `${cookieName}=${sealed.data}`
}

function verifyRequest(cookie: string, body: Record<string, unknown> = { code: "123456", csrfToken }) {
  return new Request(`${origin}/api/v2/mfa/otp/enroll/verify?flow=${flowHandle}`, {
    method: "POST",
    headers: { origin, "content-type": "application/json", cookie },
    body: JSON.stringify(body),
  })
}

function cookieValueGet(response: Response): string {
  const value = response.headers.get("set-cookie")?.match(new RegExp(`${cookieName}=([^;]+)`))?.[1]
  if (!value) throw new Error("Expected flow cookie")
  return value
}

describe("POST /api/v2/mfa/otp/enroll/verify", () => {
  test("returns only the completion transition and seals the latest Session token", async () => {
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
    const response = await app.request(verifyRequest(await cookieCreate()), undefined, bindings)

    expect(response.status).toBe(200)
    const text = await response.text()
    expect(JSON.parse(text)).toEqual({
      success: true,
      data: {
        transition: {
          kind: "complete",
          path: `/api/v2/flow/continue?flow=${flowHandle}`,
        },
      },
    })
    for (const hidden of [
      "123456",
      "user-secret-id",
      "session-secret-id",
      "initial-secret-token",
      "checked-secret-token",
      "post-policy-secret-token",
      "secret-person@example.com",
    ]) {
      expect(text).not.toContain(hidden)
      expect(JSON.stringify(logs)).not.toContain(hidden)
    }

    const opened = await flowV2CookieOpen(cookieValueGet(response), flowHandle, [key], now)
    expect(opened.success).toBe(true)
    if (!opened.success) return
    expect(opened.data.stage).toBe("verified")
    expect(opened.data.sessionToken).toBe("post-policy-secret-token")
  })

  test("rejects malformed code, bad CSRF, wrong stage, expiry, and replay before activation", async () => {
    const native = nativeCreate()
    const app = workerAppCreate({ fetch: native.fetch, now: () => now })

    const malformed = await app.request(
      verifyRequest(await cookieCreate(), { code: "12345", csrfToken }),
      undefined,
      bindings,
    )
    expect(malformed.status).toBe(400)

    const badCsrf = await app.request(
      verifyRequest(await cookieCreate(), { code: "123456", csrfToken: "C".repeat(43) }),
      undefined,
      bindings,
    )
    expect(badCsrf.status).toBe(403)

    const {
      userId: _userId,
      sessionId: _sessionId,
      sessionToken: _token,
      mfaMethods: _methods,
      enrollmentStartedAt: _enrollmentStartedAt,
      stage: _stage,
      delegable: _delegable,
      ...base
    } = setupState
    const wrongState: FlowV2Cookie = {
      ...base,
      stage: "ready",
      delegable: false,
      owned: true,
    }
    const wrong = await app.request(verifyRequest(await cookieCreate(wrongState)), undefined, bindings)
    expect(wrong.status).toBe(409)

    const expired = await app.request(
      verifyRequest(await cookieCreate({ ...setupState, expiresAt: now })),
      undefined,
      bindings,
    )
    expect(expired.status).toBe(409)

    const replayState: FlowV2Cookie = {
      ...base,
      stage: "verified",
      delegable: false,
      userId: setupState.userId,
      sessionId: setupState.sessionId,
      sessionToken: setupState.sessionToken,
    }
    const replay = await app.request(verifyRequest(await cookieCreate(replayState)), undefined, bindings)
    expect(replay.status).toBe(409)
    expect(await replay.json()).toEqual({
      success: false,
      op: "mfaTotpEnrollmentVerify",
      errorMessage: "flow_replayed",
    })
    expect(native.calls.some((call) => call.url.endsWith("/totp/verify"))).toBe(false)
  })

  test("rejects authorization-request and Session binding changes before native mutation", async () => {
    for (const options of [{ authClientId: "other-client" }, { sessionOrganizationId: "other-org" }]) {
      const native = nativeCreate(options)
      const app = workerAppCreate({
        fetch: native.fetch,
        now: () => now,
        logger: { warn: () => {}, error: () => {} },
      })
      const response = await app.request(verifyRequest(await cookieCreate()), undefined, bindings)

      expect(response.status).toBe(409)
      expect(native.calls.some((call) => call.url.endsWith("/totp/verify"))).toBe(false)
      expect(native.calls.some((call) => call.method === "PATCH")).toBe(false)
    }
  })

  test("seals recoverable enrolled TOTP after partial success and rejects setup replay", async () => {
    const native = nativeCreate({ sessionVerifyStatusAt: 1 })
    const app = workerAppCreate({
      fetch: native.fetch,
      now: () => now,
      randomBytes: (length) => new Uint8Array(length).fill(7),
      logger: { warn: () => {}, error: () => {} },
    })
    const partial = await app.request(verifyRequest(await cookieCreate()), undefined, bindings)

    expect(partial.status).toBe(200)
    expect(await partial.clone().json()).toEqual({
      success: true,
      data: {
        transition: {
          kind: "render",
          route: `/login/mfa?flow=${flowHandle}`,
          screen: { name: "mfa", factors: ["AUTHENTICATION_METHOD_TYPE_TOTP"] },
          csrfToken,
        },
      },
    })
    const partialValue = cookieValueGet(partial)
    const opened = await flowV2CookieOpen(partialValue, flowHandle, [key], now)
    expect(opened.success).toBe(true)
    if (!opened.success) return
    expect(opened.data.stage).toBe("mfa")
    expect(opened.data.mfaMethods).toEqual(["AUTHENTICATION_METHOD_TYPE_TOTP"])

    const partialCookie = `${cookieName}=${partialValue}`
    const replay = await app.request(verifyRequest(partialCookie), undefined, bindings)
    expect(replay.status).toBe(409)
    expect(native.calls.filter((call) => call.url.endsWith("/totp/verify"))).toHaveLength(1)

    const recovery = await app.request(
      new Request(`${origin}/api/v2/mfa/totp/verify?flow=${flowHandle}`, {
        method: "POST",
        headers: { origin, "content-type": "application/json", cookie: partialCookie },
        body: JSON.stringify({ code: "654321", csrfToken }),
      }),
      undefined,
      bindings,
    )
    expect(recovery.status).toBe(200)
    expect(await recovery.json()).toEqual({
      success: true,
      data: { kind: "complete", path: `/api/v2/flow/continue?flow=${flowHandle}` },
    })
  })

  test("returns bounded registration failure without changing setup state or leaking response data", async () => {
    const native = nativeCreate({ enrollmentStatus: 503 })
    const logs: Array<{ event: string; context?: Record<string, unknown> }> = []
    const app = workerAppCreate({
      fetch: native.fetch,
      now: () => now,
      logger: {
        warn: (event, context) => logs.push({ event, context }),
        error: (event, context) => logs.push({ event, context }),
      },
    })
    const response = await app.request(verifyRequest(await cookieCreate()), undefined, bindings)

    expect(response.status).toBe(503)
    const text = await response.text()
    expect(JSON.parse(text)).toEqual({
      success: false,
      op: "mfaTotpEnrollmentVerify",
      errorMessage: "enrollment_unavailable",
    })
    expect(response.headers.get("set-cookie")).toBeNull()
    expect(text).not.toContain("must-not-leak")
    expect(JSON.stringify(logs)).not.toContain("must-not-leak")
    expect(JSON.stringify(logs)).not.toContain("123456")
  })
})
