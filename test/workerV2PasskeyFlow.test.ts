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
    userVerification: "required" as const,
    allowCredentials: [
      {
        id: "ATmqBg-99qyOZk2zloPdJQyS2R7IkFT7v9Hoos_B_nM",
        type: "public-key" as const,
      },
    ],
  },
}

type NativeOptions = {
  methods?: string[]
  users?: unknown[]
  passkeyStatus?: number
  passkeyErrorId?: string
  verifyStatus?: number
  userVerified?: boolean
  forceMfa?: boolean
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
      return Response.json({ settings: { allowLocalAuthentication: true, forceMfa: options.forceMfa ?? false } })
    }
    if (url === `${identityOrigin}/v2/users` && method === "POST") {
      return Response.json({
        result: options.users ?? [
          {
            userId: "user-1",
            state: "USER_STATE_ACTIVE",
            details: { resourceOwner: "org-1" },
            human: { email: { email: "user@example.com", isVerified: true } },
          },
        ],
      })
    }
    if (url === `${identityOrigin}/v2/users/user-1/authentication_methods` && method === "GET") {
      return Response.json({
        authMethodTypes: options.methods ?? ["AUTHENTICATION_METHOD_TYPE_PASSKEY"],
      })
    }
    if (url === `${identityOrigin}/v2/sessions` && method === "POST") {
      if (options.passkeyStatus) {
        return Response.json(options.passkeyErrorId ? { id: options.passkeyErrorId } : { error: "upstream failure" }, {
          status: options.passkeyStatus,
        })
      }
      return Response.json({
        sessionId: "session-1",
        sessionToken: "passkey-token",
        challenges: {
          webAuthN: {
            publicKeyCredentialRequestOptions: mockPublicKeyOptions,
          },
        },
      })
    }
    if (url === `${identityOrigin}/v2/sessions/session-1` && method === "PATCH") {
      if (options.verifyStatus) {
        return Response.json({ error: "verify failed" }, { status: options.verifyStatus })
      }
      return Response.json({ sessionToken: "updated-passkey-token" })
    }
    if (url.startsWith(`${identityOrigin}/v2/sessions/session-1?`) && method === "GET") {
      return Response.json({
        session: {
          id: "session-1",
          factors: {
            user: {
              id: "user-1",
              loginName: "user@example.com",
              organizationId: "org-1",
            },
            webAuthN: {
              verifiedAt: "2026-08-11T12:00:00Z",
              userVerified: options.userVerified ?? true,
            },
          },
        },
      })
    }

    throw new Error(`Unexpected request: ${method} ${url}`)
  }
  return { fetch, calls }
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
    challenge: overrides.challenge ?? mockPublicKeyOptions.publicKey.challenge,
    origin: overrides.origin ?? origin,
  })
  return base64UrlEncodeText(json)
}

function validCredentialCreate(overrides: { clientDataJSON?: string; userHandle?: string | null } = {}) {
  return {
    id: "ATmqBg-99qyOZk2zloPdJQyS2R7IkFT7v9Hoos_B_nM",
    rawId: "ATmqBg-99qyOZk2zloPdJQyS2R7IkFT7v9Hoos_B_nM",
    type: "public-key" as const,
    response: {
      clientDataJSON: overrides.clientDataJSON ?? clientDataCreate(),
      authenticatorData: "SZYN5YgOjGh0NBcPZHZgW4_km1u5-GLWIyG5ZUXrW4E",
      signature: "MEUCIQDa1234567890",
      ...(overrides.userHandle !== undefined ? { userHandle: overrides.userHandle } : {}),
    },
  }
}

