import { describe, expect, test } from "bun:test"

import type { WorkerBindingsInput } from "../src/config/workerBindingsSchema"
import { flowV2CookieSeal } from "../src/flow/domain/flowV2CookieSeal"
import type { FlowV2Cookie } from "../src/flow/model/flowV2CookieSchema"
import { recentAccountCookieOpen } from "../src/session/domain/recentAccountCookieOpen"
import { workerAppCreate } from "../src/worker/workerAppCreate"

const origin = "https://login.example"
const identityOrigin = "https://identity.example"
const flowKey = "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA"
const accountKey = "C".repeat(43)
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
  FLOW_COOKIE_KEY: flowKey,
  RECENT_ACCOUNT_COOKIE_KEY: accountKey,
  ZITADEL_CUSTOM_LOGIN_ENABLED: "true",
  ZITADEL_RECENT_ACCOUNT_V2_ENABLED: "true",
  RATE_LIMITER: { limit: async () => ({ success: true }) },
}

const authRequest = {
  id: "request-1",
  clientId: "client-1",
  redirectUri: "https://client.example/callback",
  scope: ["openid", "urn:zitadel:iam:org:id:org-1"],
  prompt: ["PROMPT_LOGIN"],
}

async function flowCookieCreate(token = "session-token") {
  const state: Extract<FlowV2Cookie, { stage: "verified" }> = {
    version: 2,
    flowHandle,
    requestKind: "oidc",
    authRequestId: authRequest.id,
    clientId: authRequest.clientId,
    redirectUri: authRequest.redirectUri,
    organizationId: "org-1",
    prompt: ["PROMPT_LOGIN"],
    csrfToken: "B".repeat(43),
    issuedAt: now,
    expiresAt: now + 900,
    transitionCounter: 1,
    stage: "verified",
    delegable: false,
    userId: "user-1",
    sessionId: "session-1",
    sessionToken: token,
  }
  const sealed = await flowV2CookieSeal(state, flowKey, new Uint8Array(12).fill(2))
  if (!sealed.success) throw new Error("Expected flow cookie to seal")
  return `__Host-zitadel-login-flow-${flowHandle}=${sealed.data}`
}

function nativeCreate(callbackStatus = 200) {
  const fetch = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const url = String(input)
    if (url === `${identityOrigin}/v2/oidc/auth_requests/${authRequest.id}` && (init?.method ?? "GET") === "GET") {
      return Response.json({ authRequest })
    }
    if (
      url === `${identityOrigin}/v2/sessions/session-1?sessionToken=session-token` &&
      (init?.method ?? "GET") === "GET"
    ) {
      return Response.json({
        session: {
          id: "session-1",
          expirationDate: "2028-01-01T00:00:00Z",
          factors: {
            user: { id: "user-1", organizationId: "org-1" },
            password: { verifiedAt: "2026-08-11T00:00:00Z" },
          },
        },
      })
    }
    if (url === `${identityOrigin}/v2/oidc/auth_requests/${authRequest.id}` && init?.method === "POST") {
      if (callbackStatus !== 200) return Response.json({ error: "callback failed" }, { status: callbackStatus })
      return Response.json({ callbackUrl: "https://client.example/callback?code=credential&state=opaque" })
    }
    throw new Error(`Unexpected native request: ${init?.method ?? "GET"} ${url}`)
  }
  return fetch
}

describe("Worker recent-account persistence", () => {
  test("writes an encrypted host-only cookie after successful continuation without exposing token data", async () => {
    const app = workerAppCreate({
      fetch: nativeCreate(),
      now: () => now,
      randomBytes: (length) => new Uint8Array(length).fill(3),
    })
    const response = await app.request(
      `${origin}/api/v2/flow/continue?flow=${flowHandle}`,
      { headers: { cookie: await flowCookieCreate() } },
      bindings,
    )

    expect(response.status).toBe(302)
    expect(response.headers.get("location")).not.toContain("session-token")
    const setCookie = response.headers.get("set-cookie") ?? ""
    expect(setCookie).toContain("__Host-zitadel-login-accounts=")
    expect(setCookie).toContain("Path=/; Max-Age=")
    expect(setCookie).toContain("HttpOnly; Secure; SameSite=Lax")
    const match = setCookie.match(/__Host-zitadel-login-accounts=([^;]+)/)
    expect(match?.[1]).toBeTruthy()
    expect(match?.[1]).not.toContain("session-token")
    const opened = await recentAccountCookieOpen(match![1]!, [accountKey], now)
    expect(opened).toEqual(
      expect.objectContaining({
        success: true,
        data: expect.objectContaining({
          accounts: [
            expect.objectContaining({ userId: "user-1", sessionId: "session-1", sessionToken: "session-token" }),
          ],
        }),
      }),
    )
    expect(JSON.stringify(await response.clone().text())).not.toContain("session-token")
  })

  test("does not write the recent-account cookie when native authorization continuation fails", async () => {
    const app = workerAppCreate({ fetch: nativeCreate(500), now: () => now })
    const response = await app.request(
      `${origin}/api/v2/flow/continue?flow=${flowHandle}`,
      { headers: { cookie: await flowCookieCreate() } },
      bindings,
    )

    expect(response.status).toBe(502)
    expect(await response.json()).toEqual({ success: false, op: "flowContinue", errorMessage: "callback_unavailable" })
    expect(response.headers.get("set-cookie") ?? "").not.toContain("__Host-zitadel-login-accounts=")
    expect(JSON.stringify(await response.clone().text())).not.toContain("session-token")
  })

  test("ignores a malformed prior account cookie and replaces it after success", async () => {
    const app = workerAppCreate({ fetch: nativeCreate(), now: () => now })
    const response = await app.request(
      `${origin}/api/v2/flow/continue?flow=${flowHandle}`,
      { headers: { cookie: `${await flowCookieCreate()}; __Host-zitadel-login-accounts=malformed` } },
      bindings,
    )
    expect(response.status).toBe(302)
    expect(response.headers.get("set-cookie") ?? "").toContain("__Host-zitadel-login-accounts=")
  })
})
