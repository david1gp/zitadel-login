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
  csrfToken: "B".repeat(43),
  issuedAt: now,
  expiresAt: now + 900,
  transitionCounter: 2,
  stage: "mfa",
  delegable: false,
  userId: "user-secret-id",
  sessionId: "session-secret-id",
  sessionToken: "old-secret-session-token",
  mfaMethods: ["AUTHENTICATION_METHOD_TYPE_TOTP"],
}

async function cookieCreate(state: FlowV2Cookie) {
  const sealed = await flowV2CookieSeal(state, key, new Uint8Array(12).fill(9))
  if (!sealed.success) throw new Error("Expected sealed flow")
  return `${cookieName}=${sealed.data}`
}

function nativeCreate(options: { sessionStatus?: number } = {}) {
  const calls: Array<{ method: string; url: string }> = []
  const fetch = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const url = String(input)
    const method = init?.method ?? "GET"
    calls.push({ method, url })
    if (url === `${identityOrigin}/v2/oidc/auth_requests/request-1`) {
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
    if (url.startsWith(`${identityOrigin}/v2/sessions/session-secret-id?`)) {
      if (options.sessionStatus) return Response.json({}, { status: options.sessionStatus })
      return Response.json({
        session: {
          id: "session-secret-id",
          sessionToken: "latest-secret-session-token",
          factors: {
            user: { id: "user-secret-id", organizationId: "org-1" },
            password: { verifiedAt: "2026-08-11T12:00:00Z" },
          },
        },
      })
    }
    if (url === `${identityOrigin}/v2/users/user-secret-id`) {
      return Response.json({
        user: {
          userId: "user-secret-id",
          state: "USER_STATE_ACTIVE",
          details: { resourceOwner: "org-1" },
          human: { email: { email: "secret-person@example.com", isVerified: true } },
        },
      })
    }
    if (url === `${identityOrigin}/v2/users/user-secret-id/authentication_methods`) {
      return Response.json({
        authMethodTypes: ["AUTHENTICATION_METHOD_TYPE_PASSWORD", "AUTHENTICATION_METHOD_TYPE_TOTP"],
      })
    }
    if (url === `${identityOrigin}/v2/settings/login`) {
      return Response.json({ settings: { forceMfa: true, secondFactors: ["SECOND_FACTOR_TYPE_OTP"] } })
    }
    throw new Error(`Unexpected request: ${method} ${url}`)
  }
  return { fetch, calls }
}

describe("GET /api/v2/mfa/options", () => {
  test("refreshes an encrypted MFA flow and returns only a strict display-safe projection", async () => {
    const native = nativeCreate()
    const app = workerAppCreate({
      fetch: native.fetch,
      now: () => now,
      randomBytes: (length) => new Uint8Array(length).fill(7),
      logger: { warn: () => {}, error: () => {} },
    })
    const response = await app.request(
      `${origin}/api/v2/mfa/options?flow=${flowHandle}`,
      { headers: { cookie: await cookieCreate(mfaState) } },
      bindings,
    )

    expect(response.status).toBe(200)
    expect(response.headers.get("cache-control")).toBe("no-store")
    const body = await response.clone().json()
    expect(body).toEqual({ success: true, data: { mode: "check", method: { type: "totp" } } })
    const serialized = JSON.stringify(body)
    for (const secret of [
      "user-secret-id",
      "session-secret-id",
      "old-secret-session-token",
      "latest-secret-session-token",
      "secret-person@example.com",
      "AUTHENTICATION_METHOD_TYPE_TOTP",
    ]) {
      expect(serialized).not.toContain(secret)
    }
    expect(native.calls.every((call) => call.method === "GET")).toBe(true)

    const setCookie = response.headers.get("set-cookie")
    expect(setCookie).toContain("HttpOnly")
    expect(setCookie).toContain("Secure")
    const value = setCookie?.split(";", 1)[0]?.slice(cookieName.length + 1) ?? ""
    const opened = await flowV2CookieOpen(value, flowHandle, [key], now)
    expect(opened.success).toBe(true)
    if (opened.success && opened.data.stage === "mfa") {
      expect(opened.data.sessionToken).toBe("latest-secret-session-token")
    }
  })

  test("rejects stale, wrong-stage, and malformed encrypted Sessions safely", async () => {
    const staleNative = nativeCreate({ sessionStatus: 401 })
    const staleApp = workerAppCreate({ fetch: staleNative.fetch, now: () => now })
    const stale = await staleApp.request(
      `${origin}/api/v2/mfa/options?flow=${flowHandle}`,
      { headers: { cookie: await cookieCreate(mfaState) } },
      bindings,
    )
    expect(stale.status).toBe(409)
    expect(await stale.json()).toEqual({ success: false, op: "mfaOptions", errorMessage: "session_stale" })

    const {
      userId: _userId,
      sessionId: _sessionId,
      sessionToken: _sessionToken,
      mfaMethods: _methods,
      ...base
    } = mfaState
    const readyState: FlowV2Cookie = { ...base, stage: "ready", delegable: false, owned: true }
    const wrongStage = await staleApp.request(
      `${origin}/api/v2/mfa/options?flow=${flowHandle}`,
      { headers: { cookie: await cookieCreate(readyState) } },
      bindings,
    )
    expect(wrongStage.status).toBe(409)
    expect(await wrongStage.json()).toEqual({ success: false, op: "mfaOptions", errorMessage: "flow_stage_invalid" })

    const malformed = await staleApp.request(
      `${origin}/api/v2/mfa/options?flow=${flowHandle}`,
      { headers: { cookie: `${cookieName}=malformed` } },
      bindings,
    )
    expect(malformed.status).toBe(409)
    expect(await malformed.json()).toEqual({ success: false, op: "mfaOptions", errorMessage: "flow_invalid" })
  })
})
