import { describe, expect, test } from "bun:test"

import type { WorkerBindings } from "../src/config/workerBindingsSchema"
import { emailOtpCooldownClientCreate } from "../src/email-otp/cooldown/emailOtpCooldownClientCreate"
import { emailOtpV2Resend } from "../src/email-otp/domain/emailOtpV2Resend"
import type { FlowV2Cookie } from "../src/flow/model/flowV2CookieSchema"
import { zitadelClientCreate } from "../src/zitadel/zitadelClientCreate"
import { emailOtpCooldownNamespaceFakeCreate } from "./emailOtpCooldownNamespaceFakeCreate"

const identityOrigin = "https://identity.example"
const now = 1_800_000_000

const state: Extract<FlowV2Cookie, { stage: "otp" }> = {
  version: 2,
  flowHandle: "AAAAAAAAAAAAAAAAAAAAAA",
  requestKind: "oidc",
  authRequestId: "request-1",
  clientId: "client-1",
  redirectUri: "https://client.example/callback",
  organizationId: "org-1",
  prompt: ["PROMPT_LOGIN"],
  csrfToken: "B".repeat(43),
  issuedAt: now,
  expiresAt: now + 900,
  transitionCounter: 1,
  stage: "otp",
  delegable: false,
  userId: "user-1",
  sessionId: "session-1",
  sessionToken: "created-token",
  cooldownExpiresAt: now,
}

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

function nativeCreate(options: { status?: number; sessionToken?: string } = {}) {
  const calls: Array<{ method: string; url: string; body?: unknown }> = []
  const fetch = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const url = String(input)
    const method = init?.method ?? "GET"
    calls.push({
      method,
      url,
      body: init?.body === undefined ? undefined : JSON.parse(String(init.body)),
    })
    if (url === `${identityOrigin}/v2/sessions/session-1` && method === "PATCH") {
      if (options.status) return Response.json({ error: "challenge failed" }, { status: options.status })
      return Response.json({ sessionToken: options.sessionToken ?? "resent-token" })
    }
    throw new Error(`Unexpected request: ${method} ${url}`)
  }
  return { client: zitadelClientCreate(bindings, fetch), calls }
}

function cooldownCreate() {
  return emailOtpCooldownClientCreate({
    namespace: emailOtpCooldownNamespaceFakeCreate(),
    cookieKey: bindings.FLOW_COOKIE_KEY,
    purpose: "email-otp",
    identifier: state.authRequestId,
  })
}

describe("emailOtpV2Resend", () => {
  test("challenges ZITADEL and resets cooldown expiry on success", async () => {
    const native = nativeCreate()
    const result = await emailOtpV2Resend({ state, now, client: native.client, cooldown: cooldownCreate() })

    expect(result.success).toBe(true)
    if (!result.success) return
    expect(result.data.state).toEqual({
      ...state,
      transitionCounter: 2,
      sessionToken: "resent-token",
      cooldownExpiresAt: now + 60,
    })
    expect(result.data.transition).toEqual({
      kind: "render",
      route: `/login/email-otp?flow=${state.flowHandle}`,
      screen: { name: "email_otp_code" },
      csrfToken: state.csrfToken,
    })
    expect(native.calls).toEqual([
      {
        method: "PATCH",
        url: `${identityOrigin}/v2/sessions/session-1`,
        body: {
          sessionToken: "created-token",
          challenges: { otpEmail: { sendCode: {} } },
          lifetime: "900s",
        },
      },
    ])
  })

  test("classifies client challenge failures as expired", async () => {
    const native = nativeCreate({ status: 400 })
    const result = await emailOtpV2Resend({ state, now, client: native.client, cooldown: cooldownCreate() })
    expect(result).toEqual({
      success: false,
      op: "emailOtpV2Resend",
      errorMessage: "challenge_expired",
      rawData: { status: 400 },
    })
  })

  test("rejects an active reservation without calling ZITADEL", async () => {
    const native = nativeCreate()
    const cooldown = cooldownCreate()
    const first = await emailOtpV2Resend({ state, now, client: native.client, cooldown })
    const second = await emailOtpV2Resend({ state, now: now + 1, client: native.client, cooldown })

    expect(first.success).toBe(true)
    expect(second).toEqual({
      success: false,
      op: "emailOtpCooldownSendReserve",
      errorMessage: "rate_limited",
      rawData: { expiresAt: now + 60 },
    })
    expect(native.calls).toHaveLength(1)
  })
})
