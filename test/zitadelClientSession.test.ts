import { describe, expect, test } from "bun:test"

import type { WorkerBindings } from "../src/config/workerBindingsSchema"
import { zitadelClientCreate } from "../src/zitadel/zitadelClientCreate"

const identityOrigin = "https://identity.example"

const bindings = {
  ZITADEL_ORIGIN: identityOrigin,
  ZITADEL_ORGANIZATION_ID: "org-1",
  ZITADEL_ALLOWED_CLIENT_IDS: ["client-1"],
  LOGIN_V2_FALLBACK_URL: `${identityOrigin}/ui/v2/login`,
  PAGES_ORIGIN: "https://login.example",
  SESSION_LIFETIME_SECONDS: 900,
  ZITADEL_LOGIN_CLIENT_PAT: "test-pat-not-a-real-secret-value",
  FLOW_COOKIE_KEY: "A".repeat(43),
  FLOW_COOKIE_PREVIOUS_KEY: undefined,
  RECENT_ACCOUNT_COOKIE_KEY: "A".repeat(43),
  RECENT_ACCOUNT_COOKIE_PREVIOUS_KEY: undefined,
  ZITADEL_RECENT_ACCOUNT_V2_ENABLED: true,
  RATE_LIMITER: { limit: async () => ({ success: true }) },
} satisfies WorkerBindings

function nativeCreate() {
  const calls: Array<{ method: string; url: string; body?: unknown }> = []
  const fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
    calls.push({
      method: init?.method ?? "GET",
      url: String(input),
      body: init?.body === undefined ? undefined : JSON.parse(String(init.body)),
    })
    return Response.json(
      init?.method === "POST" ? { sessionId: "session-1", sessionToken: "token-1" } : { sessionToken: "token-2" },
    )
  }
  return { client: zitadelClientCreate(bindings, fetch), calls }
}

describe("zitadelClientCreate session requests", () => {
  test("preserves session create, session-bound, and legacy patch request shapes", async () => {
    const native = nativeCreate()

    await native.client.passwordSessionCreate("user-1", "password-secret")
    await native.client.emailOtpSessionChallenge("session/id", "token-1")
    await native.client.sessionChallenge("session-1")

    expect(native.calls).toEqual([
      {
        method: "POST",
        url: `${identityOrigin}/v2/sessions`,
        body: {
          checks: { user: { userId: "user-1" }, password: { password: "password-secret" } },
          lifetime: "900s",
        },
      },
      {
        method: "PATCH",
        url: `${identityOrigin}/v2/sessions/session%2Fid`,
        body: {
          sessionToken: "token-1",
          challenges: { otpEmail: { sendCode: {} } },
          lifetime: "900s",
        },
      },
      {
        method: "PATCH",
        url: `${identityOrigin}/v2/sessions/session-1`,
        body: { challenges: { otpEmail: { sendCode: {} } } },
      },
    ])
  })
})