async function flowCookieCreate(customState?: Partial<FlowV2Cookie>) {
  const baseState = {
    version: 2 as const,
    flowHandle: "AAAAAAAAAAAAAAAAAAAAAA",
    requestKind: "oidc" as const,
    authRequestId: "request-1",
    clientId: "client-1",
    redirectUri: "https://client.example/callback",
    organizationId: "org-1",
    prompt: ["PROMPT_LOGIN"],
    csrfToken: "B".repeat(43),
    issuedAt: now,
    expiresAt: now + 900,
    transitionCounter: 0,
  }

  const cookieState: FlowV2Cookie =
    customState?.stage === "verified"
      ? {
          ...baseState,
          stage: "verified",
          delegable: false,
          userId: "user-1",
          sessionId: "session-1",
          sessionToken: "token-1",
        }
      : customState?.stage === "passkey"
        ? {
            ...baseState,
            stage: "passkey",
            delegable: false,
            userId: "user-1",
            sessionId: "session-1",
            sessionToken: "passkey-token",
            options: mockPublicKeyOptions,
            ...customState,
          }
        : ({
            ...baseState,
            stage: "ready",
            delegable: true,
            owned: true,
            ...customState,
          } as FlowV2Cookie)

  const sealed = await flowV2CookieSeal(cookieState, key, new Uint8Array(12))
  if (!sealed.success) throw new Error("Failed to seal cookie")
  return {
    header: `__Host-zitadel-login-flow-AAAAAAAAAAAAAAAAAAAAAA=${sealed.data}`,
    state: cookieState,
  }
}

