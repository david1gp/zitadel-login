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

function flowCookieNameGet(handle: string) {
  return `__Host-zitadel-login-flow-${handle}`
}

async function idpIntentStateSeal(overrides: Partial<Extract<FlowV2Cookie, { stage: "idp_intent" }>> = {}) {
  const base: Extract<FlowV2Cookie, { stage: "idp_intent" }> = {
    version: 2,
    flowHandle,
    requestKind: "oidc",
    authRequestId: "request-1",
    clientId: "client-1",
    redirectUri: "https://client.example/callback",
    organizationId: "org-1",
    prompt: ["PROMPT_LOGIN"],
    csrfToken: "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA",
    issuedAt: now,
    expiresAt: now + 900,
    transitionCounter: 1,
    stage: "idp_intent",
    delegable: false,
    idpId: "google-1",
    idpType: "IDENTITY_PROVIDER_TYPE_GOOGLE",
    redirectUrl: "https://identity.example/v2/idp/intents/intent-1",
    ...overrides,
  }
  return (await flowV2CookieSeal(base, key, new Uint8Array(12))).data
}

describe("GET /api/v2/identity-provider/callback/:provider", () => {
  test("processes linked success and redirects to /api/v2/flow/continue without intent token in URL", async () => {
    const fetch = async (input: RequestInfo | URL) => {
      const url = String(input)
      if (url === `${identityOrigin}/v2/oidc/auth_requests/${authRequest.id}`) {
        return Response.json({ authRequest })
      }
      if (url === `${identityOrigin}/v2/idp_intents/intent-1`) {
        return Response.json({
          idpInformation: { idpId: "google-1", userId: "google-123", userName: "linked@example.com" },
          userId: "user-1",
        })
      }
      if (url === `${identityOrigin}/v2/sessions`) {
        return Response.json({ sessionId: "session-1", sessionToken: "session-token-1" })
      }
      if (url === `${identityOrigin}/v2/sessions/session-1?sessionToken=session-token-1`) {
        return Response.json({
          session: {
            id: "session-1",
            factors: { user: { id: "user-1", organizationId: "org-1" } },
          },
        })
      }
      if (url === `${identityOrigin}/v2/users/user-1/authentication_methods`) {
        return Response.json({ authMethodTypes: [] })
      }
      if (url === `${identityOrigin}/v2/settings/login`) {
        return Response.json({ settings: { forceMfa: false } })
      }
      throw new Error(`Unexpected native request: ${url}`)
    }

    const app = workerAppCreate({ fetch, now: () => now })
    const cookieValue = await idpIntentStateSeal()

    const response = await app.request(
      `https://login.example/api/v2/identity-provider/callback/google-1?flow=${flowHandle}&id=intent-1&token=token-1`,
      {
        method: "GET",
        headers: {
          cookie: `${flowCookieNameGet(flowHandle)}=${cookieValue}`,
        },
      },
      bindings,
    )

    expect(response.status).toBe(302)
    expect(response.headers.get("location")).toBe(`/api/v2/flow/continue?flow=${flowHandle}`)
    expect(response.headers.get("cache-control")).toBe("no-store")
    expect(response.headers.get("referrer-policy")).toBe("no-referrer")

    const setCookie = response.headers.get("set-cookie")
    expect(setCookie).toBeTruthy()

    const cookieMatch = setCookie?.match(new RegExp(`__Host-zitadel-login-flow-${flowHandle}=([^;]+)`))
    expect(cookieMatch).toBeTruthy()

    const opened = await flowV2CookieOpen(cookieMatch![1], flowHandle, [key], now)
    expect(opened.success).toBe(true)
    expect(opened.data.stage).toBe("verified")
    if (opened.data.stage === "verified") {
      expect(opened.data.userId).toBe("user-1")
      expect(opened.data.sessionId).toBe("session-1")
      expect(opened.data.sessionToken).toBe("session-token-1")
    }
  })

  test("processes MFA required linked user and redirects to /login/mfa", async () => {
    const fetch = async (input: RequestInfo | URL) => {
      const url = String(input)
      if (url === `${identityOrigin}/v2/oidc/auth_requests/${authRequest.id}`) {
        return Response.json({ authRequest })
      }
      if (url === `${identityOrigin}/v2/idp_intents/intent-1`) {
        return Response.json({
          idpInformation: { idpId: "google-1", userId: "google-123" },
          userId: "user-1",
        })
      }
      if (url === `${identityOrigin}/v2/sessions`) {
        return Response.json({ sessionId: "session-1", sessionToken: "session-token-1" })
      }
      if (url === `${identityOrigin}/v2/sessions/session-1?sessionToken=session-token-1`) {
        return Response.json({
          session: {
            id: "session-1",
            factors: { user: { id: "user-1", organizationId: "org-1" } },
          },
        })
      }
      if (url === `${identityOrigin}/v2/users/user-1/authentication_methods`) {
        return Response.json({ authMethodTypes: ["AUTHENTICATION_METHOD_TYPE_TOTP"] })
      }
      if (url === `${identityOrigin}/v2/settings/login`) {
        return Response.json({ settings: { forceMfa: true } })
      }
      throw new Error(`Unexpected native request: ${url}`)
    }

    const app = workerAppCreate({ fetch, now: () => now })
    const cookieValue = await idpIntentStateSeal()

    const response = await app.request(
      `https://login.example/api/v2/identity-provider/callback/google-1?flow=${flowHandle}&id=intent-1&token=token-1`,
      {
        method: "GET",
        headers: {
          cookie: `${flowCookieNameGet(flowHandle)}=${cookieValue}`,
        },
      },
      bindings,
    )

    expect(response.status).toBe(302)
    expect(response.headers.get("location")).toBe(`/login/mfa?flow=${flowHandle}`)

    const setCookie = response.headers.get("set-cookie")
    const cookieMatch = setCookie?.match(new RegExp(`__Host-zitadel-login-flow-${flowHandle}=([^;]+)`))
    const opened = await flowV2CookieOpen(cookieMatch![1], flowHandle, [key], now)
    expect(opened.success).toBe(true)
    expect(opened.data.stage).toBe("mfa")
  })

  test("processes unlinked new user and redirects to /login/idp/google-1/account-not-found", async () => {
    const fetch = async (input: RequestInfo | URL) => {
      const url = String(input)
      if (url === `${identityOrigin}/v2/oidc/auth_requests/${authRequest.id}`) {
        return Response.json({ authRequest })
      }
      if (url === `${identityOrigin}/v2/idp_intents/intent-1`) {
        return Response.json({
          idpInformation: { idpId: "google-1", userId: "google-123", userName: "unlinked@example.com" },
        })
      }
      throw new Error(`Unexpected native request: ${url}`)
    }

    const app = workerAppCreate({ fetch, now: () => now })
    const cookieValue = await idpIntentStateSeal()

    const response = await app.request(
      `https://login.example/api/v2/identity-provider/callback/google-1?flow=${flowHandle}&id=intent-1&token=token-1`,
      {
        method: "GET",
        headers: {
          cookie: `${flowCookieNameGet(flowHandle)}=${cookieValue}`,
        },
      },
      bindings,
    )

    expect(response.status).toBe(302)
    expect(response.headers.get("location")).toBe(`/login/idp/google-1/account-not-found?flow=${flowHandle}`)

    const setCookie = response.headers.get("set-cookie")
    const cookieMatch = setCookie?.match(new RegExp(`__Host-zitadel-login-flow-${flowHandle}=([^;]+)`))
    const opened = await flowV2CookieOpen(cookieMatch![1], flowHandle, [key], now)
    expect(opened.success).toBe(true)
    expect(opened.data.stage).toBe("idp_unlinked")
  })

  test("rejects provider mismatch with 403 provider_mismatch", async () => {
    const fetch = async () => Response.json({})
    const app = workerAppCreate({ fetch, now: () => now })
    const cookieValue = await idpIntentStateSeal({ idpId: "google-1" })

    const response = await app.request(
      `https://login.example/api/v2/identity-provider/callback/github-1?flow=${flowHandle}&id=intent-1&token=token-1`,
      {
        method: "GET",
        headers: {
          cookie: `${flowCookieNameGet(flowHandle)}=${cookieValue}`,
        },
      },
      bindings,
    )

    expect(response.status).toBe(403)
    const json = (await response.json()) as { success: boolean; errorMessage: string }
    expect(json.success).toBe(false)
    expect(json.errorMessage).toBe("provider_mismatch")
  })

  test("rejects callback replay when stage is already verified or mfa", async () => {
    const fetch = async () => Response.json({})
    const app = workerAppCreate({ fetch, now: () => now })

    const verifiedState: Extract<FlowV2Cookie, { stage: "verified" }> = {
      version: 2,
      flowHandle,
      requestKind: "oidc",
      authRequestId: "request-1",
      clientId: "client-1",
      redirectUri: "https://client.example/callback",
      organizationId: "org-1",
      prompt: ["PROMPT_LOGIN"],
      csrfToken: "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA",
      issuedAt: now,
      expiresAt: now + 900,
      transitionCounter: 2,
      stage: "verified",
      delegable: false,
      userId: "user-1",
      sessionId: "session-1",
      sessionToken: "token-1",
    }
    const cookieValue = (await flowV2CookieSeal(verifiedState, key, new Uint8Array(12))).data

    const response = await app.request(
      `https://login.example/api/v2/identity-provider/callback/google-1?flow=${flowHandle}&id=intent-1&token=token-1`,
      {
        method: "GET",
        headers: {
          cookie: `${flowCookieNameGet(flowHandle)}=${cookieValue}`,
        },
      },
      bindings,
    )

    expect(response.status).toBe(409)
    const json = (await response.json()) as { success: boolean; errorMessage: string }
    expect(json.success).toBe(false)
    expect(json.errorMessage).toBe("flow_replayed")
  })

  test("rejects malformed callback parameters with 403 request_rejected", async () => {
    const fetch = async (input: RequestInfo | URL) => {
      const url = String(input)
      if (url === `${identityOrigin}/v2/oidc/auth_requests/${authRequest.id}`) {
        return Response.json({ authRequest })
      }
      throw new Error(`Unexpected native request: ${url}`)
    }

    const app = workerAppCreate({ fetch, now: () => now })
    const cookieValue = await idpIntentStateSeal()

    const response = await app.request(
      `https://login.example/api/v2/identity-provider/callback/google-1?flow=${flowHandle}`,
      {
        method: "GET",
        headers: {
          cookie: `${flowCookieNameGet(flowHandle)}=${cookieValue}`,
        },
      },
      bindings,
    )

    expect(response.status).toBe(403)
    const json = (await response.json()) as { success: boolean; errorMessage: string }
    expect(json.success).toBe(false)
    expect(json.errorMessage).toBe("request_rejected")
  })

  test("rejects callback request with unsafe host origin with 403 request_rejected", async () => {
    const fetch = async () => Response.json({})
    const app = workerAppCreate({ fetch, now: () => now })
    const cookieValue = await idpIntentStateSeal()

    const response = await app.request(
      `https://evil.example/api/v2/identity-provider/callback/google-1?flow=${flowHandle}&id=intent-1&token=token-1`,
      {
        method: "GET",
        headers: {
          cookie: `${flowCookieNameGet(flowHandle)}=${cookieValue}`,
        },
      },
      bindings,
    )

    expect(response.status).toBe(403)
    const json = (await response.json()) as { success: boolean; errorMessage: string }
    expect(json.success).toBe(false)
    expect(json.errorMessage).toBe("request_rejected")
  })

  test("handles upstream native intent retrieval failure with 502 idp_intent_invalid", async () => {
    const fetch = async (input: RequestInfo | URL) => {
      const url = String(input)
      if (url === `${identityOrigin}/v2/oidc/auth_requests/${authRequest.id}`) {
        return Response.json({ authRequest })
      }
      if (url === `${identityOrigin}/v2/idp_intents/intent-1`) {
        return Response.json({ error: "intent invalid" }, { status: 400 })
      }
      throw new Error(`Unexpected native request: ${url}`)
    }

    const app = workerAppCreate({ fetch, now: () => now })
    const cookieValue = await idpIntentStateSeal()

    const response = await app.request(
      `https://login.example/api/v2/identity-provider/callback/google-1?flow=${flowHandle}&id=intent-1&token=token-1`,
      {
        method: "GET",
        headers: {
          cookie: `${flowCookieNameGet(flowHandle)}=${cookieValue}`,
        },
      },
      bindings,
    )

    expect(response.status).toBe(502)
    const json = (await response.json()) as { success: boolean; errorMessage: string }
    expect(json.success).toBe(false)
    expect(json.errorMessage).toBe("idp_intent_invalid")
  })

  test("failure callback resets state to ready and redirects to /login/idp/google-1/failure", async () => {
    const fetch = async (input: RequestInfo | URL) => {
      const url = String(input)
      if (url === `${identityOrigin}/v2/oidc/auth_requests/${authRequest.id}`) {
        return Response.json({ authRequest })
      }
      throw new Error(`Unexpected native request: ${url}`)
    }

    const app = workerAppCreate({ fetch, now: () => now })
    const cookieValue = await idpIntentStateSeal()

    const response = await app.request(
      `https://login.example/api/v2/identity-provider/callback/google-1/failure?flow=${flowHandle}&error=access_denied`,
      {
        method: "GET",
        headers: {
          cookie: `${flowCookieNameGet(flowHandle)}=${cookieValue}`,
        },
      },
      bindings,
    )

    expect(response.status).toBe(302)
    expect(response.headers.get("location")).toBe(`/login/idp/google-1/failure?flow=${flowHandle}`)
    expect(response.headers.get("cache-control")).toBe("no-store")
    expect(response.headers.get("referrer-policy")).toBe("no-referrer")

    const setCookie = response.headers.get("set-cookie")
    const cookieMatch = setCookie?.match(new RegExp(`__Host-zitadel-login-flow-${flowHandle}=([^;]+)`))
    const opened = await flowV2CookieOpen(cookieMatch![1], flowHandle, [key], now)
    expect(opened.success).toBe(true)
    expect(opened.data.stage).toBe("ready")
  })

  test("rejects replay when token-bearing callback is called a second time after state transition", async () => {
    const fetch = async (input: RequestInfo | URL) => {
      const url = String(input)
      if (url === `${identityOrigin}/v2/oidc/auth_requests/${authRequest.id}`) {
        return Response.json({ authRequest })
      }
      if (url === `${identityOrigin}/v2/idp_intents/intent-1`) {
        return Response.json({
          idpInformation: { idpId: "google-1", userId: "google-123", userName: "linked@example.com" },
          userId: "user-1",
        })
      }
      if (url === `${identityOrigin}/v2/sessions`) {
        return Response.json({ sessionId: "session-1", sessionToken: "session-token-1" })
      }
      if (url === `${identityOrigin}/v2/sessions/session-1?sessionToken=session-token-1`) {
        return Response.json({
          session: {
            id: "session-1",
            factors: { user: { id: "user-1", organizationId: "org-1" } },
          },
        })
      }
      if (url === `${identityOrigin}/v2/users/user-1/authentication_methods`) {
        return Response.json({ authMethodTypes: [] })
      }
      if (url === `${identityOrigin}/v2/settings/login`) {
        return Response.json({ settings: { forceMfa: false } })
      }
      throw new Error(`Unexpected native request: ${url}`)
    }

    const app = workerAppCreate({ fetch, now: () => now })
    const initialCookie = await idpIntentStateSeal()

    const firstResponse = await app.request(
      `https://login.example/api/v2/identity-provider/callback/google-1?flow=${flowHandle}&id=intent-1&token=token-1`,
      {
        method: "GET",
        headers: { cookie: `${flowCookieNameGet(flowHandle)}=${initialCookie}` },
      },
      bindings,
    )
    expect(firstResponse.status).toBe(302)

    const updatedSetCookie = firstResponse.headers.get("set-cookie")
    const cookieMatch = updatedSetCookie?.match(new RegExp(`__Host-zitadel-login-flow-${flowHandle}=([^;]+)`))
    expect(cookieMatch).toBeTruthy()

    const secondResponse = await app.request(
      `https://login.example/api/v2/identity-provider/callback/google-1?flow=${flowHandle}&id=intent-1&token=token-1`,
      {
        method: "GET",
        headers: { cookie: `${flowCookieNameGet(flowHandle)}=${cookieMatch![1]}` },
      },
      bindings,
    )
    expect(secondResponse.status).toBe(409)
    const json = await secondResponse.json()
    expect(json).toEqual({
      success: false,
      op: "identityProviderCallback",
      errorMessage: "flow_replayed",
    })
  })
})
