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

const mockPublicKeyOptions = {
  publicKey: {
    challenge: "GAOHYz2jE69kJMYo6Laij8yWw9-dKKgbViNhfuy0StA",
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

type NativeOptions = {
  sessionStatus?: number
  methods?: string[]
  secondFactors?: string[]
  multiFactors?: string[]
  factors?: Record<string, unknown>
  rateLimitSuccess?: boolean
  invalidOptions?: boolean
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
          },
        },
      })
    }
    if (url === `${identityOrigin}/v2/sessions/session-1` && method === "PATCH") {
      return Response.json({
        sessionToken: "updated-u2f-session-token",
        challenges: {
          webAuthN: {
            publicKeyCredentialRequestOptions: options.invalidOptions ? { invalid: true } : mockPublicKeyOptions,
          },
        },
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
      : {
          ...baseState,
          stage: "mfa",
          delegable: false,
          userId: "user-1",
          sessionId: "session-1",
          sessionToken: "secret-session-token",
          mfaMethods: ["u2f"],
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

describe("Worker MFA U2F challenge flow", () => {
  test("creates U2F challenge options and seals updated state in encrypted flow cookie (202 status)", async () => {
    const native = nativeCreate()
    const cookie = await flowCookieCreate()
    const app = workerCreate(native.fetch)

    const response = await app.request(
      `${origin}/api/v2/mfa/u2f/challenge?flow=${flowHandle}`,
      {
        method: "POST",
        headers: {
          origin,
          "content-type": "application/json",
          cookie: cookie.header,
        },
        body: JSON.stringify({
          csrfToken: "B".repeat(43),
        }),
      },
      bindings,
    )

    expect(response.status).toBe(202)
    const json = await response.json()
    expect(json).toEqual({
      success: true,
      data: {
        kind: "render",
        route: `/login/mfa?flow=${flowHandle}`,
        screen: {
          name: "mfa",
          factors: ["u2f"],
          options: mockPublicKeyOptions,
        },
        csrfToken: "B".repeat(43),
      },
    })

    const setCookie = response.headers.get("set-cookie")
    expect(setCookie).toBeTruthy()
    const cookieValue = setCookie?.split(";")[0]?.split("=")[1]
    const opened = await flowV2CookieOpen(cookieValue!, flowHandle, [key], now)
    expect(opened.success).toBe(true)
    if (!opened.success) return
    expect(opened.data.stage).toBe("mfa")
    if (opened.data.stage !== "mfa") return
    expect(opened.data.sessionToken).toBe("updated-u2f-session-token")
    expect(opened.data.options).toEqual(mockPublicKeyOptions)
  })

  test("works identically via /api/v2/mfa/webauthn/challenge alias endpoint", async () => {
    const native = nativeCreate()
    const cookie = await flowCookieCreate()
    const app = workerCreate(native.fetch)

    const response = await app.request(
      `${origin}/api/v2/mfa/webauthn/challenge?flow=${flowHandle}`,
      {
        method: "POST",
        headers: {
          origin,
          "content-type": "application/json",
          cookie: cookie.header,
        },
        body: JSON.stringify({
          csrfToken: "B".repeat(43),
        }),
      },
      bindings,
    )

    expect(response.status).toBe(202)
  })

  test("rejects explicit mismatched rpId with 403 request_rejected", async () => {
    const native = nativeCreate()
    const cookie = await flowCookieCreate()
    const app = workerCreate(native.fetch)

    const response = await app.request(
      `${origin}/api/v2/mfa/u2f/challenge?flow=${flowHandle}`,
      {
        method: "POST",
        headers: {
          origin,
          "content-type": "application/json",
          cookie: cookie.header,
        },
        body: JSON.stringify({
          rpId: "other.domain.example",
          csrfToken: "B".repeat(43),
        }),
      },
      bindings,
    )

    expect(response.status).toBe(403)
    const json = await response.json()
    expect(json).toEqual({
      success: false,
      op: "mfaU2fChallenge",
      errorMessage: "request_rejected",
    })
  })

  test("returns 403 method_not_enrolled when user lacks U2F enrollment", async () => {
    const native = nativeCreate({ methods: ["AUTHENTICATION_METHOD_TYPE_PASSWORD"] })
    const cookie = await flowCookieCreate()
    const app = workerCreate(native.fetch)

    const response = await app.request(
      `${origin}/api/v2/mfa/u2f/challenge?flow=${flowHandle}`,
      {
        method: "POST",
        headers: {
          origin,
          "content-type": "application/json",
          cookie: cookie.header,
        },
        body: JSON.stringify({
          csrfToken: "B".repeat(43),
        }),
      },
      bindings,
    )

    expect(response.status).toBe(403)
    const json = await response.json()
    expect(json).toEqual({
      success: false,
      op: "mfaU2fChallenge",
      errorMessage: "method_not_enrolled",
    })
  })

  test("returns 403 method_not_enrolled to prevent factor reuse when WebAuthn was already primary factor", async () => {
    const native = nativeCreate({
      factors: {
        user: { id: "user-1", organizationId: "org-1" },
        webAuthN: { verifiedAt: "2026-08-11T12:00:00Z", userVerified: true },
      },
    })
    const cookie = await flowCookieCreate()
    const app = workerCreate(native.fetch)

    const response = await app.request(
      `${origin}/api/v2/mfa/u2f/challenge?flow=${flowHandle}`,
      {
        method: "POST",
        headers: {
          origin,
          "content-type": "application/json",
          cookie: cookie.header,
        },
        body: JSON.stringify({
          csrfToken: "B".repeat(43),
        }),
      },
      bindings,
    )

    expect(response.status).toBe(403)
    const json = await response.json()
    expect(json).toEqual({
      success: false,
      op: "mfaU2fChallenge",
      errorMessage: "method_not_enrolled",
    })
  })

  test("returns 409 flow_stage_invalid when flow cookie stage is not mfa", async () => {
    const native = nativeCreate()
    const cookie = await flowCookieCreate({ stage: "ready" })
    const app = workerCreate(native.fetch)

    const response = await app.request(
      `${origin}/api/v2/mfa/u2f/challenge?flow=${flowHandle}`,
      {
        method: "POST",
        headers: {
          origin,
          "content-type": "application/json",
          cookie: cookie.header,
        },
        body: JSON.stringify({
          csrfToken: "B".repeat(43),
        }),
      },
      bindings,
    )

    expect(response.status).toBe(409)
    const json = await response.json()
    expect(json).toEqual({
      success: false,
      op: "mfaU2fChallenge",
      errorMessage: "flow_stage_invalid",
    })
  })

  test("returns 503 challenge_unavailable when ZITADEL options payload is malformed", async () => {
    const native = nativeCreate({ invalidOptions: true })
    const cookie = await flowCookieCreate()
    const app = workerCreate(native.fetch)

    const response = await app.request(
      `${origin}/api/v2/mfa/u2f/challenge?flow=${flowHandle}`,
      {
        method: "POST",
        headers: {
          origin,
          "content-type": "application/json",
          cookie: cookie.header,
        },
        body: JSON.stringify({
          csrfToken: "B".repeat(43),
        }),
      },
      bindings,
    )

    expect(response.status).toBe(503)
    const json = await response.json()
    expect(json).toEqual({
      success: false,
      op: "mfaU2fChallenge",
      errorMessage: "challenge_unavailable",
    })
  })

  test("enforces rate limits with 429 status and Retry-After header", async () => {
    const native = nativeCreate()
    const cookie = await flowCookieCreate()
    const app = workerAppCreate({
      fetch: native.fetch,
      now: () => now,
      randomBytes: (length) => new Uint8Array(length).fill(7),
      logger: { warn: () => {}, error: () => {} },
    })

    const response = await app.request(
      `${origin}/api/v2/mfa/u2f/challenge?flow=${flowHandle}`,
      {
        method: "POST",
        headers: {
          origin,
          "content-type": "application/json",
          cookie: cookie.header,
        },
        body: JSON.stringify({
          csrfToken: "B".repeat(43),
        }),
      },
      {
        ...bindings,
        RATE_LIMITER: { limit: async () => ({ success: false }) },
      },
    )

    expect(response.status).toBe(429)
    expect(response.headers.get("Retry-After")).toBe("60")
    const json = await response.json()
    expect(json).toEqual({
      success: false,
      op: "mfaU2fChallenge",
      errorMessage: "rate_limited",
    })
  })

  test("never returns session token or PAT secret in response body or headers", async () => {
    const native = nativeCreate()
    const cookie = await flowCookieCreate()
    const app = workerCreate(native.fetch)

    const response = await app.request(
      `${origin}/api/v2/mfa/u2f/challenge?flow=${flowHandle}`,
      {
        method: "POST",
        headers: {
          origin,
          "content-type": "application/json",
          cookie: cookie.header,
        },
        body: JSON.stringify({
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
