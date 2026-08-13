import { describe, expect, test } from "bun:test"

import type { WorkerBindingsInput } from "../src/config/workerBindingsSchema"
import { flowV2CookieOpen } from "../src/flow/domain/flowV2CookieOpen"
import { flowV2CookieSeal } from "../src/flow/domain/flowV2CookieSeal"
import type { FlowV2Cookie } from "../src/flow/model/flowV2CookieSchema"
import { workerAppCreate } from "../src/worker/workerAppCreate"

const origin = "https://login.example"
const identityOrigin = "https://identity.example"
const key = "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA"
const previousKey = "BBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB"
const now = 1_800_000_000

const bindings: WorkerBindingsInput = {
  ZITADEL_ORIGIN: identityOrigin,
  ZITADEL_ORGANIZATION_ID: "org-1",
  ZITADEL_ALLOWED_CLIENT_IDS: "client-1",
  LOGIN_V2_FALLBACK_URL: `${identityOrigin}/ui/v2/login`,
  PAGES_ORIGIN: origin,
  SESSION_LIFETIME_SECONDS: "900",
  ZITADEL_LOGIN_CLIENT_PAT: "test-pat-not-a-real-secret-value",
  FLOW_COOKIE_KEY: key,
  ZITADEL_CUSTOM_LOGIN_ENABLED: "true",
  FLOW_COOKIE_PREVIOUS_KEY: previousKey,
  RATE_LIMITER: { limit: async () => ({ success: true }) },
}

const authRequest = {
  id: "request-1",
  clientId: "client-1",
  redirectUri: "https://client.example/callback?tenant=one",
  scope: ["openid", "urn:zitadel:iam:org:id:org-1"],
  prompt: ["PROMPT_LOGIN"],
  uiLocales: ["de"],
  loginHint: "person@example.com",
  hintUserId: "user-1",
  maxAge: "0s",
}

type NativeOptions = {
  auth?: typeof authRequest
  callbackUrl?: string
  localAuthentication?: boolean
  ignoreUnknownUsernames?: boolean
  methods?: string[]
  users?: unknown[]
  verifyStatus?: number
}

function nativeCreate(options: NativeOptions = {}) {
  const calls: Array<{ method: string; url: string; body?: unknown }> = []
  let callbackCompleted = false
  let verified = false
  let token = "created-token"
  const request = options.auth ?? authRequest
  const fetch = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const url = String(input)
    const method = init?.method ?? "GET"
    const body = init?.body ? JSON.parse(String(init.body)) : undefined
    calls.push({ method, url, ...(body === undefined ? {} : { body }) })

    if (url === `${identityOrigin}/v2/oidc/auth_requests/${request.id}` && method === "GET") {
      if (callbackCompleted) return Response.json({}, { status: 404 })
      return Response.json({ authRequest: request })
    }
    if (url === `${identityOrigin}/v2/settings/login` && method === "GET") {
      return Response.json({
        settings: {
          allowLocalAuthentication: options.localAuthentication ?? true,
          ignoreUnknownUsernames: options.ignoreUnknownUsernames ?? false,
        },
      })
    }
    if (url === `${identityOrigin}/v2/users` && method === "POST") {
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
      token = "created-token"
      return Response.json({ sessionId: "session-1", sessionToken: token }, { status: 201 })
    }
    if (url === `${identityOrigin}/v2/sessions/session-1` && method === "PATCH") {
      if (body?.checks?.otpEmail) {
        if (options.verifyStatus) return Response.json({}, { status: options.verifyStatus })
        verified = true
        token = "verified-token"
      } else {
        token = "resent-token"
      }
      return Response.json({ sessionToken: token })
    }
    if (url.startsWith(`${identityOrigin}/v2/sessions/session-1?`) && method === "GET") {
      const query = new URL(url).searchParams
      if (query.get("sessionToken") !== token) return Response.json({}, { status: 401 })
      return Response.json({
        session: {
          id: "session-1",
          expirationDate: "2027-02-01T00:00:00Z",
          factors: {
            user: { id: "user-1", organizationId: "org-1" },
            ...(verified ? { otpEmail: { verifiedAt: new Date(now * 1000).toISOString() } } : {}),
          },
        },
      })
    }
    if (url === `${identityOrigin}/v2/oidc/auth_requests/${request.id}` && method === "POST") {
      callbackCompleted = true
      return Response.json({
        callbackUrl:
          options.callbackUrl ?? "https://client.example/callback?tenant=one&code=credential&state=opaque-state",
      })
    }
    throw new Error(`Unexpected native request: ${method} ${url}`)
  }
  return { fetch, calls }
}

