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
const challenge = "GAOHYz2jE69kJMYo6Laij8yWw9-dKKgbViNhfuy0StA"

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

const authRequest = {
  id: "request-1",
  clientId: "client-1",
  redirectUri: "https://client.example/callback",
  scope: ["openid", "urn:zitadel:iam:org:id:org-1"],
  prompt: ["PROMPT_LOGIN"],
}

const mockDiscouragedOptions = {
  publicKey: {
    challenge,
    rpId: "login.example",
    timeout: 300000,
    userVerification: "discouraged" as const,
    allowCredentials: [
      {
        id: "ATmqBg-99qyOZk2zloPdJQyS2R7IkFT7v9Hoos_B_nM",
        type: "public-key" as const,
      },
    ],
  },
}

function base64UrlEncodeText(text: string): string {
  const bytes = new TextEncoder().encode(text)
  let binary = ""
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", "")
}

function clientDataCreate(overrides: { type?: string; challenge?: string; origin?: string } = {}): string {
  const json = JSON.stringify({
    type: overrides.type ?? "webauthn.get",
    challenge: overrides.challenge ?? challenge,
    origin: overrides.origin ?? origin,
  })
  return base64UrlEncodeText(json)
}

function authenticatorDataCreate(flags = 1): string {
  const bytes = new Uint8Array(37)
  bytes[32] = flags
  let binary = ""
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", "")
}

function validCredentialCreate(
  overrides: { clientDataJSON?: string; authenticatorData?: string; userHandle?: string | null } = {},
) {
  return {
    id: "ATmqBg-99qyOZk2zloPdJQyS2R7IkFT7v9Hoos_B_nM",
    rawId: "ATmqBg-99qyOZk2zloPdJQyS2R7IkFT7v9Hoos_B_nM",
    type: "public-key" as const,
    response: {
      clientDataJSON: overrides.clientDataJSON ?? clientDataCreate(),
      authenticatorData: overrides.authenticatorData ?? authenticatorDataCreate(1),
      signature: "MEUCIQDa1234567890",
      ...(overrides.userHandle !== undefined ? { userHandle: overrides.userHandle } : {}),
    },
  }
}

type NativeOptions = {
  sessionStatus?: number
  verifyError?: { status: number }
  methods?: string[]
  secondFactors?: string[]
  multiFactors?: string[]
  factors?: Record<string, unknown>
}

function nativeCreate(options: NativeOptions = {}) {
  const calls: Array<{ method: string; url: string; body?: unknown }> = []
  let passkeyVerified = false
  const fetch = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const url = String(input)
    const method = init?.method ?? "GET"
    const body = init?.body ? JSON.parse(String(init.body)) : undefined
    calls.push({ method, url, ...(body === undefined ? {} : { body }) })

    if (url === `${identityOrigin}/v2/oidc/auth_requests/${authRequest.id}` && method === "GET") {
      return Response.json({ authRequest })
    }
    if (url.startsWith(`${identityOrigin}/v2/sessions/session-1?`) && method === "GET") {
      if (options.sessionStatus) return Response.json({}, { status: options.sessionStatus })
      return Response.json({
        session: {
          id: "session-1",
          sessionToken: "updated-mfa-session-token",
          expirationDate: "2027-08-11T13:00:00Z",
          factors: options.factors ?? {
            user: { id: "user-1", organizationId: "org-1" },
            password: { verifiedAt: "2026-08-11T12:00:00Z" },
            ...(passkeyVerified ? { webAuthN: { verifiedAt: "2026-08-11T12:05:00Z" } } : {}),
          },
        },
      })
    }
    if (url === `${identityOrigin}/v2/sessions/session-1` && method === "PATCH") {
      if (options.verifyError) {
        return Response.json({}, { status: options.verifyError.status })
      }
      passkeyVerified = true
      return Response.json({
        sessionToken: "updated-u2f-session-token",
      })
    }
    if (url === `${identityOrigin}/v2/users/user-1` && method === "GET") {
      return Response.json({
        user: {
          userId: "user-1",
          state: "USER_STATE_ACTIVE",
          details: { resourceOwner: "org-1" },
          human: { email: { email: "user@example.com", isVerified: true } },
        },
      })
    }
    if (url === `${identityOrigin}/v2/users/user-1/authentication_methods` && method === "GET") {
      return Response.json({
        authMethodTypes: options.methods ?? ["AUTHENTICATION_METHOD_TYPE_PASSWORD", "AUTHENTICATION_METHOD_TYPE_U2F"],
      })
    }
    if (url === `${identityOrigin}/v2/settings/login` && method === "GET") {
      return Response.json({
        settings: {
          forceMfa: true,
          secondFactors: options.secondFactors ?? ["SECOND_FACTOR_TYPE_U2F"],
          multiFactors: options.multiFactors ?? [],
        },
      })
    }

    throw new Error(`Unexpected request: ${method} ${url}`)
  }
  return { fetch, calls }
}

