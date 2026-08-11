import { describe, expect, test } from "bun:test"

import type { WorkerBindingsInput } from "../src/config/workerBindingsSchema"
import { flowV2CookieSeal } from "../src/flow/domain/flowV2CookieSeal"
import type { FlowV2Cookie } from "../src/flow/model/flowV2CookieSchema"
import { opaqueAccountIdCreate } from "../src/session/domain/opaqueAccountIdCreate"
import { recentAccountCookieOpen } from "../src/session/domain/recentAccountCookieOpen"
import { recentAccountCookieSeal } from "../src/session/domain/recentAccountCookieSeal"
import type { RecentAccount } from "../src/session/model/recentAccountCookieSchema"
import { workerAppCreate } from "../src/worker/workerAppCreate"

const origin = "https://login.example"
const identityOrigin = "https://identity.example"
const flowKey = "A".repeat(43)
const accountKey = "C".repeat(43)
const now = 1_800_000_000
const flowHandle = "AAAAAAAAAAAAAAAAAAAAAA"
const csrfToken = "B".repeat(43)

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
  ZITADEL_LOGIN_V2_ENABLED: "true",
  ZITADEL_RECENT_ACCOUNT_V2_ENABLED: "true",
  RATE_LIMITER: { limit: async () => ({ success: true }) },
}

const authRequest = {
  id: "request-1",
  clientId: "client-1",
  redirectUri: "https://client.example/callback",
  scope: ["openid", "urn:zitadel:iam:org:id:org-1"],
  prompt: ["PROMPT_SELECT_ACCOUNT"],
}

function account(overrides: Partial<RecentAccount> = {}): RecentAccount {
  return {
    userId: "user-1",
    sessionId: "session-1",
    sessionToken: "token-1",
    organizationId: "org-1",
    authAt: now - 100,
    lastUsedAt: now - 50,
    expiresAt: now + 3600,
    ...overrides,
  }
}

async function flowCookieCreate(
  overrides: Partial<Extract<FlowV2Cookie, { stage: "ready" } | { stage: "verified" }>> = {},
) {
  const state: FlowV2Cookie = {
    version: 2,
    flowHandle,
    requestKind: "oidc",
    authRequestId: authRequest.id,
    clientId: authRequest.clientId,
    redirectUri: authRequest.redirectUri,
    organizationId: "org-1",
    prompt: ["PROMPT_SELECT_ACCOUNT"],
    csrfToken,
    issuedAt: now,
    expiresAt: now + 900,
    transitionCounter: 0,
    stage: "ready",
    delegable: true,
    owned: true,
    ...overrides,
  }
  const sealed = await flowV2CookieSeal(state, flowKey, new Uint8Array(12).fill(2))
  if (!sealed.success) throw new Error("Expected flow cookie to seal")
  return `__Host-zitadel-login-flow-${flowHandle}=${sealed.data}`
}

async function sealAccountCookie(accounts: RecentAccount[], key = accountKey): Promise<string> {
  const cookie = {
    version: 1 as const,
    issuedAt: now,
    expiresAt: now + 3600,
    accounts,
  }
  const result = await recentAccountCookieSeal(cookie, key, new Uint8Array(12).fill(1))
  if (!result.success) throw new Error("Failed to seal account cookie")
  return result.data
}

function nativeFetch(
  overrides: { sessionGet?: (url: string) => any; userGet?: (url: string) => any; callbackStatus?: number } = {},
) {
  return async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const url = String(input)
    if (url === `${identityOrigin}/v2/oidc/auth_requests/${authRequest.id}` && (init?.method ?? "GET") === "GET") {
      return Response.json({ authRequest })
    }
    if (url.startsWith(`${identityOrigin}/v2/sessions/session-1`)) {
      if (overrides.sessionGet) return overrides.sessionGet(url)
      return Response.json({
        session: {
          id: "session-1",
          sessionToken: "token-1",
          expirationDate: "2028-01-01T00:00:00Z",
          factors: {
            user: { id: "user-1", organizationId: "org-1" },
          },
        },
      })
    }
    if (url.startsWith(`${identityOrigin}/v2/sessions/session-2`)) {
      return Response.json({
        session: {
          id: "session-2",
          sessionToken: "token-2",
          expirationDate: "2028-01-01T00:00:00Z",
          factors: {
            user: { id: "user-2", organizationId: "org-1" },
          },
        },
      })
    }
    if (url === `${identityOrigin}/v2/users/user-1`) {
      if (overrides.userGet) return overrides.userGet(url)
      return Response.json({
        user: {
          userId: "user-1",
          state: "USER_STATE_ACTIVE",
          preferredLoginName: "alice@example.com",
          human: { profile: { displayName: "Alice Smith" } },
        },
      })
    }
    if (url === `${identityOrigin}/v2/users/user-2`) {
      return Response.json({
        user: {
          userId: "user-2",
          state: "USER_STATE_ACTIVE",
          preferredLoginName: "bob@example.com",
          human: { profile: { displayName: "Bob Jones" } },
        },
      })
    }
    if (url === `${identityOrigin}/v2/oidc/auth_requests/${authRequest.id}` && init?.method === "POST") {
      if (overrides.callbackStatus && overrides.callbackStatus !== 200) {
        return Response.json({ error: "callback failed" }, { status: overrides.callbackStatus })
      }
      return Response.json({ callbackUrl: "https://client.example/callback?code=credential&state=opaque" })
    }
    throw new Error(`Unexpected native request: ${init?.method ?? "GET"} ${url}`)
  }
}

