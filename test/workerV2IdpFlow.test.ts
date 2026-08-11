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
const csrfToken = "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA"

const bindings: WorkerBindingsInput = {
  ZITADEL_ORIGIN: identityOrigin,
  ZITADEL_ORGANIZATION_ID: "org-1",
  ZITADEL_ALLOWED_CLIENT_IDS: "client-1",
  LOGIN_V2_FALLBACK_URL: `${identityOrigin}/ui/v2/login`,
  PAGES_ORIGIN: origin,
  SESSION_LIFETIME_SECONDS: "900",
  ZITADEL_LOGIN_CLIENT_PAT: "test-pat-not-a-real-secret-value",
  FLOW_COOKIE_KEY: key,
  ZITADEL_LOGIN_V2_ENABLED: "true",
  ZITADEL_EMAIL_OTP_V2_ENABLED: "true",
  ZITADEL_PASSWORD_V2_ENABLED: "true",
  ZITADEL_PASSKEY_V2_ENABLED: "true",
  ZITADEL_IDP_V2_ENABLED: "true",
  ZITADEL_MFA_V2_ENABLED: "true",
  RATE_LIMITER: { limit: async () => ({ success: true }) },
}

const authRequest = {
  id: "request-1",
  clientId: "client-1",
  redirectUri: "https://client.example/callback",
  scope: ["openid", "urn:zitadel:iam:org:id:org-1"],
  prompt: ["PROMPT_LOGIN"],
}

const googleProvider = {
  id: "google-1",
  name: "Google",
  type: "IDENTITY_PROVIDER_TYPE_GOOGLE",
}

const githubProvider = {
  id: "github-1",
  name: "GitHub",
  type: "IDENTITY_PROVIDER_TYPE_GITHUB",
}

type NativeOptions = {
  providers?: unknown[]
  providersStatus?: number
  allowExternalIdp?: boolean
  intentAuthUrl?: string
  intentStatus?: number
}

function nativeCreate(options: NativeOptions = {}) {
  const calls: Array<{ method: string; url: string; body?: unknown }> = []
  const fetch = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const url = String(input)
    const method = init?.method ?? "GET"
    const body = init?.body ? JSON.parse(String(init.body)) : undefined
    calls.push({ method, url, ...(body === undefined ? {} : { body }) })

    if (url === `${identityOrigin}/v2/oidc/auth_requests/${authRequest.id}` && method === "GET") {
      return Response.json({ authRequest })
    }
    if (url === `${identityOrigin}/v2/settings/login` && method === "GET") {
      return Response.json({
        settings: {
          allowExternalIdp: options.allowExternalIdp ?? true,
          allowLocalAuthentication: true,
        },
      })
    }
    if (url === `${identityOrigin}/v2/settings/login/idps` && method === "GET") {
      if (options.providersStatus) {
        return Response.json({ error: "upstream provider list failed" }, { status: options.providersStatus })
      }
      return Response.json({
        identityProviders: options.providers ?? [googleProvider, githubProvider],
      })
    }
    if (url === `${identityOrigin}/v2/idp_intents` && method === "POST") {
      if (options.intentStatus) {
        return Response.json({ error: "upstream intent failed" }, { status: options.intentStatus })
      }
      return Response.json({
        authUrl: options.intentAuthUrl ?? "https://accounts.google.com/o/oauth2/v2/auth?client_id=google-client",
      })
    }
    throw new Error(`Unexpected native request: ${method} ${url}`)
  }
  return { calls, fetch }
}

async function readyStateSeal(overrides: Partial<Extract<FlowV2Cookie, { stage: "ready" }>> = {}) {
  const base: Extract<FlowV2Cookie, { stage: "ready" }> = {
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
    transitionCounter: 0,
    stage: "ready",
    delegable: true,
    owned: true,
    ...overrides,
  }
  return (await flowV2CookieSeal(base, key, new Uint8Array(12))).data
}

function flowCookieNameGet(handle: string) {
  return `__Host-zitadel-login-flow-${handle}`
}

