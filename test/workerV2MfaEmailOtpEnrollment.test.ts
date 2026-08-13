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
  mfaMethods: ["AUTHENTICATION_METHOD_TYPE_PASSWORD"],
}

type NativeOptions = {
  authClientId?: string
  sessionOrganizationId?: string
  factors?: Record<string, unknown>
  userState?: string
  emailVerified?: boolean
  methods?: string[]
  forceMfa?: boolean
  secondFactors?: string[]
  addStatus?: number
  challengeStatus?: number
  challengeToken?: string
  activatedAfterAddFailure?: boolean
}

function nativeCreate(options: NativeOptions = {}) {
  const calls: Array<{ method: string; url: string; body?: unknown }> = []
  let addAttempted = false
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
      return Response.json({
        session: {
          id: "session-secret-id",
          sessionToken: "latest-preflight-secret-token",
          expirationDate: "2027-01-15T08:15:00Z",
          factors: options.factors ?? {
            user: { id: "user-secret-id", organizationId: options.sessionOrganizationId ?? "org-1" },
            password: { verifiedAt: "2027-01-15T08:00:00Z" },
          },
        },
      })
    }
    if (url === `${identityOrigin}/v2/users/user-secret-id` && method === "GET") {
      return Response.json({
        user: {
          userId: "user-secret-id",
          state: options.userState ?? "USER_STATE_ACTIVE",
          details: { resourceOwner: "org-1" },
          human: { email: { email: "secret-person@example.com", isVerified: options.emailVerified ?? true } },
        },
      })
    }
    if (url === `${identityOrigin}/v2/users/user-secret-id/authentication_methods` && method === "GET") {
      const methods = options.methods ?? ["AUTHENTICATION_METHOD_TYPE_PASSWORD"]
      const recovered = options.activatedAfterAddFailure && addAttempted
      return Response.json({
        authMethodTypes: recovered ? [...methods, "AUTHENTICATION_METHOD_TYPE_OTP_EMAIL"] : methods,
      })
    }
    if (url === `${identityOrigin}/v2/settings/login` && method === "GET") {
      return Response.json({
        settings: {
          forceMfa: options.forceMfa ?? true,
          secondFactors: options.secondFactors ?? ["SECOND_FACTOR_TYPE_OTP_EMAIL"],
          multiFactors: [],
        },
      })
    }
    if (url === `${identityOrigin}/v2/users/user-secret-id/otp_email` && method === "POST") {
      addAttempted = true
      if (options.addStatus) return Response.json({ nativeSecret: "must-not-leak" }, { status: options.addStatus })
      return Response.json({ details: { resourceOwner: "org-1", sequence: "4" } })
    }
    if (url === `${identityOrigin}/v2/sessions/session-secret-id` && method === "PATCH") {
      if (options.challengeStatus) {
        return Response.json({ nativeSecret: "must-not-leak" }, { status: options.challengeStatus })
      }
      return Response.json({ sessionToken: options.challengeToken ?? "challenge-secret-session-token" })
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

function requestCreate(cookie: string, body: Record<string, unknown> = { method: "email_otp", csrfToken }) {
  return new Request(`${origin}/api/v2/mfa/email-otp/enroll?flow=${flowHandle}`, {
    method: "POST",
    headers: { origin, "content-type": "application/json", cookie },
    body: JSON.stringify(body),
  })
}

function latestCookieValueGet(response: Response): string {
  const values = response.headers.get("set-cookie")?.match(new RegExp(`${cookieName}=([^;,]+)`, "g"))
  const value = values?.at(-1)?.slice(cookieName.length + 1)
  if (!value) throw new Error("Expected flow cookie")
  return value
}

describe("POST /api/v2/mfa/email-otp/enroll", () => {
  test("activates verified primary email, issues the first challenge, rotates the token, and returns no secrets", async () => {
    const native = nativeCreate({ challengeToken: "rotated-secret-session-token" })
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
    const response = await app.request(requestCreate(await cookieCreate()), undefined, bindings)

    expect(response.status).toBe(201)
    const text = await response.text()
    expect(JSON.parse(text)).toEqual({
      success: true,
      data: {
        transition: {
          kind: "render",
          route: `/login/mfa?flow=${flowHandle}`,
          screen: { name: "mfa_email_otp_code", challengeIssued: true },
          csrfToken,
        },
      },
    })
    for (const hidden of [
      "secret-person@example.com",
      "user-secret-id",
      "session-secret-id",
      "old-secret-session-token",
      "latest-preflight-secret-token",
      "rotated-secret-session-token",
    ]) {
      expect(text).not.toContain(hidden)
      expect(JSON.stringify(logs)).not.toContain(hidden)
    }

    const opened = await flowV2CookieOpen(latestCookieValueGet(response), flowHandle, [key], now)
    expect(opened.success).toBe(true)
    if (!opened.success || opened.data.stage !== "mfa_email_otp_code") return
    expect(opened.data.sessionToken).toBe("rotated-secret-session-token")
    expect(opened.data.enrollmentActivationConsumedAt).toBe(now)
    expect(opened.data.challengeIssuedAt).toBe(now)
    const mutations = native.calls.filter((call) => call.method === "POST" || call.method === "PATCH")
    expect(mutations.map((call) => call.url)).toEqual([
      `${identityOrigin}/v2/users/user-secret-id/otp_email`,
      `${identityOrigin}/v2/sessions/session-secret-id`,
    ])
    expect(mutations[0]?.body).toEqual({})
    expect(mutations[1]?.body).toEqual({
      sessionToken: "latest-preflight-secret-token",
      challenges: { otpEmail: { sendCode: {} } },
      lifetime: "900s",
    })

    const mutationCount = mutations.length
    const resumed = await app.request(
      new Request(`${origin}/api/v2/flow/resume?flow=${flowHandle}`, {
        headers: { origin, cookie: `${cookieName}=${latestCookieValueGet(response)}` },
      }),
      undefined,
      bindings,
    )
    expect(resumed.status).toBe(200)
    expect(await resumed.json()).toEqual({
      success: true,
      data: {
        kind: "render",
        route: `/login/mfa?flow=${flowHandle}`,
        screen: { name: "mfa_email_otp_code", challengeIssued: true },
        csrfToken,
      },
    })
    expect(native.calls.filter((call) => call.method === "POST" || call.method === "PATCH")).toHaveLength(mutationCount)
  })

  test("allows policy-authorized optional setup", async () => {
    const native = nativeCreate({ forceMfa: false })
    const app = workerAppCreate({ fetch: native.fetch, now: () => now })
    const response = await app.request(requestCreate(await cookieCreate()), undefined, bindings)

    expect(response.status).toBe(201)
    expect(native.calls.filter((call) => call.url.endsWith("/otp_email"))).toHaveLength(1)
  })

  test("rejects unverified email, existing enrollment, primary-factor reuse, and policy changes before activation", async () => {
    const cases: NativeOptions[] = [
      { emailVerified: false },
      { methods: ["AUTHENTICATION_METHOD_TYPE_PASSWORD", "AUTHENTICATION_METHOD_TYPE_OTP_EMAIL"] },
      {
        factors: {
          user: { id: "user-secret-id", organizationId: "org-1" },
          otpEmail: { verifiedAt: "2027-01-15T08:00:00Z" },
        },
      },
      { secondFactors: [] },
    ]
    for (const options of cases) {
      const native = nativeCreate(options)
      const app = workerAppCreate({ fetch: native.fetch, now: () => now, logger: { warn: () => {}, error: () => {} } })
      const response = await app.request(requestCreate(await cookieCreate()), undefined, bindings)

      expect([403, 502]).toContain(response.status)
      expect(native.calls.some((call) => call.url.endsWith("/otp_email") && call.method === "POST")).toBe(false)
      expect(native.calls.some((call) => call.method === "PATCH")).toBe(false)
    }
  })

  test("rejects authorization, Session binding, CSRF, payload, expiry, and replay before activation", async () => {
    for (const options of [{ authClientId: "other-client" }, { sessionOrganizationId: "other-org" }]) {
      const native = nativeCreate(options)
      const app = workerAppCreate({ fetch: native.fetch, now: () => now, logger: { warn: () => {}, error: () => {} } })
      const response = await app.request(requestCreate(await cookieCreate()), undefined, bindings)
      expect([400, 409]).toContain(response.status)
      expect(native.calls.some((call) => call.url.endsWith("/otp_email"))).toBe(false)
    }

    const native = nativeCreate()
    const app = workerAppCreate({ fetch: native.fetch, now: () => now, logger: { warn: () => {}, error: () => {} } })
    const badCsrf = await app.request(
      requestCreate(await cookieCreate(), { method: "email_otp", csrfToken: "C".repeat(43) }),
      undefined,
      bindings,
    )
    expect(badCsrf.status).toBe(403)
    const browserEmail = await app.request(
      requestCreate(await cookieCreate(), { method: "email_otp", email: "attacker@example.com", csrfToken }),
      undefined,
      bindings,
    )
    expect(browserEmail.status).toBe(400)
    const expired = await app.request(
      requestCreate(await cookieCreate({ ...mfaState, expiresAt: now })),
      undefined,
      bindings,
    )
    expect(expired.status).toBe(409)
    const consumed: FlowV2Cookie = {
      ...mfaState,
      stage: "mfa_email_otp_code",
      transitionCounter: 3,
      enrollmentActivationConsumedAt: now,
    }
    const replay = await app.request(requestCreate(await cookieCreate(consumed)), undefined, bindings)
    expect(replay.status).toBe(409)
    expect(native.calls.some((call) => call.url.endsWith("/otp_email"))).toBe(false)
  })

  test("falls back safely when activation fails before native enrollment is observable", async () => {
    const native = nativeCreate({ addStatus: 503 })
    const app = workerAppCreate({
      fetch: native.fetch,
      now: () => now,
      randomBytes: (length) => new Uint8Array(length).fill(7),
      logger: { warn: () => {}, error: () => {} },
    })
    const response = await app.request(requestCreate(await cookieCreate()), undefined, bindings)

    expect(response.status).toBe(201)
    expect(await response.json()).toEqual({
      success: true,
      data: { transition: { kind: "fallback", path: `/api/v2/flow/fallback?flow=${flowHandle}` } },
    })
    expect(native.calls.filter((call) => call.url.endsWith("/otp_email"))).toHaveLength(1)
    expect(native.calls.some((call) => call.method === "PATCH")).toBe(false)
    const opened = await flowV2CookieOpen(latestCookieValueGet(response), flowHandle, [key], now)
    expect(opened.success).toBe(true)
    if (opened.success) expect(opened.data.stage).toBe("mfa_email_otp_code")
  })

  test("recovers an ambiguous activation through enrolled challenge without replaying AddOTPEmail", async () => {
    const native = nativeCreate({ addStatus: 503, activatedAfterAddFailure: true })
    const app = workerAppCreate({ fetch: native.fetch, now: () => now })
    const response = await app.request(requestCreate(await cookieCreate()), undefined, bindings)

    expect(response.status).toBe(201)
    expect(native.calls.filter((call) => call.url.endsWith("/otp_email"))).toHaveLength(1)
    expect(native.calls.filter((call) => call.method === "PATCH")).toHaveLength(1)
  })

  test("challenge failure seals recoverable enrollment state; replay cannot activate and resend can continue", async () => {
    const failedNative = nativeCreate({ challengeStatus: 503 })
    const failedApp = workerAppCreate({
      fetch: failedNative.fetch,
      now: () => now,
      randomBytes: (length) => new Uint8Array(length).fill(7),
    })
    const failed = await failedApp.request(requestCreate(await cookieCreate()), undefined, bindings)
    expect(failed.status).toBe(201)
    expect(await failed.clone().json()).toEqual({
      success: true,
      data: {
        transition: {
          kind: "render",
          route: `/login/mfa?flow=${flowHandle}`,
          screen: { name: "mfa_email_otp_code", challengeIssued: false },
          csrfToken,
        },
      },
    })
    const failedValue = latestCookieValueGet(failed)
    const opened = await flowV2CookieOpen(failedValue, flowHandle, [key], now)
    expect(opened.success).toBe(true)
    if (!opened.success || opened.data.stage !== "mfa_email_otp_code") return
    expect(opened.data.challengeIssuedAt).toBeUndefined()

    const failedCookie = `${cookieName}=${failedValue}`
    const replay = await failedApp.request(requestCreate(failedCookie), undefined, bindings)
    expect(replay.status).toBe(409)
    expect(failedNative.calls.filter((call) => call.url.endsWith("/otp_email"))).toHaveLength(1)

    const recoveryNative = nativeCreate({
      methods: ["AUTHENTICATION_METHOD_TYPE_PASSWORD", "AUTHENTICATION_METHOD_TYPE_OTP_EMAIL"],
      challengeToken: "recovered-secret-token",
    })
    const recoveryApp = workerAppCreate({ fetch: recoveryNative.fetch, now: () => now })
    const resend = await recoveryApp.request(
      new Request(`${origin}/api/v2/mfa/email-otp/resend?flow=${flowHandle}`, {
        method: "POST",
        headers: { origin, "content-type": "application/json", cookie: failedCookie },
        body: JSON.stringify({ csrfToken }),
      }),
      undefined,
      bindings,
    )
    expect(resend.status).toBe(202)
    expect(recoveryNative.calls.some((call) => call.url.endsWith("/otp_email"))).toBe(false)
  })

  test("re-evaluates setup policy from the code state and keeps resend challenge-scoped and rate-limited", async () => {
    const codeState: FlowV2Cookie = {
      ...mfaState,
      stage: "mfa_email_otp_code",
      transitionCounter: 3,
      enrollmentActivationConsumedAt: now,
      challengeIssuedAt: now,
      mfaMethods: [...mfaState.mfaMethods, "AUTHENTICATION_METHOD_TYPE_OTP_EMAIL"],
    }
    const changedNative = nativeCreate({
      methods: ["AUTHENTICATION_METHOD_TYPE_PASSWORD", "AUTHENTICATION_METHOD_TYPE_OTP_EMAIL"],
      secondFactors: [],
    })
    const changedApp = workerAppCreate({ fetch: changedNative.fetch, now: () => now })
    const options = await changedApp.request(
      new Request(`${origin}/api/v2/mfa/options?flow=${flowHandle}`, {
        headers: { origin, cookie: await cookieCreate(codeState) },
      }),
      undefined,
      bindings,
    )
    expect(options.status).toBe(200)
    expect(await options.json()).toEqual({
      success: true,
      data: { mode: "fallback", reason: "unsupported_branch" },
    })

    const limitedBindings: WorkerBindingsInput = {
      ...bindings,
      RATE_LIMITER: { limit: async () => ({ success: false }) },
    }
    const limitedNative = nativeCreate({
      methods: ["AUTHENTICATION_METHOD_TYPE_PASSWORD", "AUTHENTICATION_METHOD_TYPE_OTP_EMAIL"],
    })
    const limitedApp = workerAppCreate({ fetch: limitedNative.fetch, now: () => now })
    const resend = await limitedApp.request(
      new Request(`${origin}/api/v2/mfa/email-otp/resend?flow=${flowHandle}`, {
        method: "POST",
        headers: { origin, "content-type": "application/json", cookie: await cookieCreate(codeState) },
        body: JSON.stringify({ csrfToken }),
      }),
      undefined,
      limitedBindings,
    )
    expect(resend.status).toBe(429)
    expect(limitedNative.calls.some((call) => call.method === "PATCH")).toBe(false)

    const unchallenged: FlowV2Cookie = {
      ...codeState,
      challengeIssuedAt: undefined,
    }
    const verify = await changedApp.request(
      new Request(`${origin}/api/v2/mfa/email-otp/verify?flow=${flowHandle}`, {
        method: "POST",
        headers: { origin, "content-type": "application/json", cookie: await cookieCreate(unchallenged) },
        body: JSON.stringify({ code: "12345678", csrfToken }),
      }),
      undefined,
      bindings,
    )
    expect(verify.status).toBe(409)
    expect(changedNative.calls.some((call) => call.method === "PATCH")).toBe(false)
  })
})