async function flowCookieCreate(customState?: Partial<FlowV2Cookie>) {
  const baseState = {
    version: 2 as const,
    flowHandle,
    requestKind: "oidc" as const,
    authRequestId: "request-1",
    clientId: "client-1",
    redirectUri: "https://client.example/callback",
    organizationId: "org-1",
    prompt: ["PROMPT_LOGIN"],
    csrfToken: "B".repeat(43),
    issuedAt: now,
    expiresAt: now + 900,
    transitionCounter: 2,
  }

  const cookieState: FlowV2Cookie =
    customState?.stage === "ready"
      ? {
          ...baseState,
          stage: "ready",
          delegable: true,
          owned: true,
        }
      : customState?.stage === "verified"
        ? {
            ...baseState,
            stage: "verified",
            delegable: false,
            userId: "user-1",
            sessionId: "session-1",
            sessionToken: "verified-session-token",
          }
        : {
            ...baseState,
            stage: "mfa",
            delegable: false,
            userId: "user-1",
            sessionId: "session-1",
            sessionToken: "secret-session-token",
            mfaMethods: ["u2f"],
            options: mockDiscouragedOptions,
            ...customState,
          }

  const sealed = await flowV2CookieSeal(cookieState, key, new Uint8Array(12).fill(7))
  if (!sealed.success) throw new Error("Cookie creation failed")
  return { header: `__Host-zitadel-login-flow-${flowHandle}=${sealed.data}` }
}

function workerCreate(nativeFetch: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>) {
  return workerAppCreate({
    fetch: nativeFetch,
    now: () => now,
    randomBytes: (length) => new Uint8Array(length).fill(7),
    logger: { warn: () => {}, error: () => {} },
  })
}

