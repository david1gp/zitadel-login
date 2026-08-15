import { describe, expect, test } from "bun:test"

import type { WorkerBindings } from "../src/config/workerBindingsSchema"
import { emailOtpCooldownClientCreate } from "../src/email-otp/cooldown/emailOtpCooldownClientCreate"
import { emailOtpV2Start } from "../src/email-otp/domain/emailOtpV2Start"
import type { FlowV2Cookie } from "../src/flow/model/flowV2CookieSchema"
import { zitadelClientCreate } from "../src/zitadel/zitadelClientCreate"
import { emailOtpCooldownNamespaceFakeCreate } from "./emailOtpCooldownNamespaceFakeCreate"

const identityOrigin = "https://identity.example"
const now = 1_800_000_000

const state: Extract<FlowV2Cookie, { stage: "ready" }> = {
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
  transitionCounter: 0,
  stage: "ready",
  delegable: true,
  owned: true,
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

type NativeOptions = {
  users?: unknown[]
  omitResult?: boolean
  methods?: string[]
  ignoreUnknownUsernames?: boolean
  sessionStatus?: number
}

function nativeCreate(options: NativeOptions = {}) {
  const calls: Array<{ method: string; url: string; body?: unknown }> = []
  const fetch = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const url = String(input)
    const method = init?.method ?? "GET"
    calls.push({
      method,
      url,
      body: init?.body === undefined ? undefined : JSON.parse(String(init.body)),
    })
    if (url === `${identityOrigin}/v2/settings/login` && method === "GET") {
      return Response.json({
        settings: {
          allowLocalAuthentication: true,
          ignoreUnknownUsernames: options.ignoreUnknownUsernames ?? false,
        },
      })
    }
    if (url === `${identityOrigin}/v2/users` && method === "POST") {
      if (options.omitResult) return Response.json({})
      return Response.json({
        result: options.users ?? [
          {
            userId: "user-1",
            state: "USER_STATE_ACTIVE",
            details: { resourceOwner: "org-1" },
            human: { email: { email: "person@example.com", isVerified: true } },
          },
        ],
      })
    }
    if (url === `${identityOrigin}/v2/users/user-1/authentication_methods` && method === "GET") {
      return Response.json({
        authMethodTypes: options.methods ?? ["AUTHENTICATION_METHOD_TYPE_OTP_EMAIL"],
      })
    }
    if (url === `${identityOrigin}/v2/sessions` && method === "POST") {
      if (options.sessionStatus) return Response.json({ error: "failed" }, { status: options.sessionStatus })
      return Response.json({ sessionId: "session-1", sessionToken: "created-token" }, { status: 201 })
    }
    throw new Error(`Unexpected request: ${method} ${url}`)
  }
  return { client: zitadelClientCreate(bindings, fetch), calls }
}

function cooldownCreate(namespace = emailOtpCooldownNamespaceFakeCreate()) {
  return emailOtpCooldownClientCreate({
    namespace,
    cookieKey: bindings.FLOW_COOKIE_KEY,
    purpose: "email-otp",
    identifier: state.authRequestId,
  })
}