describe("Worker V2 passkey flow", () => {
  test("creates passkey challenge and returns screen with WebAuthn options via /api/v2/passkey/challenge", async () => {
    const native = nativeCreate()
    const app = workerAppCreate({
      fetch: native.fetch,
      now: () => now,
      randomBytes: (length) => new Uint8Array(length).fill(7),
      logger: { warn: () => {}, error: () => {} },
    })

    const cookie = await flowCookieCreate()
    const response = await app.request(
      "https://login.example/api/v2/passkey/challenge?flow=AAAAAAAAAAAAAAAAAAAAAA",
      {
        method: "POST",
        headers: {
          origin,
          "content-type": "application/json",
          cookie: cookie.header,
        },
        body: JSON.stringify({
          identifier: "user@example.com",
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
        route: "/login/passkey?flow=AAAAAAAAAAAAAAAAAAAAAA",
        screen: {
          name: "passkey",
          options: mockPublicKeyOptions,
        },
        csrfToken: "B".repeat(43),
      },
    })

    const setCookie = response.headers.get("Set-Cookie")
    expect(setCookie).toBeTruthy()
    const match = setCookie?.match(/__Host-zitadel-login-flow-AAAAAAAAAAAAAAAAAAAAAA=([^;]+)/)
    expect(match).toBeTruthy()
    const opened = await flowV2CookieOpen(match![1]!, "AAAAAAAAAAAAAAAAAAAAAA", [key], now)
    expect(opened.success).toBe(true)
    if (!opened.success) return
    expect(opened.data.stage).toBe("passkey")
    if (opened.data.stage !== "passkey") return
    expect(opened.data.sessionId).toBe("session-1")
    expect(opened.data.sessionToken).toBe("passkey-token")
    expect(opened.data.options).toEqual(mockPublicKeyOptions)
  })

  test("works identically via /api/v2/webauthn/assertion/options alias", async () => {
    const native = nativeCreate()
    const app = workerAppCreate({
      fetch: native.fetch,
      now: () => now,
      randomBytes: (length) => new Uint8Array(length).fill(7),
      logger: { warn: () => {}, error: () => {} },
    })

    const cookie = await flowCookieCreate()
    const response = await app.request(
      "https://login.example/api/v2/webauthn/assertion/options?flow=AAAAAAAAAAAAAAAAAAAAAA",
      {
        method: "POST",
        headers: {
          origin,
          "content-type": "application/json",
          cookie: cookie.header,
        },
        body: JSON.stringify({
          identifier: "user@example.com",
          csrfToken: "B".repeat(43),
        }),
      },
      bindings,
    )

    expect(response.status).toBe(202)
    const json = await response.json()
    expect(json.success).toBe(true)
  })

  test("rejects invalid CSRF token with 403 csrf_rejected", async () => {
    const native = nativeCreate()
    const app = workerAppCreate({
      fetch: native.fetch,
      now: () => now,
      randomBytes: (length) => new Uint8Array(length).fill(7),
      logger: { warn: () => {}, error: () => {} },
    })

    const cookie = await flowCookieCreate()
    const response = await app.request(
      "https://login.example/api/v2/passkey/challenge?flow=AAAAAAAAAAAAAAAAAAAAAA",
      {
        method: "POST",
        headers: {
          origin,
          "content-type": "application/json",
          cookie: cookie.header,
        },
        body: JSON.stringify({
          identifier: "user@example.com",
          csrfToken: "X".repeat(43),
        }),
      },
      bindings,
    )

    expect(response.status).toBe(403)
    expect(await response.json()).toEqual({
      success: false,
      op: "passkeyChallengeCreate",
      errorMessage: "csrf_rejected",
    })
  })

  test("rejects invalid origin with 403 origin_rejected", async () => {
    const native = nativeCreate()
    const app = workerAppCreate({
      fetch: native.fetch,
      now: () => now,
      randomBytes: (length) => new Uint8Array(length).fill(7),
      logger: { warn: () => {}, error: () => {} },
    })

    const cookie = await flowCookieCreate()
    const response = await app.request(
      "https://login.example/api/v2/passkey/challenge?flow=AAAAAAAAAAAAAAAAAAAAAA",
      {
        method: "POST",
        headers: {
          origin: "https://evil.example",
          "content-type": "application/json",
          cookie: cookie.header,
        },
        body: JSON.stringify({
          identifier: "user@example.com",
          csrfToken: "B".repeat(43),
        }),
      },
      bindings,
    )

    expect(response.status).toBe(403)
    expect(await response.json()).toEqual({
      error: {
        code: "origin_rejected",
        message: "Request origin rejected.",
      },
    })
  })

  test("rejects invalid RP ID with 403 request_rejected", async () => {
    const native = nativeCreate()
    const app = workerAppCreate({
      fetch: native.fetch,
      now: () => now,
      randomBytes: (length) => new Uint8Array(length).fill(7),
      logger: { warn: () => {}, error: () => {} },
    })

    const cookie = await flowCookieCreate()
    const response = await app.request(
      "https://login.example/api/v2/passkey/challenge?flow=AAAAAAAAAAAAAAAAAAAAAA",
      {
        method: "POST",
        headers: {
          origin,
          "content-type": "application/json",
          cookie: cookie.header,
        },
        body: JSON.stringify({
          identifier: "user@example.com",
          rpId: "other.domain.com",
          csrfToken: "B".repeat(43),
        }),
      },
      bindings,
    )

    expect(response.status).toBe(403)
    expect(await response.json()).toEqual({
      success: false,
      op: "passkeyChallengeCreate",
      errorMessage: "request_rejected",
    })
  })

  test("rejects parent-domain RP ID with 403 request_rejected", async () => {
    const native = nativeCreate()
    const app = workerAppCreate({
      fetch: native.fetch,
      now: () => now,
      randomBytes: (length) => new Uint8Array(length).fill(7),
      logger: { warn: () => {}, error: () => {} },
    })

    const cookie = await flowCookieCreate()
    const response = await app.request(
      "https://login.example/api/v2/passkey/challenge?flow=AAAAAAAAAAAAAAAAAAAAAA",
      {
        method: "POST",
        headers: {
          origin,
          "content-type": "application/json",
          cookie: cookie.header,
        },
        body: JSON.stringify({
          identifier: "user@example.com",
          rpId: "example.com",
          csrfToken: "B".repeat(43),
        }),
      },
      bindings,
    )

    expect(response.status).toBe(403)
    expect(await response.json()).toEqual({
      success: false,
      op: "passkeyChallengeCreate",
      errorMessage: "request_rejected",
    })
  })

  test("returns fallback when ZITADEL_PASSKEY_V2_ENABLED is false", async () => {
    const native = nativeCreate()
    const app = workerAppCreate({
      fetch: native.fetch,
      now: () => now,
      randomBytes: (length) => new Uint8Array(length).fill(7),
      logger: { warn: () => {}, error: () => {} },
    })

    const cookie = await flowCookieCreate()
    const response = await app.request(
      "https://login.example/api/v2/passkey/challenge?flow=AAAAAAAAAAAAAAAAAAAAAA",
      {
        method: "POST",
        headers: {
          origin,
          "content-type": "application/json",
          cookie: cookie.header,
        },
        body: JSON.stringify({
          identifier: "user@example.com",
          csrfToken: "B".repeat(43),
        }),
      },
      { ...bindings, ZITADEL_PASSKEY_V2_ENABLED: "false" },
    )

    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({
      success: true,
      data: {
        kind: "fallback",
        path: "/api/v2/flow/fallback?flow=AAAAAAAAAAAAAAAAAAAAAA",
      },
    })
  })

  test("returns 409 flow_replayed when flow is already in terminal/verified stage", async () => {
    const native = nativeCreate()
    const app = workerAppCreate({
      fetch: native.fetch,
      now: () => now,
      randomBytes: (length) => new Uint8Array(length).fill(7),
      logger: { warn: () => {}, error: () => {} },
    })

    const cookie = await flowCookieCreate({
      stage: "verified",
      delegable: false,
      userId: "user-1",
      sessionId: "session-1",
      sessionToken: "token-1",
    } as unknown as Partial<FlowV2Cookie>)

    const response = await app.request(
      "https://login.example/api/v2/passkey/challenge?flow=AAAAAAAAAAAAAAAAAAAAAA",
      {
        method: "POST",
        headers: {
          origin,
          "content-type": "application/json",
          cookie: cookie.header,
        },
        body: JSON.stringify({
          identifier: "user@example.com",
          csrfToken: "B".repeat(43),
        }),
      },
      bindings,
    )

    expect(response.status).toBe(409)
    expect(await response.json()).toEqual({
      success: false,
      op: "passkeyChallengeCreate",
      errorMessage: "flow_stage_invalid",
    })
  })

  test("verifies passkey assertion via /api/v2/passkey/verify and returns complete transition", async () => {
    const native = nativeCreate()
    const app = workerAppCreate({
      fetch: native.fetch,
      now: () => now,
      randomBytes: (length) => new Uint8Array(length).fill(7),
      logger: { warn: () => {}, error: () => {} },
    })

    const cookie = await flowCookieCreate({ stage: "passkey" })
    const response = await app.request(
      "https://login.example/api/v2/passkey/verify?flow=AAAAAAAAAAAAAAAAAAAAAA",
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
    expect(await response.json()).toEqual({
      success: true,
      data: {
        kind: "complete",
        path: "/api/v2/flow/continue?flow=AAAAAAAAAAAAAAAAAAAAAA",
      },
    })

    const setCookie = response.headers.get("Set-Cookie")
    expect(setCookie).toBeTruthy()
    const match = setCookie?.match(/__Host-zitadel-login-flow-AAAAAAAAAAAAAAAAAAAAAA=([^;]+)/)
    expect(match).toBeTruthy()
    const opened = await flowV2CookieOpen(match![1]!, "AAAAAAAAAAAAAAAAAAAAAA", [key], now)
    expect(opened.success).toBe(true)
    if (!opened.success) return
    expect(opened.data.stage).toBe("verified")
    if (opened.data.stage !== "verified") return
    expect(opened.data.sessionId).toBe("session-1")
    expect(opened.data.sessionToken).toBe("updated-passkey-token")
  })

  test("works identically via /api/v2/webauthn/assertion/verify alias", async () => {
    const native = nativeCreate()
    const app = workerAppCreate({
      fetch: native.fetch,
      now: () => now,
      randomBytes: (length) => new Uint8Array(length).fill(7),
      logger: { warn: () => {}, error: () => {} },
    })

    const cookie = await flowCookieCreate({ stage: "passkey" })
    const response = await app.request(
      "https://login.example/api/v2/webauthn/assertion/verify?flow=AAAAAAAAAAAAAAAAAAAAAA",
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
    expect(json.success).toBe(true)
  })

  test("rejects malformed clientDataJSON with 400 invalid_payload", async () => {
    const native = nativeCreate()
    const app = workerAppCreate({
      fetch: native.fetch,
      now: () => now,
      randomBytes: (length) => new Uint8Array(length).fill(7),
      logger: { warn: () => {}, error: () => {} },
    })

    const cookie = await flowCookieCreate({ stage: "passkey" })
    const response = await app.request(
      "https://login.example/api/v2/passkey/verify?flow=AAAAAAAAAAAAAAAAAAAAAA",
      {
        method: "POST",
        headers: {
          origin,
          "content-type": "application/json",
          cookie: cookie.header,
        },
        body: JSON.stringify({
          credential: validCredentialCreate({ clientDataJSON: "invalid-json-content!!" }),
          csrfToken: "B".repeat(43),
        }),
      },
      bindings,
    )

    expect(response.status).toBe(400)
    expect(await response.json()).toEqual({
      success: false,
      op: "passkeyVerify",
      errorMessage: "invalid_payload",
    })
  })

  test("rejects challenge mismatch with 401 credentials_invalid", async () => {
    const native = nativeCreate()
    const app = workerAppCreate({
      fetch: native.fetch,
      now: () => now,
      randomBytes: (length) => new Uint8Array(length).fill(7),
      logger: { warn: () => {}, error: () => {} },
    })

    const cookie = await flowCookieCreate({ stage: "passkey" })
    const response = await app.request(
      "https://login.example/api/v2/passkey/verify?flow=AAAAAAAAAAAAAAAAAAAAAA",
      {
        method: "POST",
        headers: {
          origin,
          "content-type": "application/json",
          cookie: cookie.header,
        },
        body: JSON.stringify({
          credential: validCredentialCreate({ clientDataJSON: clientDataCreate({ challenge: "wrong-challenge" }) }),
          csrfToken: "B".repeat(43),
        }),
      },
      bindings,
    )

    expect(response.status).toBe(401)
    expect(await response.json()).toEqual({
      success: false,
      op: "passkeyVerify",
      errorMessage: "credentials_invalid",
    })
  })

  test("handles user-handle variants: succeeds for matching user-handle, fails for mismatch", async () => {
    const native = nativeCreate()
    const app = workerAppCreate({
      fetch: native.fetch,
      now: () => now,
      randomBytes: (length) => new Uint8Array(length).fill(7),
      logger: { warn: () => {}, error: () => {} },
    })

    const cookie = await flowCookieCreate({ stage: "passkey" })

    // Matching userHandle
    const validRes = await app.request(
      "https://login.example/api/v2/passkey/verify?flow=AAAAAAAAAAAAAAAAAAAAAA",
      {
        method: "POST",
        headers: {
          origin,
          "content-type": "application/json",
          cookie: cookie.header,
        },
        body: JSON.stringify({
          credential: validCredentialCreate({ userHandle: "user-1" }),
          csrfToken: "B".repeat(43),
        }),
      },
      bindings,
    )
    expect(validRes.status).toBe(200)

    // Mismatched userHandle
    const invalidRes = await app.request(
      "https://login.example/api/v2/passkey/verify?flow=AAAAAAAAAAAAAAAAAAAAAA",
      {
        method: "POST",
        headers: {
          origin,
          "content-type": "application/json",
          cookie: cookie.header,
        },
        body: JSON.stringify({
          credential: validCredentialCreate({ userHandle: "wrong-user-id" }),
          csrfToken: "B".repeat(43),
        }),
      },
      bindings,
    )
    expect(invalidRes.status).toBe(401)
    expect(await invalidRes.json()).toEqual({
      success: false,
      op: "passkeyVerify",
      errorMessage: "credentials_invalid",
    })
  })

  test("returns 401 credentials_invalid when native passkey check fails", async () => {
    const native = nativeCreate({ verifyStatus: 400 })
    const app = workerAppCreate({
      fetch: native.fetch,
      now: () => now,
      randomBytes: (length) => new Uint8Array(length).fill(7),
      logger: { warn: () => {}, error: () => {} },
    })

    const cookie = await flowCookieCreate({ stage: "passkey" })
    const response = await app.request(
      "https://login.example/api/v2/passkey/verify?flow=AAAAAAAAAAAAAAAAAAAAAA",
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

    expect(response.status).toBe(401)
    expect(await response.json()).toEqual({
      success: false,
      op: "passkeyVerify",
      errorMessage: "credentials_invalid",
    })
  })

  test("returns 409 flow_stage_invalid when flow is in stage ready", async () => {
    const native = nativeCreate()
    const app = workerAppCreate({
      fetch: native.fetch,
      now: () => now,
      randomBytes: (length) => new Uint8Array(length).fill(7),
      logger: { warn: () => {}, error: () => {} },
    })

    const cookie = await flowCookieCreate({ stage: "ready" })
    const response = await app.request(
      "https://login.example/api/v2/passkey/verify?flow=AAAAAAAAAAAAAAAAAAAAAA",
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
    expect(await response.json()).toEqual({
      success: false,
      op: "passkeyVerify",
      errorMessage: "flow_stage_invalid",
    })
  })

  test("returns 409 flow_replayed when flow is already in stage verified", async () => {
    const native = nativeCreate()
    const app = workerAppCreate({
      fetch: native.fetch,
      now: () => now,
      randomBytes: (length) => new Uint8Array(length).fill(7),
      logger: { warn: () => {}, error: () => {} },
    })

    const cookie = await flowCookieCreate({ stage: "verified" })
    const response = await app.request(
      "https://login.example/api/v2/passkey/verify?flow=AAAAAAAAAAAAAAAAAAAAAA",
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
    expect(await response.json()).toEqual({
      success: false,
      op: "passkeyVerify",
      errorMessage: "flow_replayed",
    })
  })

  test("transitions to mfa stage when userVerified is false and user has enrolled MFA factor", async () => {
    const native = nativeCreate({
      userVerified: false,
      methods: ["AUTHENTICATION_METHOD_TYPE_PASSKEY", "AUTHENTICATION_METHOD_TYPE_TOTP"],
    })
    const app = workerAppCreate({
      fetch: native.fetch,
      now: () => now,
      randomBytes: (length) => new Uint8Array(length).fill(7),
      logger: { warn: () => {}, error: () => {} },
    })

    const cookie = await flowCookieCreate({ stage: "passkey" })
    const response = await app.request(
      "https://login.example/api/v2/passkey/verify?flow=AAAAAAAAAAAAAAAAAAAAAA",
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
    expect(await response.json()).toEqual({
      success: true,
      data: {
        kind: "render",
        route: "/login/mfa?flow=AAAAAAAAAAAAAAAAAAAAAA",
        screen: {
          name: "mfa",
          factors: ["AUTHENTICATION_METHOD_TYPE_TOTP"],
        },
        csrfToken: "B".repeat(43),
      },
    })
  })

  test("returns 503 passkey_unavailable on upstream ZITADEL server failure", async () => {
    const native = nativeCreate({ verifyStatus: 500 })
    const app = workerAppCreate({
      fetch: native.fetch,
      now: () => now,
      randomBytes: (length) => new Uint8Array(length).fill(7),
      logger: { warn: () => {}, error: () => {} },
    })

    const cookie = await flowCookieCreate({ stage: "passkey" })
    const response = await app.request(
      "https://login.example/api/v2/passkey/verify?flow=AAAAAAAAAAAAAAAAAAAAAA",
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
    expect(await response.json()).toEqual({
      success: false,
      op: "passkeyVerify",
      errorMessage: "passkey_unavailable",
    })
  })
})
