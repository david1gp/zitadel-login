import { describe, expect, test } from "bun:test"

import type { WorkerBindingsInput } from "../src/config/workerBindingsSchema"
import { flowV2CookieSeal } from "../src/flow/domain/flowV2CookieSeal"
import type { FlowV2Cookie } from "../src/flow/model/flowV2CookieSchema"
import { recentAccountCookieOpen } from "../src/session/domain/recentAccountCookieOpen"
import { recentAccountCookieSeal } from "../src/session/domain/recentAccountCookieSeal"
import { recentAccountDiscoveryExecute } from "../src/session/domain/recentAccountDiscoveryExecute"
import type { RecentAccount } from "../src/session/model/recentAccountCookieSchema"
import { workerAppCreate } from "../src/worker/workerAppCreate"

const accountKey = "C".repeat(43)
const flowKey = "A".repeat(43)
const origin = "https://login.example"
const identityOrigin = "https://identity.example"
const now = 1_800_000_000

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

async function sealCookie(accounts: RecentAccount[], key = accountKey): Promise<string> {
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

function mockClient(
  overrides: { sessionGet?: (sessionId: string, token: string) => any; userGet?: (userId: string) => any } = {},
) {
  return {
    sessionGet:
      overrides.sessionGet ??
      (async (sessionId: string) => ({
        success: true,
        data: {
          session: {
            id: sessionId,
            factors: { user: { id: "user-1", organizationId: "org-1" } },
          },
        },
      })),
    userGet:
      overrides.userGet ??
      (async (userId: string) => ({
        success: true,
        data: {
          user: {
            userId,
            state: "USER_STATE_ACTIVE",
            preferredLoginName: "alice@example.com",
            human: { profile: { displayName: "Alice Smith", avatarUrl: "https://identity.example/avatar.png" } },
          },
        },
      })),
  }
}

describe("recentAccountDiscoveryExecute domain unit tests", () => {
  test("valid account returns display-safe account summary", async () => {
    const cookieVal = await sealCookie([account()])
    const result = await recentAccountDiscoveryExecute({
      cookieValue: cookieVal,
      cookieKeys: [accountKey],
      organizationId: "org-1",
      now,
      randomBytes: (len) => new Uint8Array(len).fill(2),
      client: mockClient(),
    })

    expect(result.success).toBe(true)
    if (!result.success) return
    expect(result.data.accounts).toHaveLength(1)
    const summary = result.data.accounts[0]!
    expect(summary.id).toMatch(/^acc_[A-Za-z0-9_-]+$/)
    expect(summary.id).not.toContain("user-1")
    expect(summary.id).not.toContain("session-1")
    expect(summary.id).not.toContain("token-1")
    expect(summary.label).toBe("Alice Smith")
    expect(summary.avatarUrl).toBe("https://identity.example/avatar.png")
    expect(summary.lastUsedAt).toBe(now - 50)
    expect(summary.reauthenticationRequired).toBe(false)
  })

  test("stale/terminated session is rejected and triggers cookie cleanup", async () => {
    const cookieVal = await sealCookie([account()])
    const client = mockClient({
      sessionGet: async () => ({ success: false, errorMessage: "session_not_found" }),
    })
    const result = await recentAccountDiscoveryExecute({
      cookieValue: cookieVal,
      cookieKeys: [accountKey],
      organizationId: "org-1",
      now,
      randomBytes: (len) => new Uint8Array(len).fill(2),
      client,
    })

    expect(result.success).toBe(true)
    if (!result.success) return
    expect(result.data.accounts).toHaveLength(0)
    expect(result.data.clearCookie).toBe(true)
  })

  test("inactive user is rejected and triggers cookie cleanup", async () => {
    const cookieVal = await sealCookie([account()])
    const client = mockClient({
      userGet: async (userId: string) => ({
        success: true,
        data: { user: { userId, state: "USER_STATE_INACTIVE" } },
      }),
    })
    const result = await recentAccountDiscoveryExecute({
      cookieValue: cookieVal,
      cookieKeys: [accountKey],
      organizationId: "org-1",
      now,
      randomBytes: (len) => new Uint8Array(len).fill(2),
      client,
    })

    expect(result.success).toBe(true)
    if (!result.success) return
    expect(result.data.accounts).toHaveLength(0)
    expect(result.data.clearCookie).toBe(true)
  })

  test("organization and hint filtering", async () => {
    const acc1 = account({ userId: "user-1", sessionId: "sess-1" })
    const acc2 = account({ userId: "user-2", sessionId: "sess-2" })
    const cookieVal = await sealCookie([acc1, acc2])

    const client = mockClient({
      sessionGet: async (sessionId: string) => ({
        success: true,
        data: {
          session: {
            id: sessionId,
            factors: { user: { id: sessionId === "sess-1" ? "user-1" : "user-2", organizationId: "org-1" } },
          },
        },
      }),
      userGet: async (userId: string) => ({
        success: true,
        data: {
          user: {
            userId,
            state: "USER_STATE_ACTIVE",
            preferredLoginName: userId === "user-1" ? "alice@example.com" : "bob@example.com",
          },
        },
      }),
    })

    const hintResult = await recentAccountDiscoveryExecute({
      cookieValue: cookieVal,
      cookieKeys: [accountKey],
      organizationId: "org-1",
      loginHint: "bob@example.com",
      now,
      randomBytes: (len) => new Uint8Array(len).fill(2),
      client,
    })
    expect(hintResult.success).toBe(true)
    if (hintResult.success) {
      expect(hintResult.data.accounts).toHaveLength(1)
      expect(hintResult.data.accounts[0]?.label).toBe("bob@example.com")
    }

    const userHintResult = await recentAccountDiscoveryExecute({
      cookieValue: cookieVal,
      cookieKeys: [accountKey],
      organizationId: "org-1",
      hintUserId: "user-1",
      now,
      randomBytes: (len) => new Uint8Array(len).fill(2),
      client,
    })
    expect(userHintResult.success).toBe(true)
    if (userHintResult.success) {
      expect(userHintResult.data.accounts).toHaveLength(1)
      expect(userHintResult.data.accounts[0]?.label).toBe("alice@example.com")
    }

    const orgMismatchResult = await recentAccountDiscoveryExecute({
      cookieValue: cookieVal,
      cookieKeys: [accountKey],
      organizationId: "other-org",
      now,
      randomBytes: (len) => new Uint8Array(len).fill(2),
      client,
    })
    expect(orgMismatchResult.success).toBe(true)
    if (orgMismatchResult.success) {
      expect(orgMismatchResult.data.accounts).toHaveLength(0)
      expect(orgMismatchResult.data.clearCookie).toBe(true)
    }
  })

  test("prompt select and login filtering", async () => {
    const cookieVal = await sealCookie([account()])

    const loginPromptRes = await recentAccountDiscoveryExecute({
      cookieValue: cookieVal,
      cookieKeys: [accountKey],
      organizationId: "org-1",
      prompt: ["PROMPT_LOGIN"],
      now,
      randomBytes: (len) => new Uint8Array(len).fill(2),
      client: mockClient(),
    })
    expect(loginPromptRes.success).toBe(true)
    if (loginPromptRes.success) {
      expect(loginPromptRes.data.accounts[0]?.reauthenticationRequired).toBe(true)
    }

    const selectPromptRes = await recentAccountDiscoveryExecute({
      cookieValue: cookieVal,
      cookieKeys: [accountKey],
      organizationId: "org-1",
      prompt: ["PROMPT_SELECT_ACCOUNT"],
      now,
      randomBytes: (len) => new Uint8Array(len).fill(2),
      client: mockClient(),
    })
    expect(selectPromptRes.success).toBe(true)
    if (selectPromptRes.success) {
      expect(selectPromptRes.data.accounts[0]?.reauthenticationRequired).toBe(false)
    }
  })

  test("max_age forces reauthentication requirement when age exceeded", async () => {
    const oldAccount = account({ authAt: now - 600 })
    const cookieVal = await sealCookie([oldAccount])

    const res = await recentAccountDiscoveryExecute({
      cookieValue: cookieVal,
      cookieKeys: [accountKey],
      organizationId: "org-1",
      maxAgeSeconds: 300,
      now,
      randomBytes: (len) => new Uint8Array(len).fill(2),
      client: mockClient(),
    })
    expect(res.success).toBe(true)
    if (res.success) {
      expect(res.data.accounts[0]?.reauthenticationRequired).toBe(true)
    }
  })

  test("token refresh updates cookie with latest token", async () => {
    const cookieVal = await sealCookie([account({ sessionToken: "old-token" })])
    const client = mockClient({
      sessionGet: async (sessionId: string) => ({
        success: true,
        data: {
          session: {
            id: sessionId,
            sessionToken: "new-rotated-token",
            factors: { user: { id: "user-1", organizationId: "org-1" } },
          },
        },
      }),
    })

    const res = await recentAccountDiscoveryExecute({
      cookieValue: cookieVal,
      cookieKeys: [accountKey],
      organizationId: "org-1",
      now,
      randomBytes: (len) => new Uint8Array(len).fill(2),
      client,
    })

    expect(res.success).toBe(true)
    if (res.success) {
      expect(res.data.updatedCookieValue).toBeTruthy()
      const opened = await recentAccountCookieOpen(res.data.updatedCookieValue!, [accountKey], now)
      expect(opened.success).toBe(true)
      if (opened.success) {
        expect(opened.data.accounts[0]?.sessionToken).toBe("new-rotated-token")
      }
    }
  })

  test("cookie cleanup removes stale account and keeps valid account", async () => {
    const accValid = account({ userId: "user-1", sessionId: "sess-1" })
    const accStale = account({ userId: "user-2", sessionId: "sess-2" })
    const cookieVal = await sealCookie([accValid, accStale])

    const client = mockClient({
      sessionGet: async (sessionId: string) => {
        if (sessionId === "sess-2") return { success: false, errorMessage: "terminated" }
        return {
          success: true,
          data: {
            session: { id: sessionId, factors: { user: { id: "user-1", organizationId: "org-1" } } },
          },
        }
      },
    })

    const res = await recentAccountDiscoveryExecute({
      cookieValue: cookieVal,
      cookieKeys: [accountKey],
      organizationId: "org-1",
      now,
      randomBytes: (len) => new Uint8Array(len).fill(2),
      client,
    })

    expect(res.success).toBe(true)
    if (res.success) {
      expect(res.data.accounts).toHaveLength(1)
      expect(res.data.updatedCookieValue).toBeTruthy()
      const opened = await recentAccountCookieOpen(res.data.updatedCookieValue!, [accountKey], now)
      expect(opened.success).toBe(true)
      if (opened.success) {
        expect(opened.data.accounts).toHaveLength(1)
        expect(opened.data.accounts[0]?.userId).toBe("user-1")
      }
    }
  })

  test("duplicate labels are disambiguated", async () => {
    const acc1 = account({ userId: "user-1", sessionId: "sess-1" })
    const acc2 = account({ userId: "user-2", sessionId: "sess-2" })
    const cookieVal = await sealCookie([acc1, acc2])

    const client = mockClient({
      sessionGet: async (sessionId: string) => ({
        success: true,
        data: {
          session: {
            id: sessionId,
            factors: { user: { id: sessionId === "sess-1" ? "user-1" : "user-2", organizationId: "org-1" } },
          },
        },
      }),
      userGet: async (userId: string) => ({
        success: true,
        data: {
          user: {
            userId,
            state: "USER_STATE_ACTIVE",
            human: {
              profile: { displayName: "Same Name" },
              email: { email: userId === "user-1" ? "user1@example.com" : "user2@example.com", isVerified: true },
            },
          },
        },
      }),
    })

    const res = await recentAccountDiscoveryExecute({
      cookieValue: cookieVal,
      cookieKeys: [accountKey],
      organizationId: "org-1",
      now,
      randomBytes: (len) => new Uint8Array(len).fill(2),
      client,
    })

    expect(res.success).toBe(true)
    if (res.success) {
      expect(res.data.accounts).toHaveLength(2)
      expect(res.data.accounts[0]?.label).toBe("Same Name (user1@example.com)")
      expect(res.data.accounts[1]?.label).toBe("Same Name (user2@example.com)")
    }
  })

  test("malformed upstream data handling is non-fatal", async () => {
    const cookieVal = await sealCookie([account()])
    const client = mockClient({
      sessionGet: async () => {
        throw new Error("Upstream crash")
      },
    })

    const res = await recentAccountDiscoveryExecute({
      cookieValue: cookieVal,
      cookieKeys: [accountKey],
      organizationId: "org-1",
      now,
      randomBytes: (len) => new Uint8Array(len).fill(2),
      client,
    })

    expect(res.success).toBe(true)
    if (res.success) {
      expect(res.data.accounts).toHaveLength(0)
    }
  })
})

describe("Worker endpoint recent-account discovery integration and no-secret response shape", () => {
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
    ZITADEL_EMAIL_OTP_V2_ENABLED: "true",
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

  function nativeFetch() {
    return async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
      const url = String(input)
      if (url === `${identityOrigin}/v2/oidc/auth_requests/${authRequest.id}`) {
        return Response.json({ authRequest })
      }
      if (url.startsWith(`${identityOrigin}/v2/sessions/session-1`)) {
        return Response.json({
          session: {
            id: "session-1",
            factors: { user: { id: "user-1", organizationId: "org-1" } },
          },
        })
      }
      if (url === `${identityOrigin}/v2/users/user-1`) {
        return Response.json({
          user: {
            userId: "user-1",
            state: "USER_STATE_ACTIVE",
            preferredLoginName: "alice@example.com",
            human: { profile: { displayName: "Alice Smith" } },
          },
        })
      }
      throw new Error(`Unexpected fetch: ${url}`)
    }
  }

  test("flow initialize includes display-safe account summaries with no secrets exposed", async () => {
    const cookieHeader = `__Host-zitadel-login-accounts=${await sealCookie([account()])}`
    const app = workerAppCreate({
      fetch: nativeFetch(),
      now: () => now,
      randomBytes: (len) => new Uint8Array(len).fill(4),
    })

    const res = await app.request(
      `${origin}/api/v2/flow/initialize`,
      {
        method: "POST",
        headers: {
          "content-type": "application/json",
          origin,
          cookie: cookieHeader,
        },
        body: JSON.stringify({ authRequest: authRequest.id }),
      },
      bindings,
    )

    expect(res.status).toBe(200)
    const jsonText = await res.text()
    const json = JSON.parse(jsonText)

    expect(json.success).toBe(true)
    expect(json.data.screen.name).toBe("email_otp_start")
    expect(json.data.screen.recentAccounts).toHaveLength(1)
    const summary = json.data.screen.recentAccounts[0]
    expect(summary.label).toBe("Alice Smith")
    expect(summary.id).toMatch(/^acc_/)

    expect(jsonText).not.toContain("user-1")
    expect(jsonText).not.toContain("session-1")
    expect(jsonText).not.toContain("token-1")
    expect(jsonText).not.toContain("test-pat-secret")
  })

  test("GET /api/v2/session/accounts returns display-safe accounts with no secrets exposed", async () => {
    const flowHandle = "AAAAAAAAAAAAAAAAAAAAAA"
    const flowCookieState: Extract<FlowV2Cookie, { stage: "ready" }> = {
      version: 2,
      flowHandle,
      requestKind: "oidc",
      authRequestId: authRequest.id,
      clientId: authRequest.clientId,
      redirectUri: authRequest.redirectUri,
      organizationId: "org-1",
      prompt: authRequest.prompt,
      csrfToken: "B".repeat(43),
      issuedAt: now,
      expiresAt: now + 900,
      transitionCounter: 0,
      stage: "ready",
      delegable: true,
      owned: true,
    }
    const flowCookieSealed = await flowV2CookieSeal(flowCookieState, flowKey, new Uint8Array(12).fill(2))
    if (!flowCookieSealed.success) throw new Error("Failed to seal flow cookie")

    const cookies = `__Host-zitadel-login-flow-${flowHandle}=${flowCookieSealed.data}; __Host-zitadel-login-accounts=${await sealCookie([account()])}`

    const app = workerAppCreate({
      fetch: nativeFetch(),
      now: () => now,
      randomBytes: (len) => new Uint8Array(len).fill(4),
    })

    const res = await app.request(
      `${origin}/api/v2/session/accounts?flow=${flowHandle}`,
      { headers: { cookie: cookies } },
      bindings,
    )

    expect(res.status).toBe(200)
    const jsonText = await res.text()
    const json = JSON.parse(jsonText)

    expect(json.success).toBe(true)
    expect(json.data.accounts).toHaveLength(1)
    expect(json.data.accounts[0].label).toBe("Alice Smith")

    expect(jsonText).not.toContain("user-1")
    expect(jsonText).not.toContain("session-1")
    expect(jsonText).not.toContain("token-1")
    expect(jsonText).not.toContain("test-pat-secret")
  })
})