function cookieGet(response: Response): string {
  const header = response.headers.get("set-cookie")
  if (!header) throw new Error("Expected flow cookie")
  return header.split(";", 1)[0] ?? ""
}

function jsonHeaders(cookie?: string): HeadersInit {
  return {
    origin,
    "content-type": "application/json",
    ...(cookie ? { cookie } : {}),
  }
}

async function flowInitialize(
  app: ReturnType<typeof workerAppCreate>,
  inputBindings: WorkerBindingsInput = bindings,
  requestId = authRequest.id,
) {
  const response = await app.request(
    `${origin}/api/v2/flow/initialize`,
    { method: "POST", headers: jsonHeaders(), body: JSON.stringify({ authRequest: requestId }) },
    inputBindings,
  )
  const body = await response.json()
  if (!body.success) throw new Error(`Initialization failed: ${body.errorMessage}`)
  const flow = new URL(`${origin}${body.data.route ?? body.data.path}`).searchParams.get("flow")
  if (!flow) throw new Error("Expected opaque flow handle")
  return { response, body, flow, cookie: cookieGet(response), csrfToken: body.data.csrfToken as string | undefined }
}

describe("Worker v2 flow foundation", () => {
  test("initializes and resumes canonical state without exposing native or session credentials", async () => {
    const native = nativeCreate()
    const app = workerAppCreate({
      fetch: native.fetch,
      now: () => now,
      randomBytes: (length) => new Uint8Array(length).fill(7),
    })
    const initialized = await flowInitialize(app)

    expect(initialized.response.status).toBe(200)
    expect(initialized.flow).toMatch(/^[A-Za-z0-9_-]{22}$/)
    expect(initialized.body).toEqual({
      success: true,
      data: {
        kind: "render",
        route: `/login/email-otp?flow=${initialized.flow}`,
        screen: { name: "email_otp_start", loginHint: "person@example.com" },
        csrfToken: expect.stringMatching(/^[A-Za-z0-9_-]{43}$/),
      },
    })
    expect(initialized.cookie).toStartWith(`__Host-zitadel-login-flow-${initialized.flow}=`)
    expect(initialized.response.headers.get("set-cookie")).toContain("HttpOnly; Secure; SameSite=Lax")
    expect(JSON.stringify(initialized.body)).not.toContain(authRequest.id)
    expect(initialized.cookie).not.toContain(authRequest.id)
    expect(initialized.cookie).not.toContain("created-token")
    const opened = await flowV2CookieOpen(initialized.cookie.split("=")[1] ?? "", initialized.flow, [key], now)
    expect(opened).toEqual(
      expect.objectContaining({
        success: true,
        data: expect.objectContaining({
          authRequestId: authRequest.id,
          prompt: ["PROMPT_LOGIN"],
          loginHint: "person@example.com",
          maxAgeSeconds: 0,
        }),
      }),
    )

    const resumed = await app.request(
      `${origin}/api/v2/flow/resume?flow=${initialized.flow}`,
      {
        headers: { cookie: initialized.cookie },
      },
      bindings,
    )
    expect(resumed.status).toBe(200)
    expect(await resumed.json()).toEqual(initialized.body)
    expect(native.calls).toHaveLength(2)
  })

  test("rejects unknown, malformed, duplicated, expired, and wrong-handle state", async () => {
    const native = nativeCreate()
    const app = workerAppCreate({ fetch: native.fetch, now: () => now })
    const unknown = await app.request(`${origin}/api/v2/flow/resume?flow=${"A".repeat(22)}`, {}, bindings)
    expect(unknown.status).toBe(404)
    expect(await unknown.json()).toEqual({ success: false, op: "flowResume", errorMessage: "flow_unknown" })

    const malformed = await app.request(`${origin}/api/v2/flow/resume?flow=bad`, {}, bindings)
    expect(malformed.status).toBe(400)
    const duplicated = await app.request(
      `${origin}/api/v2/flow/resume?flow=${"A".repeat(22)}&flow=${"B".repeat(22)}`,
      {},
      bindings,
    )
    expect(duplicated.status).toBe(400)

    const handle = "C".repeat(22)
    const expiredState: FlowV2Cookie = {
      version: 2,
      flowHandle: handle,
      requestKind: "oidc",
      authRequestId: authRequest.id,
      clientId: authRequest.clientId,
      redirectUri: authRequest.redirectUri,
      organizationId: "org-1",
      prompt: ["PROMPT_LOGIN"],
      csrfToken: "D".repeat(43),
      issuedAt: now - 901,
      expiresAt: now - 1,
      transitionCounter: 0,
      stage: "ready",
      delegable: true,
      owned: true,
    }
    const sealed = await flowV2CookieSeal(expiredState, key, new Uint8Array(12).fill(1))
    if (!sealed.success) throw new Error("Expected state to seal")
    const expired = await app.request(
      `${origin}/api/v2/flow/resume?flow=${handle}`,
      {
        headers: { cookie: `__Host-zitadel-login-flow-${handle}=${sealed.data}` },
      },
      bindings,
    )
    expect(expired.status).toBe(409)
    expect(await expired.json()).toEqual({ success: false, op: "flowResume", errorMessage: "flow_expired" })
    expect(expired.headers.get("set-cookie")).toContain("Max-Age=0")

    const wrongHandle = "E".repeat(22)
    const wrong = await app.request(
      `${origin}/api/v2/flow/resume?flow=${wrongHandle}`,
      {
        headers: { cookie: `__Host-zitadel-login-flow-${wrongHandle}=${sealed.data}` },
      },
      bindings,
    )
    expect(wrong.status).toBe(409)
    expect(await wrong.json()).toEqual({ success: false, op: "flowResume", errorMessage: "flow_invalid" })
  })

  test("opens state sealed by the immediately previous key", async () => {
    const native = nativeCreate()
    const app = workerAppCreate({ fetch: native.fetch, now: () => now })
    const handle = "F".repeat(22)
    const state: FlowV2Cookie = {
      version: 2,
      flowHandle: handle,
      requestKind: "oidc",
      authRequestId: authRequest.id,
      clientId: authRequest.clientId,
      redirectUri: authRequest.redirectUri,
      organizationId: "org-1",
      prompt: ["PROMPT_LOGIN"],
      csrfToken: "G".repeat(43),
      issuedAt: now,
      expiresAt: now + 900,
      transitionCounter: 0,
      stage: "ready",
      delegable: true,
      owned: true,
    }
    const sealed = await flowV2CookieSeal(state, previousKey, new Uint8Array(12).fill(2))
    if (!sealed.success) throw new Error("Expected state to seal")
    const resumed = await app.request(
      `${origin}/api/v2/flow/resume?flow=${handle}`,
      {
        headers: { cookie: `__Host-zitadel-login-flow-${handle}=${sealed.data}` },
      },
      bindings,
    )
    expect(resumed.status).toBe(200)
  })

  test("completes prompt none as login_required without rendering or creating a session", async () => {
    const silent = { ...authRequest, id: "silent-1", prompt: ["PROMPT_NONE"] }
    const native = nativeCreate({ auth: silent })
    const app = workerAppCreate({
      fetch: native.fetch,
      now: () => now,
      randomBytes: (length) => new Uint8Array(length).fill(8),
    })
    const initialized = await flowInitialize(app, bindings, silent.id)
    expect(initialized.body.data).toEqual({
      kind: "complete",
      path: `/api/v2/flow/continue?flow=${initialized.flow}`,
    })

    const continued = await app.request(
      `${origin}${initialized.body.data.path}`,
      {
        headers: { cookie: initialized.cookie },
      },
      bindings,
    )
    expect(continued.status).toBe(302)
    expect(continued.headers.get("location")).toBe(
      "https://client.example/callback?tenant=one&code=credential&state=opaque-state",
    )
    expect(native.calls.some((call) => call.url === `${identityOrigin}/v2/sessions`)).toBe(false)
    expect(native.calls.at(-1)?.body).toEqual({ error: { error: "ERROR_REASON_LOGIN_REQUIRED" } })
  })

  test("falls back before mutation for disabled capabilities, unsupported prompts, and ineligible users", async () => {
    const cases = [
      {
        name: "capability disabled",
        inputBindings: { ...bindings, ZITADEL_CUSTOM_LOGIN_ENABLED: "false" },
        native: nativeCreate(),
      },
      {
        name: "select account",
        inputBindings: bindings,
        native: nativeCreate({ auth: { ...authRequest, prompt: ["PROMPT_SELECT_ACCOUNT"] } }),
      },
      {
        name: "local authentication disabled",
        inputBindings: bindings,
        native: nativeCreate({ localAuthentication: false }),
        start: true,
      },
      {
        name: "unknown user",
        inputBindings: bindings,
        native: nativeCreate({ users: [] }),
        start: true,
      },
      {
        name: "OTP method absent",
        inputBindings: bindings,
        native: nativeCreate({ methods: ["AUTHENTICATION_METHOD_TYPE_PASSWORD"] }),
        start: true,
      },
    ]

    for (const item of cases) {
      const app = workerAppCreate({
        fetch: item.native.fetch,
        now: () => now,
        randomBytes: (length) => new Uint8Array(length).fill(9),
      })
      const requestId = item.name === "select account" ? authRequest.id : authRequest.id
      const initialized = await flowInitialize(app, item.inputBindings, requestId)
      let transition = initialized.body.data
      let cookie = initialized.cookie
      if (item.start) {
        const started = await app.request(
          `${origin}/api/v2/email-otp/start?flow=${initialized.flow}`,
          {
            method: "POST",
            headers: jsonHeaders(cookie),
            body: JSON.stringify({ email: "person@example.com", csrfToken: initialized.csrfToken }),
          },
          item.inputBindings,
        )
        expect(started.status, item.name).toBe(200)
        const body = await started.json()
        transition = body.data
        cookie = started.headers.get("set-cookie") ? cookieGet(started) : cookie
      }
      expect(transition, item.name).toEqual({
        kind: "fallback",
        path: `/api/v2/flow/fallback?flow=${initialized.flow}`,
      })
      expect(
        item.native.calls.some((call) => call.url === `${identityOrigin}/v2/sessions`),
        item.name,
      ).toBe(false)

      const fallback = await app.request(`${origin}${transition.path}`, { headers: { cookie } }, item.inputBindings)
      expect(fallback.status, item.name).toBe(302)
      expect(fallback.headers.get("location"), item.name).toBe(
        `${identityOrigin}/ui/v2/login?authRequest=${authRequest.id}`,
      )
    }
  })

  test("preflights unsupported prompts and login hints without mutation while max_age allows fresh primary auth", async () => {
    const consentRequest = { ...authRequest, prompt: ["PROMPT_CONSENT"] }
    const consentNative = nativeCreate({ auth: consentRequest })
    const consentApp = workerAppCreate({
      fetch: consentNative.fetch,
      now: () => now,
      randomBytes: (length) => new Uint8Array(length).fill(17),
    })
    const consent = await flowInitialize(consentApp)
    expect(consent.body.data).toEqual({
      kind: "fallback",
      path: `/api/v2/flow/fallback?flow=${consent.flow}`,
    })
    expect(consentNative.calls.every((call) => call.method === "GET")).toBe(true)

    const mixedPromptRequest = { ...authRequest, prompt: ["PROMPT_NONE", "PROMPT_LOGIN"] }
    const mixedNative = nativeCreate({ auth: mixedPromptRequest })
    const mixedApp = workerAppCreate({ fetch: mixedNative.fetch, now: () => now })
    const mixed = await mixedApp.request(
      `${origin}/api/v2/flow/initialize`,
      { method: "POST", headers: jsonHeaders(), body: JSON.stringify({ authRequest: authRequest.id }) },
      bindings,
    )
    expect(mixed.status).toBe(403)
    expect(mixedNative.calls).toHaveLength(1)

    const hintedRequest = { ...authRequest, loginHint: "other@example.com", maxAge: "0s" }
    const hintedNative = nativeCreate({ auth: hintedRequest })
    const hintedApp = workerAppCreate({
      fetch: hintedNative.fetch,
      now: () => now,
      randomBytes: (length) => new Uint8Array(length).fill(18),
    })
    const hinted = await flowInitialize(hintedApp)
    const hintedStart = await hintedApp.request(
      `${origin}/api/v2/email-otp/start?flow=${hinted.flow}`,
      {
        method: "POST",
        headers: jsonHeaders(hinted.cookie),
        body: JSON.stringify({ email: "person@example.com", csrfToken: hinted.csrfToken }),
      },
      bindings,
    )
    expect(await hintedStart.json()).toEqual({
      success: true,
      data: { kind: "fallback", path: `/api/v2/flow/fallback?flow=${hinted.flow}` },
    })
    expect(hintedNative.calls.some((call) => call.url === `${identityOrigin}/v2/sessions`)).toBe(false)

    const matchingNative = nativeCreate()
    const matchingApp = workerAppCreate({
      fetch: matchingNative.fetch,
      now: () => now,
      randomBytes: (length) => new Uint8Array(length).fill(19),
    })
    const matching = await flowInitialize(matchingApp)
    const matchingStart = await matchingApp.request(
      `${origin}/api/v2/email-otp/start?flow=${matching.flow}`,
      {
        method: "POST",
        headers: jsonHeaders(matching.cookie),
        body: JSON.stringify({ email: "person@example.com", csrfToken: matching.csrfToken }),
      },
      bindings,
    )
    expect(matchingStart.status).toBe(202)
    expect(matchingNative.calls.some((call) => call.url === `${identityOrigin}/v2/sessions`)).toBe(true)
  })

  test("uses native email OTP while custom login is enabled", async () => {
    const native = nativeCreate()
    const app = workerAppCreate({
      fetch: native.fetch,
      now: () => now,
      randomBytes: (length) => new Uint8Array(length).fill(20),
    })
    const initialized = await flowInitialize(app)
    expect(initialized.body.data.kind).toBe("render")

    const started = await app.request(
      `${origin}/api/v2/email-otp/start?flow=${initialized.flow}`,
      {
        method: "POST",
        headers: jsonHeaders(initialized.cookie),
        body: JSON.stringify({ email: "person@example.com", csrfToken: initialized.csrfToken }),
      },
      bindings,
    )
    expect(started.status).toBe(202)
    expect(native.calls.some((call) => call.url === `${identityOrigin}/v2/sessions`)).toBe(true)
  })

  test("rejects unsupported protocol and client input and delegates unsupported organization scope", async () => {
    const native = nativeCreate()
    const app = workerAppCreate({ fetch: native.fetch, now: () => now })
    const protocol = await app.request(
      `${origin}/api/v2/flow/initialize`,
      { method: "POST", headers: jsonHeaders(), body: JSON.stringify({ samlRequest: "saml-1" }) },
      bindings,
    )
    expect(protocol.status).toBe(400)
    expect(native.calls).toHaveLength(0)

    const wrongClientRequest = { ...authRequest, clientId: "client-2" }
    const wrongClientNative = nativeCreate({ auth: wrongClientRequest })
    const wrongClientApp = workerAppCreate({ fetch: wrongClientNative.fetch, now: () => now })
    const wrongClient = await wrongClientApp.request(
      `${origin}/api/v2/flow/initialize`,
      { method: "POST", headers: jsonHeaders(), body: JSON.stringify({ authRequest: authRequest.id }) },
      bindings,
    )
    expect(wrongClient.status).toBe(403)
    expect(await wrongClient.json()).toEqual({ success: false, op: "flowInitialize", errorMessage: "request_rejected" })
    expect(wrongClientNative.calls.every((call) => call.method === "GET")).toBe(true)

    const wrongScopeRequest = {
      ...authRequest,
      scope: ["openid", "urn:zitadel:iam:org:id:org-2"],
    }
    const wrongScopeNative = nativeCreate({ auth: wrongScopeRequest })
    const wrongScopeApp = workerAppCreate({
      fetch: wrongScopeNative.fetch,
      now: () => now,
      randomBytes: (length) => new Uint8Array(length).fill(16),
    })
    const wrongScope = await flowInitialize(wrongScopeApp)
    expect(wrongScope.body.data).toEqual({
      kind: "fallback",
      path: `/api/v2/flow/fallback?flow=${wrongScope.flow}`,
    })
    expect(wrongScopeNative.calls.every((call) => call.method === "GET")).toBe(true)
  })

  test("starts, resends, verifies, and continues with only the latest native session token", async () => {
    const native = nativeCreate()
    const app = workerAppCreate({
      fetch: native.fetch,
      now: () => now,
      randomBytes: (length) => new Uint8Array(length).fill(10),
    })
    const initialized = await flowInitialize(app)
    const started = await app.request(
      `${origin}/api/v2/email-otp/start?flow=${initialized.flow}`,
      {
        method: "POST",
        headers: jsonHeaders(initialized.cookie),
        body: JSON.stringify({ email: "Person@Example.com", csrfToken: initialized.csrfToken }),
      },
      bindings,
    )
    expect(started.status).toBe(202)
    expect(await started.clone().json()).toEqual({
      success: true,
      data: {
        kind: "render",
        route: `/login/email-otp?flow=${initialized.flow}`,
        screen: { name: "email_otp_code" },
        csrfToken: initialized.csrfToken,
      },
    })
    const startedCookie = cookieGet(started)
    const createCall = native.calls.find((call) => call.url === `${identityOrigin}/v2/sessions`)
    expect(createCall?.body).toEqual({
      checks: { user: { userId: "user-1" } },
      challenges: { otpEmail: { sendCode: {} } },
      lifetime: "900s",
    })

    const resent = await app.request(
      `${origin}/api/v2/email-otp/resend?flow=${initialized.flow}`,
      {
        method: "POST",
        headers: jsonHeaders(startedCookie),
        body: JSON.stringify({ csrfToken: initialized.csrfToken }),
      },
      bindings,
    )
    expect(resent.status).toBe(202)
    const resentCookie = cookieGet(resent)
    const resendCall = native.calls.find(
      (call) => call.method === "PATCH" && (call.body as { challenges?: unknown })?.challenges,
    )
    expect(resendCall?.body).toEqual({
      sessionToken: "created-token",
      challenges: { otpEmail: { sendCode: {} } },
      lifetime: "900s",
    })

    const verified = await app.request(
      `${origin}/api/v2/email-otp/verify?flow=${initialized.flow}`,
      {
        method: "POST",
        headers: jsonHeaders(resentCookie),
        body: JSON.stringify({ code: "123456", csrfToken: initialized.csrfToken }),
      },
      bindings,
    )
    expect(verified.status).toBe(200)
    const verifiedBody = await verified.clone().json()
    expect(verifiedBody).toEqual({
      success: true,
      data: { kind: "complete", path: `/api/v2/flow/continue?flow=${initialized.flow}` },
    })
    const verifyCall = native.calls.find(
      (call) => call.method === "PATCH" && (call.body as { checks?: unknown })?.checks,
    )
    expect(verifyCall?.body).toEqual({
      sessionToken: "resent-token",
      checks: { otpEmail: { code: "123456" } },
      lifetime: "900s",
    })

    const verifiedCookie = cookieGet(verified)
    const continued = await app.request(
      `${origin}${verifiedBody.data.path}`,
      {
        headers: { cookie: verifiedCookie },
      },
      bindings,
    )
    expect(continued.status).toBe(302)
    expect(continued.headers.get("location")).toBe(
      "https://client.example/callback?tenant=one&code=credential&state=opaque-state",
    )
    const callbackCall = native.calls.at(-1)
    expect(callbackCall?.body).toEqual({
      session: { sessionId: "session-1", sessionToken: "verified-token" },
    })
    expect(continued.headers.get("set-cookie")).toContain("Max-Age=0")

    const replayed = await app.request(
      `${origin}${verifiedBody.data.path}`,
      {
        headers: { cookie: verifiedCookie },
      },
      bindings,
    )
    expect(replayed.status).toBe(409)
    expect(await replayed.json()).toEqual({ success: false, op: "flowContinue", errorMessage: "flow_replayed" })
  })

  test("denies fallback after challenge mutation", async () => {
    const native = nativeCreate()
    const app = workerAppCreate({
      fetch: native.fetch,
      now: () => now,
      randomBytes: (length) => new Uint8Array(length).fill(11),
    })
    const initialized = await flowInitialize(app)
    const started = await app.request(
      `${origin}/api/v2/email-otp/start?flow=${initialized.flow}`,
      {
        method: "POST",
        headers: jsonHeaders(initialized.cookie),
        body: JSON.stringify({ email: "person@example.com", csrfToken: initialized.csrfToken }),
      },
      bindings,
    )
    const fallback = await app.request(
      `${origin}/api/v2/flow/fallback?flow=${initialized.flow}`,
      {
        headers: { cookie: cookieGet(started) },
      },
      bindings,
    )
    expect(fallback.status).toBe(409)
    expect(await fallback.json()).toEqual({ success: false, op: "flowFallback", errorMessage: "fallback_forbidden" })
  })

  test("uses a non-mutating decoy challenge when enumeration protection hides an unknown email", async () => {
    const native = nativeCreate({ users: [], ignoreUnknownUsernames: true })
    const app = workerAppCreate({
      fetch: native.fetch,
      now: () => now,
      randomBytes: (length) => new Uint8Array(length).fill(15),
    })
    const initialized = await flowInitialize(app)
    const started = await app.request(
      `${origin}/api/v2/email-otp/start?flow=${initialized.flow}`,
      {
        method: "POST",
        headers: jsonHeaders(initialized.cookie),
        body: JSON.stringify({ email: "absent@example.com", csrfToken: initialized.csrfToken }),
      },
      bindings,
    )
    expect(started.status).toBe(202)
    const startedBody = await started.clone().json()
    expect(startedBody.data.screen).toEqual({ name: "email_otp_code" })

    const resent = await app.request(
      `${origin}/api/v2/email-otp/resend?flow=${initialized.flow}`,
      {
        method: "POST",
        headers: jsonHeaders(cookieGet(started)),
        body: JSON.stringify({ csrfToken: initialized.csrfToken }),
      },
      bindings,
    )
    expect(resent.status).toBe(202)

    const verified = await app.request(
      `${origin}/api/v2/email-otp/verify?flow=${initialized.flow}`,
      {
        method: "POST",
        headers: jsonHeaders(cookieGet(resent)),
        body: JSON.stringify({ code: "123456", csrfToken: initialized.csrfToken }),
      },
      bindings,
    )
    expect(verified.status).toBe(401)
    expect(await verified.json()).toEqual({ success: false, op: "emailOtpVerify", errorMessage: "code_invalid" })
    expect(native.calls.some((call) => call.url === `${identityOrigin}/v2/sessions`)).toBe(false)
    expect(native.calls.some((call) => call.method === "PATCH")).toBe(false)
  })

  test("classifies invalid codes and redacts native error bodies", async () => {
    const native = nativeCreate({ verifyStatus: 400 })
    const app = workerAppCreate({
      fetch: native.fetch,
      now: () => now,
      randomBytes: (length) => new Uint8Array(length).fill(12),
      logger: { warn: () => undefined, error: () => undefined },
    })
    const initialized = await flowInitialize(app)
    const started = await app.request(
      `${origin}/api/v2/email-otp/start?flow=${initialized.flow}`,
      {
        method: "POST",
        headers: jsonHeaders(initialized.cookie),
        body: JSON.stringify({ email: "person@example.com", csrfToken: initialized.csrfToken }),
      },
      bindings,
    )
    const verified = await app.request(
      `${origin}/api/v2/email-otp/verify?flow=${initialized.flow}`,
      {
        method: "POST",
        headers: jsonHeaders(cookieGet(started)),
        body: JSON.stringify({ code: "wrong", csrfToken: initialized.csrfToken }),
      },
      bindings,
    )
    expect(verified.status).toBe(401)
    expect(await verified.json()).toEqual({ success: false, op: "emailOtpVerify", errorMessage: "code_invalid" })
  })

  test("enforces exact host, origin, CSRF, and opaque rate-limit keys before mutation", async () => {
    const native = nativeCreate()
    const keys: string[] = []
    const limitedBindings: WorkerBindingsInput = {
      ...bindings,
      RATE_LIMITER: {
        limit: async ({ key: limitKey }) => {
          keys.push(limitKey)
          return { success: !limitKey.startsWith("v2-otp-start:email:") }
        },
      },
    }
    const app = workerAppCreate({
      fetch: native.fetch,
      now: () => now,
      randomBytes: (length) => new Uint8Array(length).fill(13),
    })
    const wrongHost = await app.request(
      "https://worker.example/api/v2/flow/initialize",
      { method: "POST", headers: jsonHeaders(), body: JSON.stringify({ authRequest: authRequest.id }) },
      bindings,
    )
    expect(wrongHost.status).toBe(403)
    const wrongOrigin = await app.request(
      `${origin}/api/v2/flow/initialize`,
      {
        method: "POST",
        headers: { origin: "https://attacker.example", "content-type": "application/json" },
        body: JSON.stringify({ authRequest: authRequest.id }),
      },
      bindings,
    )
    expect(wrongOrigin.status).toBe(403)

    const initialized = await flowInitialize(app, limitedBindings)
    const csrf = await app.request(
      `${origin}/api/v2/email-otp/start?flow=${initialized.flow}`,
      {
        method: "POST",
        headers: jsonHeaders(initialized.cookie),
        body: JSON.stringify({ email: "person@example.com", csrfToken: "X".repeat(43) }),
      },
      limitedBindings,
    )
    expect(csrf.status).toBe(403)
    const limited = await app.request(
      `${origin}/api/v2/email-otp/start?flow=${initialized.flow}`,
      {
        method: "POST",
        headers: jsonHeaders(initialized.cookie),
        body: JSON.stringify({ email: "Person@Example.com", csrfToken: initialized.csrfToken }),
      },
      limitedBindings,
    )
    expect(limited.status).toBe(429)
    expect(limited.headers.get("retry-after")).toBe("60")
    expect(keys.some((limitKey) => limitKey.includes("person@example.com"))).toBe(false)
    expect(native.calls.some((call) => call.url === `${identityOrigin}/v2/sessions`)).toBe(false)
  })

  test("rejects callbacks not owned by the native redirect URI", async () => {
    const silent = { ...authRequest, prompt: ["PROMPT_NONE"] }
    const silentNative = nativeCreate({
      auth: silent,
      callbackUrl: "https://attacker.example/callback?code=credential",
    })
    const silentApp = workerAppCreate({
      fetch: silentNative.fetch,
      now: () => now,
      randomBytes: (length) => new Uint8Array(length).fill(14),
      logger: { warn: () => undefined, error: () => undefined },
    })
    const initialized = await flowInitialize(silentApp)
    const continued = await silentApp.request(
      `${origin}${initialized.body.data.path}`,
      {
        headers: { cookie: initialized.cookie },
      },
      bindings,
    )
    expect(continued.status).toBe(502)
    expect(await continued.json()).toEqual({
      success: false,
      op: "flowContinue",
      errorMessage: "callback_unavailable",
    })
    expect(JSON.stringify(await Promise.resolve(continued.headers.get("location")))).not.toContain("attacker")
  })
})
