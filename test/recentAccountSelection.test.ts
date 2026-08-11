import { describe, expect, test } from "bun:test"

import type { FlowV2Cookie } from "../src/flow/model/flowV2CookieSchema"
import { opaqueAccountIdCreate } from "../src/session/domain/opaqueAccountIdCreate"
import { recentAccountCookieOpen } from "../src/session/domain/recentAccountCookieOpen"
import { recentAccountCookieSeal } from "../src/session/domain/recentAccountCookieSeal"
import { recentAccountSelectionExecute } from "../src/session/domain/recentAccountSelectionExecute"
import type { RecentAccount } from "../src/session/model/recentAccountCookieSchema"

const accountKey = "C".repeat(43)
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

function mockState(
  overrides: Partial<Extract<FlowV2Cookie, { stage: "ready" }>> = {},
): Extract<FlowV2Cookie, { stage: "ready" }> {
  return {
    version: 2,
    flowHandle: "AAAAAAAAAAAAAAAAAAAAAA",
    requestKind: "oidc",
    authRequestId: "request-1",
    clientId: "client-1",
    redirectUri: "https://client.example/callback",
    organizationId: "org-1",
    prompt: ["PROMPT_SELECT_ACCOUNT"],
    csrfToken: "B".repeat(43),
    issuedAt: now,
    expiresAt: now + 900,
    transitionCounter: 0,
    stage: "ready",
    delegable: true,
    owned: true,
    ...overrides,
  }
}

function mockClient(
  overrides: { sessionGet?: (sessionId: string, token: string) => any; userGet?: (userId: string) => any } = {},
) {
  return {
    sessionGet:
      overrides.sessionGet ??
      (async (sessionId: string, sessionToken: string) => ({
        success: true,
        data: {
          session: {
            id: sessionId,
            sessionToken,
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
            human: { profile: { displayName: "Alice Smith" } },
          },
        },
      })),
  } as any
}