describe("POST /api/v2/identity-provider/start", () => {
  test("starts Google-style IdP intent successfully", async () => {
    const native = nativeCreate()
    const app = workerAppCreate({ fetch: native.fetch, now: () => now })
    const cookieValue = await readyStateSeal()

    const response = await app.request(
      `https://login.example/api/v2/identity-provider/start?flow=${flowHandle}`,
      {
        method: "POST",
        headers: {
          origin: "https://login.example",
          "content-type": "application/json",
          cookie: `${flowCookieNameGet(flowHandle)}=${cookieValue}`,
        },
        body: JSON.stringify({
          idpId: "google-1",
          csrfToken,
        }),
      },
      bindings,
    )

    expect(response.status).toBe(200)
    const json = (await response.json()) as { success: boolean; data: { redirectUrl: string } }
    expect(json.success).toBe(true)
    expect(json.data.redirectUrl).toBe(`/api/v2/identity-provider/redirect?flow=${flowHandle}`)

    const setCookie = response.headers.get("set-cookie")
    expect(setCookie).toBeTruthy()
    expect(setCookie).toContain(`__Host-zitadel-login-flow-${flowHandle}=`)

    const cookieMatch = setCookie?.match(new RegExp(`__Host-zitadel-login-flow-${flowHandle}=([^;]+)`))
    expect(cookieMatch).toBeTruthy()
    const opened = await flowV2CookieOpen(cookieMatch![1], flowHandle, [key], now)
    expect(opened.success).toBe(true)
    expect(opened.data.stage).toBe("idp_intent")
    if (opened.data.stage === "idp_intent") {
      expect(opened.data.idpId).toBe("google-1")
      expect(opened.data.idpType).toBe("IDENTITY_PROVIDER_TYPE_GOOGLE")
      expect(opened.data.redirectUrl).toBe("https://accounts.google.com/o/oauth2/v2/auth?client_id=google-client")
    }

    expect(native.calls).toHaveLength(4)
    expect(native.calls[1].url).toBe(`${identityOrigin}/v2/settings/login`)
    expect(native.calls[2].url).toBe(`${identityOrigin}/v2/settings/login/idps`)
    expect(native.calls[3].url).toBe(`${identityOrigin}/v2/idp_intents`)
    expect(native.calls[3].body).toEqual({
      idpId: "google-1",
      urls: {
        successUrl: `https://login.example/api/v2/identity-provider/callback/google-1?flow=${flowHandle}`,
        failureUrl: `https://login.example/api/v2/identity-provider/callback/google-1/failure?flow=${flowHandle}`,
      },
    })
  })

  test("starts GitHub-style IdP intent successfully", async () => {
    const native = nativeCreate({
      intentAuthUrl: "https://github.com/login/oauth/authorize?client_id=github-client",
    })
    const app = workerAppCreate({ fetch: native.fetch, now: () => now })
    const cookieValue = await readyStateSeal()

    const response = await app.request(
      `https://login.example/api/v2/identity-provider/start?flow=${flowHandle}`,
      {
        method: "POST",
        headers: {
          origin: "https://login.example",
          "content-type": "application/json",
          cookie: `${flowCookieNameGet(flowHandle)}=${cookieValue}`,
        },
        body: JSON.stringify({
          idpId: "github-1",
          csrfToken,
        }),
      },
      bindings,
    )

    expect(response.status).toBe(200)
    const json = (await response.json()) as { success: boolean; data: { redirectUrl: string } }
    expect(json.success).toBe(true)
    expect(json.data.redirectUrl).toBe(`/api/v2/identity-provider/redirect?flow=${flowHandle}`)
  })

  test("rejects unknown/disabled/cross-org provider with 404 idp_not_found", async () => {
    const native = nativeCreate()
    const app = workerAppCreate({ fetch: native.fetch, now: () => now })
    const cookieValue = await readyStateSeal()

    const response = await app.request(
      `https://login.example/api/v2/identity-provider/start?flow=${flowHandle}`,
      {
        method: "POST",
        headers: {
          origin: "https://login.example",
          "content-type": "application/json",
          cookie: `${flowCookieNameGet(flowHandle)}=${cookieValue}`,
        },
        body: JSON.stringify({
          idpId: "unknown-provider-id",
          csrfToken,
        }),
      },
      bindings,
    )

    expect(response.status).toBe(404)
    const json = (await response.json()) as { success: boolean; errorMessage: string }
    expect(json.success).toBe(false)
    expect(json.errorMessage).toBe("idp_not_found")
  })

  test("rejects malformed or unsafe upstream redirect with 502 idp_redirect_invalid", async () => {
    const unsafeUrls = ["javascript:alert(1)", "ftp://evil.example.com", "not-a-url", ""]

    for (const unsafeUrl of unsafeUrls) {
      const native = nativeCreate({ intentAuthUrl: unsafeUrl })
      const app = workerAppCreate({ fetch: native.fetch, now: () => now })
      const cookieValue = await readyStateSeal()

      const response = await app.request(
        `https://login.example/api/v2/identity-provider/start?flow=${flowHandle}`,
        {
          method: "POST",
          headers: {
            origin: "https://login.example",
            "content-type": "application/json",
            cookie: `${flowCookieNameGet(flowHandle)}=${cookieValue}`,
          },
          body: JSON.stringify({
            idpId: "google-1",
            csrfToken,
          }),
        },
        bindings,
      )

      expect(response.status).toBe(502)
      const json = (await response.json()) as { success: boolean; errorMessage: string }
      expect(json.success).toBe(false)
      expect(json.errorMessage).toBe("idp_redirect_invalid")
    }
  })

  test("returns fallback transition when ZITADEL_IDP_V2_ENABLED is false", async () => {
    const native = nativeCreate()
    const app = workerAppCreate({ fetch: native.fetch, now: () => now })
    const cookieValue = await readyStateSeal()

    const disabledBindings = {
      ...bindings,
      ZITADEL_IDP_V2_ENABLED: "false",
    }

    const response = await app.request(
      `https://login.example/api/v2/identity-provider/start?flow=${flowHandle}`,
      {
        method: "POST",
        headers: {
          origin: "https://login.example",
          "content-type": "application/json",
          cookie: `${flowCookieNameGet(flowHandle)}=${cookieValue}`,
        },
        body: JSON.stringify({
          idpId: "google-1",
          csrfToken,
        }),
      },
      disabledBindings,
    )

    expect(response.status).toBe(200)
    const json = (await response.json()) as { success: boolean; data: { kind: string; path: string } }
    expect(json.success).toBe(true)
    expect(json.data.kind).toBe("fallback")
    expect(json.data.path).toBe(`/api/v2/flow/fallback?flow=${flowHandle}`)
    expect(native.calls.some((call) => call.url === `${identityOrigin}/v2/idp_intents`)).toBe(false)
  })

  test("returns fallback before intent mutation when MFA continuation ownership is disabled", async () => {
    const native = nativeCreate()
    const app = workerAppCreate({ fetch: native.fetch, now: () => now })
    const cookieValue = await readyStateSeal()
    const response = await app.request(
      `https://login.example/api/v2/identity-provider/start?flow=${flowHandle}`,
      {
        method: "POST",
        headers: {
          origin,
          "content-type": "application/json",
          cookie: `${flowCookieNameGet(flowHandle)}=${cookieValue}`,
        },
        body: JSON.stringify({ idpId: "google-1", csrfToken }),
      },
      { ...bindings, ZITADEL_MFA_V2_ENABLED: "false" },
    )

    expect(await response.json()).toEqual({
      success: true,
      data: { kind: "fallback", path: `/api/v2/flow/fallback?flow=${flowHandle}` },
    })
    expect(native.calls.some((call) => call.url === `${identityOrigin}/v2/idp_intents`)).toBe(false)
  })

  test("returns 409 flow_stage_invalid when flow is in wrong stage", async () => {
    const native = nativeCreate()
    const app = workerAppCreate({ fetch: native.fetch, now: () => now })

    const otpState: Extract<FlowV2Cookie, { stage: "otp" }> = {
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
      transitionCounter: 1,
      stage: "otp",
      delegable: false,
      userId: "user-1",
      sessionId: "session-1",
      sessionToken: "token-1",
    }
    const cookieValue = (await flowV2CookieSeal(otpState, key, new Uint8Array(12))).data

    const response = await app.request(
      `https://login.example/api/v2/identity-provider/start?flow=${flowHandle}`,
      {
        method: "POST",
        headers: {
          origin: "https://login.example",
          "content-type": "application/json",
          cookie: `${flowCookieNameGet(flowHandle)}=${cookieValue}`,
        },
        body: JSON.stringify({
          idpId: "google-1",
          csrfToken,
        }),
      },
      bindings,
    )

    expect(response.status).toBe(409)
    const json = (await response.json()) as { success: boolean; errorMessage: string }
    expect(json.success).toBe(false)
    expect(json.errorMessage).toBe("flow_stage_invalid")
  })

  test("returns 409 flow_replayed when flow is already completed or in idp_intent", async () => {
    const native = nativeCreate()
    const app = workerAppCreate({ fetch: native.fetch, now: () => now })

    const idpIntentState: Extract<FlowV2Cookie, { stage: "idp_intent" }> = {
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
      transitionCounter: 1,
      stage: "idp_intent",
      delegable: false,
      idpId: "google-1",
      idpType: "IDENTITY_PROVIDER_TYPE_GOOGLE",
      redirectUrl: "https://identity.example/v2/idp/intents/intent-1",
    }
    const cookieValue = (await flowV2CookieSeal(idpIntentState, key, new Uint8Array(12))).data

    const response = await app.request(
      `https://login.example/api/v2/identity-provider/start?flow=${flowHandle}`,
      {
        method: "POST",
        headers: {
          origin: "https://login.example",
          "content-type": "application/json",
          cookie: `${flowCookieNameGet(flowHandle)}=${cookieValue}`,
        },
        body: JSON.stringify({
          idpId: "google-1",
          csrfToken,
        }),
      },
      bindings,
    )

    expect(response.status).toBe(409)
    const json = (await response.json()) as { success: boolean; errorMessage: string }
    expect(json.success).toBe(false)
    expect(json.errorMessage).toBe("flow_replayed")
  })

  test("returns 429 rate_limited when rate limit is exceeded", async () => {
    const native = nativeCreate()
    const app = workerAppCreate({ fetch: native.fetch, now: () => now })
    const cookieValue = await readyStateSeal()

    const limitedBindings = {
      ...bindings,
      RATE_LIMITER: { limit: async () => ({ success: false }) },
    }

    const response = await app.request(
      `https://login.example/api/v2/identity-provider/start?flow=${flowHandle}`,
      {
        method: "POST",
        headers: {
          origin: "https://login.example",
          "content-type": "application/json",
          cookie: `${flowCookieNameGet(flowHandle)}=${cookieValue}`,
        },
        body: JSON.stringify({
          idpId: "google-1",
          csrfToken,
        }),
      },
      limitedBindings,
    )

    expect(response.status).toBe(429)
    expect(response.headers.get("retry-after")).toBe("60")
    const json = (await response.json()) as { success: boolean; errorMessage: string }
    expect(json.success).toBe(false)
    expect(json.errorMessage).toBe("rate_limited")
  })

  test("handles upstream ZITADEL failures with 502/503", async () => {
    const native = nativeCreate({ intentStatus: 500 })
    const app = workerAppCreate({ fetch: native.fetch, now: () => now })
    const cookieValue = await readyStateSeal()

    const response = await app.request(
      `https://login.example/api/v2/identity-provider/start?flow=${flowHandle}`,
      {
        method: "POST",
        headers: {
          origin: "https://login.example",
          "content-type": "application/json",
          cookie: `${flowCookieNameGet(flowHandle)}=${cookieValue}`,
        },
        body: JSON.stringify({
          idpId: "google-1",
          csrfToken,
        }),
      },
      bindings,
    )

    expect(response.status).toBe(502)
    const json = (await response.json()) as { success: boolean; errorMessage: string }
    expect(json.success).toBe(false)
    expect(json.errorMessage).toBe("idp_start_failed")
  })

  test("GET /api/v2/identity-provider/redirect performs Worker-owned 302 redirect from encrypted flow state", async () => {
    const native = nativeCreate()
    const app = workerAppCreate({ fetch: native.fetch, now: () => now })

    const idpIntentState: Extract<FlowV2Cookie, { stage: "idp_intent" }> = {
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
      transitionCounter: 1,
      stage: "idp_intent",
      delegable: false,
      idpId: "google-1",
      idpType: "IDENTITY_PROVIDER_TYPE_GOOGLE",
      redirectUrl: "https://accounts.google.com/o/oauth2/v2/auth?client_id=google-client",
    }
    const cookieValue = (await flowV2CookieSeal(idpIntentState, key, new Uint8Array(12))).data

    const response = await app.request(
      `https://login.example/api/v2/identity-provider/redirect?flow=${flowHandle}`,
      {
        method: "GET",
        headers: {
          cookie: `${flowCookieNameGet(flowHandle)}=${cookieValue}`,
        },
      },
      bindings,
    )

    expect(response.status).toBe(302)
    expect(response.headers.get("location")).toBe(
      "https://accounts.google.com/o/oauth2/v2/auth?client_id=google-client",
    )
    expect(response.headers.get("cache-control")).toBe("no-store")
    expect(response.headers.get("referrer-policy")).toBe("no-referrer")
  })
})
