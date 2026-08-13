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

function nativeCreate() {
  const calls: Array<{ method: string; url: string }> = []
  const fetch = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const url = String(input)
    const method = init?.method ?? "GET"
    calls.push({ method, url })
    if (url === `${identityOrigin}/v2/oidc/auth_requests/request-1` && method === "GET") {
      return Response.json({
        authRequest: {
          id: "request-1",
          clientId: "client-1",
          redirectUri: "https://client.example/callback",
          scope: ["openid", "urn:zitadel:iam:org:id:org-1"],
          prompt: ["PROMPT_LOGIN"],
        },
      })
    }
    if (url.startsWith(`${identityOrigin}/v2/sessions/session-secret-id?`) && method === "GET") {
      return Response.json({
        session: {
          id: "session-secret-id",
          sessionToken: "latest-secret-session-token",
          expirationDate: "2027-01-15T08:15:00Z",
          factors: {
            user: { id: "user-secret-id", organizationId: "org-1" },
            password: { verifiedAt: "2027-01-15T08:00:00Z" },
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
        settings: { forceMfa: true, secondFactors: ["SECOND_FACTOR_TYPE_OTP"], multiFactors: [] },
      })
    }
    if (url === `${identityOrigin}/v2/users/user-secret-id/totp` && method === "POST") {
      return Response.json({
        uri: "otpauth://totp/ZITADEL:secret-person@example.com?secret=ABC234",
        secret: "ABC234",
      })
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

function enrollRequest(cookie: string, body: Record<string, unknown> = { method: "totp", csrfToken }) {
  return new Request(`${origin}/api/v2/mfa/otp/enroll?flow=${flowHandle}`, {
    method: "POST",
    headers: { origin, "content-type": "application/json", cookie },
    body: JSON.stringify(body),
  })
}

describe("POST /api/v2/mfa/otp/enroll", () => {
  test("returns bounded setup material and seals only the pending transition", async () => {
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
    const response = await app.request(enrollRequest(await cookieCreate()), undefined, bindings)

    expect(response.status).toBe(201)
    const text = await response.text()
    expect(JSON.parse(text)).toEqual({
      success: true,
      data: {
        provisioningUri: "otpauth://totp/ZITADEL:secret-person@example.com?secret=ABC234",
        secret: "ABC234",
        transition: {
          kind: "render",
          route: `/login/mfa?flow=${flowHandle}`,
          screen: { name: "mfa_totp_setup" },
          csrfToken,
        },
      },
    })
    for (const hidden of [
      "user-secret-id",
      "session-secret-id",
      "old-secret-session-token",
      "latest-secret-session-token",
      'secret-person@example.com","isVerified',
    ]) {
      expect(text).not.toContain(hidden)
      expect(JSON.stringify(logs)).not.toContain(hidden)
    }
    expect(JSON.stringify(logs)).not.toContain("ABC234")
    expect(JSON.stringify(logs)).not.toContain("secret-person@example.com")

    const cookieValue = response.headers.get("set-cookie")?.match(new RegExp(`${cookieName}=([^;]+)`))?.[1]
    expect(cookieValue).toBeTruthy()
    const opened = await flowV2CookieOpen(cookieValue!, flowHandle, [key], now)
    expect(opened.success).toBe(true)
    if (!opened.success) return
    expect(opened.data.stage).toBe("mfa_totp_setup")
    expect(opened.data.transitionCounter).toBe(3)
    expect(JSON.stringify(opened.data)).not.toContain("ABC234")
    expect(native.calls.filter((call) => call.method === "POST" && call.url.endsWith("/totp"))).toHaveLength(1)
  })

  test("rejects wrong-stage, replayed, expired, and malformed transitions before enrollment mutation", async () => {
    const native = nativeCreate()
    const app = workerAppCreate({ fetch: native.fetch, now: () => now })
    const { userId: _userId, sessionId: _sessionId, sessionToken: _token, mfaMethods: _methods, ...base } = mfaState
    const ready: FlowV2Cookie = { ...base, stage: "ready", delegable: false, owned: true }
    const wrong = await app.request(enrollRequest(await cookieCreate(ready)), undefined, bindings)
    expect(wrong.status).toBe(409)
    expect(await wrong.json()).toEqual({
      success: false,
      op: "mfaTotpEnrollmentStart",
      errorMessage: "flow_stage_invalid",
    })

    const pending: FlowV2Cookie = {
      ...mfaState,
      stage: "mfa_totp_setup",
      transitionCounter: 3,
      enrollmentStartedAt: now,
    }
    const replay = await app.request(enrollRequest(await cookieCreate(pending)), undefined, bindings)
    expect(replay.status).toBe(409)
    expect(await replay.json()).toEqual({
      success: false,
      op: "mfaTotpEnrollmentStart",
      errorMessage: "flow_replayed",
    })

    const expired = await app.request(
      enrollRequest(await cookieCreate({ ...mfaState, expiresAt: now })),
      undefined,
      bindings,
    )
    expect(expired.status).toBe(409)
    expect(await expired.json()).toEqual({
      success: false,
      op: "mfaTotpEnrollmentStart",
      errorMessage: "flow_expired",
    })

    const malformed = await app.request(
      enrollRequest(await cookieCreate(), { method: "sms_otp", csrfToken }),
      undefined,
      bindings,
    )
    expect(malformed.status).toBe(400)
    expect(await malformed.json()).toEqual({
      success: false,
      op: "mfaTotpEnrollmentStart",
      errorMessage: "invalid_payload",
    })
    expect(native.calls.some((call) => call.method === "POST" && call.url.endsWith("/totp"))).toBe(false)
  })
})