describe("recentAccountSelectionExecute domain unit tests", () => {
  test("immediate completion on valid selection", async () => {
    const acc = account()
    const cookieVal = await sealCookie([acc])
    const opaqueId = await opaqueAccountIdCreate(accountKey, acc.sessionId, acc.userId)

    const result = await recentAccountSelectionExecute({
      state: mockState(),
      accountId: opaqueId,
      cookieValue: cookieVal,
      cookieKeys: [accountKey],
      now,
      randomBytes: (len) => new Uint8Array(len).fill(2),
      client: mockClient(),
    })

    expect(result.success).toBe(true)
    if (!result.success) return
    expect(result.data.state.stage).toBe("verified")
    expect(result.data.transition).toEqual({
      kind: "complete",
      path: "/api/v2/flow/continue?flow=AAAAAAAAAAAAAAAAAAAAAA",
    })
    expect(result.data.updatedCookieValue).toBeTruthy()
    const opened = await recentAccountCookieOpen(result.data.updatedCookieValue!, [accountKey], now)
    expect(opened.success).toBe(true)
    if (opened.success) {
      expect(opened.data.accounts[0]?.lastUsedAt).toBe(now)
    }
  })

  test("prompt-login forces reauthentication transition bound to user", async () => {
    const acc = account()
    const cookieVal = await sealCookie([acc])
    const opaqueId = await opaqueAccountIdCreate(accountKey, acc.sessionId, acc.userId)

    const result = await recentAccountSelectionExecute({
      state: mockState({ prompt: ["PROMPT_LOGIN"] }),
      accountId: opaqueId,
      cookieValue: cookieVal,
      cookieKeys: [accountKey],
      now,
      randomBytes: (len) => new Uint8Array(len).fill(2),
      client: mockClient(),
    })

    expect(result.success).toBe(true)
    if (!result.success) return
    expect(result.data.state.stage).toBe("ready")
    if (result.data.state.stage === "ready") {
      expect(result.data.state.hintUserId).toBe("user-1")
      expect(result.data.state.loginHint).toBe("alice@example.com")
    }
    expect(result.data.transition).toEqual({
      kind: "render",
      route: "/login/email-otp?flow=AAAAAAAAAAAAAAAAAAAAAA",
      screen: {
        name: "email_otp_start",
        loginHint: "alice@example.com",
      },
      csrfToken: "B".repeat(43),
    })
  })

  test("max_age exceeded forces reauthentication transition", async () => {
    const acc = account({ authAt: now - 600 })
    const cookieVal = await sealCookie([acc])
    const opaqueId = await opaqueAccountIdCreate(accountKey, acc.sessionId, acc.userId)

    const result = await recentAccountSelectionExecute({
      state: mockState({ maxAgeSeconds: 300 }),
      accountId: opaqueId,
      cookieValue: cookieVal,
      cookieKeys: [accountKey],
      now,
      randomBytes: (len) => new Uint8Array(len).fill(2),
      client: mockClient(),
    })

    expect(result.success).toBe(true)
    if (!result.success) return
    expect(result.data.state.stage).toBe("ready")
    expect(result.data.transition.kind).toBe("render")
  })

  test("login hint mismatch is rejected generically", async () => {
    const acc = account()
    const cookieVal = await sealCookie([acc])
    const opaqueId = await opaqueAccountIdCreate(accountKey, acc.sessionId, acc.userId)

    const result = await recentAccountSelectionExecute({
      state: mockState({ loginHint: "charlie@example.com" }),
      accountId: opaqueId,
      cookieValue: cookieVal,
      cookieKeys: [accountKey],
      now,
      randomBytes: (len) => new Uint8Array(len).fill(2),
      client: mockClient(),
    })

    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.errorMessage).toBe("account_invalid")
    }
  })

  test("user hint mismatch is rejected generically", async () => {
    const acc = account()
    const cookieVal = await sealCookie([acc])
    const opaqueId = await opaqueAccountIdCreate(accountKey, acc.sessionId, acc.userId)

    const result = await recentAccountSelectionExecute({
      state: mockState({ hintUserId: "user-2" }),
      accountId: opaqueId,
      cookieValue: cookieVal,
      cookieKeys: [accountKey],
      now,
      randomBytes: (len) => new Uint8Array(len).fill(2),
      client: mockClient(),
    })

    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.errorMessage).toBe("account_invalid")
    }
  })

  test("stale session is rejected and entry removed", async () => {
    const acc = account()
    const cookieVal = await sealCookie([acc])
    const opaqueId = await opaqueAccountIdCreate(accountKey, acc.sessionId, acc.userId)

    const result = await recentAccountSelectionExecute({
      state: mockState(),
      accountId: opaqueId,
      cookieValue: cookieVal,
      cookieKeys: [accountKey],
      now,
      randomBytes: (len) => new Uint8Array(len).fill(2),
      client: mockClient({
        sessionGet: async () => ({ success: false, errorMessage: "session_not_found" }),
      }),
    })

    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.errorMessage).toBe("account_invalid")
      const rawData = result.rawData as { clearCookie?: boolean }
      expect(rawData?.clearCookie).toBe(true)
    }
  })

  test("inactive user is rejected and entry removed", async () => {
    const acc = account()
    const cookieVal = await sealCookie([acc])
    const opaqueId = await opaqueAccountIdCreate(accountKey, acc.sessionId, acc.userId)

    const result = await recentAccountSelectionExecute({
      state: mockState(),
      accountId: opaqueId,
      cookieValue: cookieVal,
      cookieKeys: [accountKey],
      now,
      randomBytes: (len) => new Uint8Array(len).fill(2),
      client: mockClient({
        userGet: async (userId: string) => ({
          success: true,
          data: { user: { userId, state: "USER_STATE_INACTIVE" } },
        }),
      }),
    })

    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.errorMessage).toBe("account_invalid")
      const rawData = result.rawData as { clearCookie?: boolean }
      expect(rawData?.clearCookie).toBe(true)
    }
  })

  test("forged opaque ID is rejected generically", async () => {
    const acc = account()
    const cookieVal = await sealCookie([acc])

    const result = await recentAccountSelectionExecute({
      state: mockState(),
      accountId: "acc_forged1234567890",
      cookieValue: cookieVal,
      cookieKeys: [accountKey],
      now,
      randomBytes: (len) => new Uint8Array(len).fill(2),
      client: mockClient(),
    })

    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.errorMessage).toBe("account_invalid")
    }
  })
})