function cookieHeaderFromResponse(res: Response): string {
  const setCookies = res.headers.getSetCookie ? res.headers.getSetCookie() : [res.headers.get("set-cookie") ?? ""]
  return setCookies
    .map((header) => header.split(";")[0])
    .filter((item): item is string => Boolean(item))
    .join("; ")
}

describe("POST /api/v2/session/continue endpoint integration tests", () => {
  test("immediate completion on valid selection", async () => {
    const acc = account()
    const opaqueId = await opaqueAccountIdCreate(accountKey, acc.sessionId, acc.userId)
    const cookies = `${await flowCookieCreate()}; __Host-zitadel-login-accounts=${await sealAccountCookie([acc])}`

    const app = workerAppCreate({ fetch: nativeFetch(), now: () => now })
    const res = await app.request(
      `${origin}/api/v2/session/continue?flow=${flowHandle}`,
      {
        method: "POST",
        headers: { "content-type": "application/json", origin, cookie: cookies },
        body: JSON.stringify({ accountId: opaqueId, csrfToken }),
      },
      bindings,
    )

    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json).toEqual({
      success: true,
      data: {
        kind: "complete",
        path: `/api/v2/flow/continue?flow=${flowHandle}`,
      },
    })

    const cookieHeader = cookieHeaderFromResponse(res)
    expect(cookieHeader).toContain("__Host-zitadel-login-accounts=")
    expect(cookieHeader).toContain("__Host-zitadel-login-flow-")

    const continueRes = await app.request(
      `${origin}/api/v2/flow/continue?flow=${flowHandle}`,
      { headers: { cookie: cookieHeader } },
      bindings,
    )
    expect(continueRes.status).toBe(302)
    expect(continueRes.headers.get("location")).toBe("https://client.example/callback?code=credential&state=opaque")
  })

  test("prompt-login reauthentication transition", async () => {
    const acc = account()
    const opaqueId = await opaqueAccountIdCreate(accountKey, acc.sessionId, acc.userId)
    const cookies = `${await flowCookieCreate({ prompt: ["PROMPT_LOGIN"] })}; __Host-zitadel-login-accounts=${await sealAccountCookie([acc])}`

    const app = workerAppCreate({ fetch: nativeFetch(), now: () => now })
    const res = await app.request(
      `${origin}/api/v2/session/continue?flow=${flowHandle}`,
      {
        method: "POST",
        headers: { "content-type": "application/json", origin, cookie: cookies },
        body: JSON.stringify({ accountId: opaqueId, csrfToken }),
      },
      bindings,
    )

    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json).toEqual({
      success: true,
      data: {
        kind: "render",
        route: `/login/email-otp?flow=${flowHandle}`,
        screen: {
          name: "email_otp_start",
          loginHint: "alice@example.com",
        },
        csrfToken,
      },
    })
  })

  test("max-age reauthentication transition", async () => {
    const acc = account({ authAt: now - 600 })
    const opaqueId = await opaqueAccountIdCreate(accountKey, acc.sessionId, acc.userId)
    const cookies = `${await flowCookieCreate({ maxAgeSeconds: 300 })}; __Host-zitadel-login-accounts=${await sealAccountCookie([acc])}`

    const app = workerAppCreate({ fetch: nativeFetch(), now: () => now })
    const res = await app.request(
      `${origin}/api/v2/session/continue?flow=${flowHandle}`,
      {
        method: "POST",
        headers: { "content-type": "application/json", origin, cookie: cookies },
        body: JSON.stringify({ accountId: opaqueId, csrfToken }),
      },
      bindings,
    )

    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json.success).toBe(true)
    expect(json.data.kind).toBe("render")
  })

  test("login / user / org hint mismatch returns 401 account_invalid", async () => {
    const acc = account()
    const opaqueId = await opaqueAccountIdCreate(accountKey, acc.sessionId, acc.userId)

    const app = workerAppCreate({ fetch: nativeFetch(), now: () => now })

    const resHint = await app.request(
      `${origin}/api/v2/session/continue?flow=${flowHandle}`,
      {
        method: "POST",
        headers: {
          "content-type": "application/json",
          origin,
          cookie: `${await flowCookieCreate({ loginHint: "wrong@example.com" })}; __Host-zitadel-login-accounts=${await sealAccountCookie([acc])}`,
        },
        body: JSON.stringify({ accountId: opaqueId, csrfToken }),
      },
      bindings,
    )
    expect(resHint.status).toBe(401)
    expect(await resHint.json()).toEqual({ success: false, op: "sessionContinue", errorMessage: "account_invalid" })

    const resUserHint = await app.request(
      `${origin}/api/v2/session/continue?flow=${flowHandle}`,
      {
        method: "POST",
        headers: {
          "content-type": "application/json",
          origin,
          cookie: `${await flowCookieCreate({ hintUserId: "user-2" })}; __Host-zitadel-login-accounts=${await sealAccountCookie([acc])}`,
        },
        body: JSON.stringify({ accountId: opaqueId, csrfToken }),
      },
      bindings,
    )
    expect(resUserHint.status).toBe(401)
    expect(await resUserHint.json()).toEqual({ success: false, op: "sessionContinue", errorMessage: "account_invalid" })
  })

  test("stale session / token returns 401 account_invalid and cleans up cookie", async () => {
    const acc = account()
    const opaqueId = await opaqueAccountIdCreate(accountKey, acc.sessionId, acc.userId)
    const cookies = `${await flowCookieCreate()}; __Host-zitadel-login-accounts=${await sealAccountCookie([acc])}`

    const app = workerAppCreate({
      fetch: nativeFetch({
        sessionGet: () => Response.json({ error: "not_found" }, { status: 404 }),
      }),
      now: () => now,
    })

    const res = await app.request(
      `${origin}/api/v2/session/continue?flow=${flowHandle}`,
      {
        method: "POST",
        headers: { "content-type": "application/json", origin, cookie: cookies },
        body: JSON.stringify({ accountId: opaqueId, csrfToken }),
      },
      bindings,
    )

    expect(res.status).toBe(401)
    expect(await res.json()).toEqual({ success: false, op: "sessionContinue", errorMessage: "account_invalid" })
    const setCookie = res.headers.get("set-cookie") ?? ""
    expect(setCookie).toContain("__Host-zitadel-login-accounts=")
    expect(setCookie).toContain("Max-Age=0")
  })

  test("inactive user returns 401 account_invalid and cleans up cookie", async () => {
    const acc = account()
    const opaqueId = await opaqueAccountIdCreate(accountKey, acc.sessionId, acc.userId)
    const cookies = `${await flowCookieCreate()}; __Host-zitadel-login-accounts=${await sealAccountCookie([acc])}`

    const app = workerAppCreate({
      fetch: nativeFetch({
        userGet: () => Response.json({ user: { userId: "user-1", state: "USER_STATE_INACTIVE" } }),
      }),
      now: () => now,
    })

    const res = await app.request(
      `${origin}/api/v2/session/continue?flow=${flowHandle}`,
      {
        method: "POST",
        headers: { "content-type": "application/json", origin, cookie: cookies },
        body: JSON.stringify({ accountId: opaqueId, csrfToken }),
      },
      bindings,
    )

    expect(res.status).toBe(401)
    expect(await res.json()).toEqual({ success: false, op: "sessionContinue", errorMessage: "account_invalid" })
    const setCookie = res.headers.get("set-cookie") ?? ""
    expect(setCookie).toContain("Max-Age=0")
  })

  test("forged opaque ID returns 401 account_invalid", async () => {
    const acc = account()
    const cookies = `${await flowCookieCreate()}; __Host-zitadel-login-accounts=${await sealAccountCookie([acc])}`

    const app = workerAppCreate({ fetch: nativeFetch(), now: () => now })
    const res = await app.request(
      `${origin}/api/v2/session/continue?flow=${flowHandle}`,
      {
        method: "POST",
        headers: { "content-type": "application/json", origin, cookie: cookies },
        body: JSON.stringify({ accountId: "acc_forged1234567890", csrfToken }),
      },
      bindings,
    )

    expect(res.status).toBe(401)
    expect(await res.json()).toEqual({ success: false, op: "sessionContinue", errorMessage: "account_invalid" })
  })

  test("callback failure returns 502 and replay returns 409", async () => {
    const acc = account()
    const opaqueId = await opaqueAccountIdCreate(accountKey, acc.sessionId, acc.userId)
    const cookies = `${await flowCookieCreate()}; __Host-zitadel-login-accounts=${await sealAccountCookie([acc])}`

    const app = workerAppCreate({ fetch: nativeFetch({ callbackStatus: 500 }), now: () => now })
    const res = await app.request(
      `${origin}/api/v2/session/continue?flow=${flowHandle}`,
      {
        method: "POST",
        headers: { "content-type": "application/json", origin, cookie: cookies },
        body: JSON.stringify({ accountId: opaqueId, csrfToken }),
      },
      bindings,
    )

    expect(res.status).toBe(200)

    const continueRes = await app.request(
      `${origin}/api/v2/flow/continue?flow=${flowHandle}`,
      { headers: { cookie: cookieHeaderFromResponse(res) } },
      bindings,
    )
    expect(continueRes.status).toBe(502)
    expect(await continueRes.json()).toEqual({
      success: false,
      op: "flowContinue",
      errorMessage: "callback_unavailable",
    })

    const flowVerifiedState: Extract<FlowV2Cookie, { stage: "verified" }> = {
      version: 2,
      flowHandle,
      requestKind: "oidc",
      authRequestId: authRequest.id,
      clientId: authRequest.clientId,
      redirectUri: authRequest.redirectUri,
      organizationId: "org-1",
      prompt: ["PROMPT_SELECT_ACCOUNT"],
      csrfToken,
      issuedAt: now,
      expiresAt: now + 900,
      transitionCounter: 1,
      stage: "verified",
      delegable: false,
      userId: "user-1",
      sessionId: "session-1",
      sessionToken: "token-1",
    }
    const verifiedSealed = await flowV2CookieSeal(flowVerifiedState, flowKey, new Uint8Array(12).fill(2))
    const replayRes = await app.request(
      `${origin}/api/v2/session/continue?flow=${flowHandle}`,
      {
        method: "POST",
        headers: {
          "content-type": "application/json",
          origin,
          cookie: `__Host-zitadel-login-flow-${flowHandle}=${verifiedSealed.data}; __Host-zitadel-login-accounts=${await sealAccountCookie([acc])}`,
        },
        body: JSON.stringify({ accountId: opaqueId, csrfToken }),
      },
      bindings,
    )
    expect(replayRes.status).toBe(409)
    expect(await replayRes.json()).toEqual({ success: false, op: "sessionContinue", errorMessage: "flow_replayed" })
  })

  test("cookie update and cleanup with multiple accounts", async () => {
    const acc1 = account({ userId: "user-1", sessionId: "session-1", sessionToken: "token-1", lastUsedAt: now - 100 })
    const acc2 = account({ userId: "user-2", sessionId: "session-2", sessionToken: "token-2", lastUsedAt: now - 50 })
    const opaqueId2 = await opaqueAccountIdCreate(accountKey, acc2.sessionId, acc2.userId)

    const cookies = `${await flowCookieCreate()}; __Host-zitadel-login-accounts=${await sealAccountCookie([acc1, acc2])}`

    const app = workerAppCreate({ fetch: nativeFetch(), now: () => now })
    const res = await app.request(
      `${origin}/api/v2/session/continue?flow=${flowHandle}`,
      {
        method: "POST",
        headers: { "content-type": "application/json", origin, cookie: cookies },
        body: JSON.stringify({ accountId: opaqueId2, csrfToken }),
      },
      bindings,
    )

    expect(res.status).toBe(200)
    const setCookie = res.headers.get("set-cookie") ?? ""
    const accountsMatch = setCookie.match(/__Host-zitadel-login-accounts=([^;]+)/)?.[1]
    expect(accountsMatch).toBeTruthy()

    const opened = await recentAccountCookieOpen(accountsMatch!, [accountKey], now)
    expect(opened.success).toBe(true)
    if (opened.success) {
      expect(opened.data.accounts[0]?.userId).toBe("user-2")
      expect(opened.data.accounts[0]?.lastUsedAt).toBe(now)
      expect(opened.data.accounts[1]?.userId).toBe("user-1")
    }
  })

  test("no secrets exposed in response JSON or headers", async () => {
    const acc = account()
    const opaqueId = await opaqueAccountIdCreate(accountKey, acc.sessionId, acc.userId)
    const cookies = `${await flowCookieCreate()}; __Host-zitadel-login-accounts=${await sealAccountCookie([acc])}`

    const app = workerAppCreate({ fetch: nativeFetch(), now: () => now })
    const res = await app.request(
      `${origin}/api/v2/session/continue?flow=${flowHandle}`,
      {
        method: "POST",
        headers: { "content-type": "application/json", origin, cookie: cookies },
        body: JSON.stringify({ accountId: opaqueId, csrfToken }),
      },
      bindings,
    )

    expect(res.status).toBe(200)
    const text = await res.text()
    expect(text).not.toContain("token-1")
    expect(text).not.toContain("test-pat-not-a-real-secret-value")
    expect(text).not.toContain("user-1")
    expect(text).not.toContain("session-1")
  })
})