describe("Worker MFA U2F assertion verify flow", () => {
  test("verifies U2F assertion and completes authorization with updated cookie (200 status)", async () => {
    const native = nativeCreate()
    const cookie = await flowCookieCreate()
    const app = workerCreate(native.fetch)

    const response = await app.request(
      `${origin}/api/v2/mfa/u2f/verify?flow=${flowHandle}`,
      {
        method: "POST",
        headers: {
          origin,
          "content-type": "application/json",
          cookie: cookie.header,
        },
        body: JSON.stringify({
          credential: validCredentialCreate(),
          csrfToken: "B".repeat(43),
        }),
      },
      bindings,
    )

    expect(response.status).toBe(200)
    const json = await response.json()
    expect(json).toEqual({
      success: true,
      data: {
        kind: "complete",
        path: `/api/v2/flow/continue?flow=${flowHandle}`,
      },
    })

    const setCookie = response.headers.get("set-cookie")
    expect(setCookie).toBeTruthy()
    const cookieValue = setCookie?.split(";")[0]?.split("=")[1]
    const opened = await flowV2CookieOpen(cookieValue!, flowHandle, [key], now)
    expect(opened.success).toBe(true)
    if (!opened.success) return
    expect(opened.data.stage).toBe("verified")
    if (opened.data.stage !== "verified") return
    expect(opened.data.sessionToken).toBe("updated-mfa-session-token")
  })

  test("works identically via /api/v2/mfa/webauthn/verify alias endpoint", async () => {
    const native = nativeCreate()
    const cookie = await flowCookieCreate()
    const app = workerCreate(native.fetch)

    const response = await app.request(
      `${origin}/api/v2/mfa/webauthn/verify?flow=${flowHandle}`,
      {
        method: "POST",
        headers: {
          origin,
          "content-type": "application/json",
          cookie: cookie.header,
        },
        body: JSON.stringify({
          credential: validCredentialCreate(),
          csrfToken: "B".repeat(43),
        }),
      },
      bindings,
    )

    expect(response.status).toBe(200)
  })

  test("returns 401 credentials_invalid on challenge/origin/type mismatch", async () => {
    const native = nativeCreate()
    const cookie = await flowCookieCreate()
    const app = workerCreate(native.fetch)

    const response = await app.request(
      `${origin}/api/v2/mfa/u2f/verify?flow=${flowHandle}`,
      {
        method: "POST",
        headers: {
          origin,
          "content-type": "application/json",
          cookie: cookie.header,
        },
        body: JSON.stringify({
          credential: validCredentialCreate({ clientDataJSON: clientDataCreate({ challenge: "bad-challenge" }) }),
          csrfToken: "B".repeat(43),
        }),
      },
      bindings,
    )

    expect(response.status).toBe(401)
    const json = await response.json()
    expect(json).toEqual({
      success: false,
      op: "mfaU2fVerify",
      errorMessage: "credentials_invalid",
    })
  })

  test("returns 503 challenge_unavailable when attempting to verify before challenge", async () => {
    const native = nativeCreate()
    const cookie = await flowCookieCreate({ options: undefined })
    const app = workerCreate(native.fetch)

    const response = await app.request(
      `${origin}/api/v2/mfa/u2f/verify?flow=${flowHandle}`,
      {
        method: "POST",
        headers: {
          origin,
          "content-type": "application/json",
          cookie: cookie.header,
        },
        body: JSON.stringify({
          credential: validCredentialCreate(),
          csrfToken: "B".repeat(43),
        }),
      },
      bindings,
    )

    expect(response.status).toBe(503)
    const json = await response.json()
    expect(json).toEqual({
      success: false,
      op: "mfaU2fVerify",
      errorMessage: "challenge_unavailable",
    })
  })

  test("returns 403 method_not_enrolled when user lacks U2F enrollment", async () => {
    const native = nativeCreate({ methods: ["AUTHENTICATION_METHOD_TYPE_PASSWORD"] })
    const cookie = await flowCookieCreate()
    const app = workerCreate(native.fetch)

    const response = await app.request(
      `${origin}/api/v2/mfa/u2f/verify?flow=${flowHandle}`,
      {
        method: "POST",
        headers: {
          origin,
          "content-type": "application/json",
          cookie: cookie.header,
        },
        body: JSON.stringify({
          credential: validCredentialCreate(),
          csrfToken: "B".repeat(43),
        }),
      },
      bindings,
    )

    expect(response.status).toBe(403)
    const json = await response.json()
    expect(json).toEqual({
      success: false,
      op: "mfaU2fVerify",
      errorMessage: "method_not_enrolled",
    })
  })

  test("returns 409 flow_replayed when flow cookie is already in verified stage", async () => {
    const native = nativeCreate()
    const cookie = await flowCookieCreate({ stage: "verified" })
    const app = workerCreate(native.fetch)

    const response = await app.request(
      `${origin}/api/v2/mfa/u2f/verify?flow=${flowHandle}`,
      {
        method: "POST",
        headers: {
          origin,
          "content-type": "application/json",
          cookie: cookie.header,
        },
        body: JSON.stringify({
          credential: validCredentialCreate(),
          csrfToken: "B".repeat(43),
        }),
      },
      bindings,
    )

    expect(response.status).toBe(409)
    const json = await response.json()
    expect(json).toEqual({
      success: false,
      op: "mfaU2fVerify",
      errorMessage: "flow_replayed",
    })
  })

  test("returns 403 csrf_rejected on CSRF token mismatch", async () => {
    const native = nativeCreate()
    const cookie = await flowCookieCreate()
    const app = workerCreate(native.fetch)

    const response = await app.request(
      `${origin}/api/v2/mfa/u2f/verify?flow=${flowHandle}`,
      {
        method: "POST",
        headers: {
          origin,
          "content-type": "application/json",
          cookie: cookie.header,
        },
        body: JSON.stringify({
          credential: validCredentialCreate(),
          csrfToken: "X".repeat(43),
        }),
      },
      bindings,
    )

    expect(response.status).toBe(403)
    const json = await response.json()
    expect(json).toEqual({
      success: false,
      op: "mfaU2fVerify",
      errorMessage: "csrf_rejected",
    })
  })

  test("enforces rate limits with 429 status", async () => {
    const native = nativeCreate()
    const cookie = await flowCookieCreate()
    const app = workerAppCreate({
      fetch: native.fetch,
      now: () => now,
      randomBytes: (length) => new Uint8Array(length).fill(7),
      logger: { warn: () => {}, error: () => {} },
    })

    const response = await app.request(
      `${origin}/api/v2/mfa/u2f/verify?flow=${flowHandle}`,
      {
        method: "POST",
        headers: {
          origin,
          "content-type": "application/json",
          cookie: cookie.header,
        },
        body: JSON.stringify({
          credential: validCredentialCreate(),
          csrfToken: "B".repeat(43),
        }),
      },
      {
        ...bindings,
        RATE_LIMITER: { limit: async () => ({ success: false }) },
      },
    )

    expect(response.status).toBe(429)
    const json = await response.json()
    expect(json).toEqual({
      success: false,
      op: "mfaU2fVerify",
      errorMessage: "rate_limited",
    })
  })

  test("never returns session token or PAT secret in response body or headers", async () => {
    const native = nativeCreate()
    const cookie = await flowCookieCreate()
    const app = workerCreate(native.fetch)

    const response = await app.request(
      `${origin}/api/v2/mfa/u2f/verify?flow=${flowHandle}`,
      {
        method: "POST",
        headers: {
          origin,
          "content-type": "application/json",
          cookie: cookie.header,
        },
        body: JSON.stringify({
          credential: validCredentialCreate(),
          csrfToken: "B".repeat(43),
        }),
      },
      bindings,
    )

    const text = await response.text()
    expect(text).not.toContain("test-pat-not-a-real-secret-value")
    expect(text).not.toContain("updated-u2f-session-token")
    expect(text).not.toContain("secret-session-token")
  })
})