describe("emailOtpV2Start", () => {
  test("reserves before the ZITADEL send and stores the Durable Object expiry", async () => {
    const native = nativeCreate()
    const result = await emailOtpV2Start({
      state,
      email: "person@example.com",
      now,
      client: native.client,
      cooldown: cooldownCreate(),
    })

    expect(result.success).toBe(true)
    if (!result.success) return
    expect(result.data.state).toEqual({
      version: 2,
      flowHandle: state.flowHandle,
      requestKind: "oidc",
      authRequestId: state.authRequestId,
      clientId: state.clientId,
      redirectUri: state.redirectUri,
      organizationId: state.organizationId,
      prompt: state.prompt,
      csrfToken: state.csrfToken,
      issuedAt: state.issuedAt,
      expiresAt: state.expiresAt,
      transitionCounter: 1,
      stage: "otp",
      delegable: false,
      userId: "user-1",
      sessionId: "session-1",
      sessionToken: "created-token",
      cooldownExpiresAt: now + 60,
    })
    expect(native.calls.some((call) => call.url === `${identityOrigin}/v2/sessions`)).toBe(true)
  })

  test("treats an omitted users result as no matching email instead of service unavailable", async () => {
    const native = nativeCreate({ omitResult: true })
    const result = await emailOtpV2Start({
      state,
      email: "person@example.com",
      now,
      client: native.client,
      cooldown: cooldownCreate(),
    })

    expect(result).toEqual({
      success: true,
      data: { state, transition: { kind: "fallback", path: `/api/v2/flow/fallback?flow=${state.flowHandle}` } },
    })
    expect(native.calls.some((call) => call.url === `${identityOrigin}/v2/sessions`)).toBe(false)
  })

  test("rejects an active reservation without creating a session", async () => {
    const native = nativeCreate()
    const cooldown = cooldownCreate()
    const first = await emailOtpV2Start({
      state,
      email: "person@example.com",
      now,
      client: native.client,
      cooldown,
    })
    const second = await emailOtpV2Start({
      state,
      email: "person@example.com",
      now: now + 1,
      client: native.client,
      cooldown,
    })

    expect(first.success).toBe(true)
    expect(second).toEqual({
      success: false,
      op: "emailOtpCooldownSendReserve",
      errorMessage: "rate_limited",
      rawData: { expiresAt: now + 60 },
    })
    expect(native.calls.filter((call) => call.url === `${identityOrigin}/v2/sessions`)).toHaveLength(1)
  })

  test("reserves equivalently for a decoy send", async () => {
    const native = nativeCreate({ users: [], ignoreUnknownUsernames: true })
    const result = await emailOtpV2Start({
      state,
      email: "absent@example.com",
      now,
      client: native.client,
      cooldown: cooldownCreate(),
    })

    expect(result.success).toBe(true)
    if (!result.success) return
    expect(result.data.state.stage).toBe("otp_decoy")
    expect(result.data.state.stage === "otp_decoy" ? result.data.state.cooldownExpiresAt : undefined).toBe(now + 60)
    expect(native.calls.some((call) => call.url === `${identityOrigin}/v2/sessions`)).toBe(false)
  })

  test("does not reserve when the start falls back without sending", async () => {
    const native = nativeCreate({ users: [] })
    let reserved = false
    const result = await emailOtpV2Start({
      state,
      email: "absent@example.com",
      now,
      client: native.client,
      cooldown: emailOtpCooldownClientCreate({
        namespace: {
          getByName: () => ({
            reserve: async () => {
              reserved = true
              return { accepted: true, expiresAt: now + 60 }
            },
            status: async () => ({ expiresAt: 0 }),
          }),
        },
        cookieKey: bindings.FLOW_COOKIE_KEY,
        purpose: "email-otp",
        identifier: state.authRequestId,
      }),
    })

    expect(result).toEqual({
      success: true,
      data: {
        state,
        transition: { kind: "fallback", path: `/api/v2/flow/fallback?flow=${state.flowHandle}` },
      },
    })
    expect(reserved).toBe(false)
  })

  test("fails closed when the Durable Object is unavailable", async () => {
    const native = nativeCreate()
    const result = await emailOtpV2Start({
      state,
      email: "person@example.com",
      now,
      client: native.client,
      cooldown: emailOtpCooldownClientCreate({
        namespace: undefined,
        cookieKey: bindings.FLOW_COOKIE_KEY,
        purpose: "email-otp",
        identifier: state.authRequestId,
      }),
    })

    expect(result).toEqual({
      success: false,
      op: "emailOtpCooldownStubGet",
      errorMessage: "cooldown_unavailable",
    })
    expect(native.calls.some((call) => call.url === `${identityOrigin}/v2/sessions`)).toBe(false)
  })
})
