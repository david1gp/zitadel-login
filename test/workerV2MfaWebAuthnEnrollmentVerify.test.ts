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
const registrationChallenge = "registration-challenge"
const assertionChallenge = "assertion-challenge"
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

function base64UrlEncode(bytes: Uint8Array): string {
  let binary = ""
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", "")
}

function textEncode(value: string): string {
  return base64UrlEncode(new TextEncoder().encode(value))
}

function cborLengthEncode(major: number, length: number): number[] {
  if (length < 24) return [(major << 5) | length]
  if (length < 256) return [(major << 5) | 24, length]
  return [(major << 5) | 25, length >> 8, length & 255]
}

async function attestationCreate(
  method: "u2f" | "passkey",
  overrides: { type?: string; challenge?: string; origin?: string; flags?: number; rpId?: string } = {},
) {
  const rpHash = new Uint8Array(
    await crypto.subtle.digest("SHA-256", new TextEncoder().encode(overrides.rpId ?? "login.example")),
  )
  const credentialId = new TextEncoder().encode("credential-id")
  const credentialIdString = base64UrlEncode(credentialId)
  const completeAuthData = new Uint8Array(55 + credentialId.length + 1)
  completeAuthData.set(rpHash)
  completeAuthData[32] = overrides.flags ?? (method === "passkey" ? 0x45 : 0x41)
  completeAuthData[53] = credentialId.length >> 8
  completeAuthData[54] = credentialId.length & 255
  completeAuthData.set(credentialId, 55)
  completeAuthData[55 + credentialId.length] = 0xa0
  const key = new TextEncoder().encode("authData")
  const attestationObject = new Uint8Array([
    0xa1,
    ...cborLengthEncode(3, key.length),
    ...key,
    ...cborLengthEncode(2, completeAuthData.length),
    ...completeAuthData,
  ])
  const clientDataJSON = textEncode(
    JSON.stringify({
      type: overrides.type ?? "webauthn.create",
      challenge: overrides.challenge ?? registrationChallenge,
      origin: overrides.origin ?? origin,
    }),
  )
  return {
    id: credentialIdString,
    rawId: credentialIdString,
    type: "public-key" as const,
    response: { attestationObject: base64UrlEncode(attestationObject), clientDataJSON },
  }
}

function setupStateCreate(method: "u2f" | "passkey", overrides: Partial<FlowV2Cookie> = {}) {
  return {
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
    transitionCounter: 3,
    stage: "mfa_webauthn_setup",
    delegable: false,
    userId: "user-secret-id",
    sessionId: "session-secret-id",
    sessionToken: "initial-secret-token",
    mfaMethods: [],
    registrationMethod: method,
    registrationId: "registration-secret-id",
    registrationChallenge,
    registrationRpId: "login.example",
    registrationOrigin: origin,
    registrationStartedAt: now,
    registrationExpiresAt: now + 300,
    ...overrides,
  } as Extract<FlowV2Cookie, { stage: "mfa_webauthn_setup" }>
}

type NativeOptions = {
  authClientId?: string
  sessionOrganizationId?: string
  userState?: string
  policyAllows?: boolean
  activationStatus?: number
  challengeStatus?: number
  malformedChallenge?: boolean
}

function nativeCreate(method: "u2f" | "passkey", options: NativeOptions = {}) {
  const calls: Array<{ method: string; url: string; body?: unknown }> = []
  let methodsGetCount = 0
  let sessionGetCount = 0
  let activated = false
  let assertionChecked = false
  const fetch = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const url = String(input)
    const requestMethod = init?.method ?? "GET"
    const body = init?.body ? JSON.parse(String(init.body)) : undefined
    calls.push({ method: requestMethod, url, ...(body === undefined ? {} : { body }) })
    if (url === `${identityOrigin}/v2/oidc/auth_requests/request-1` && requestMethod === "GET") {
      return Response.json({
        authRequest: {
          id: "request-1",
          clientId: options.authClientId ?? "client-1",
          redirectUri: "https://client.example/callback",
          scope: ["openid"],
          prompt: ["PROMPT_LOGIN"],
        },
      })
    }
    if (url.startsWith(`${identityOrigin}/v2/sessions/session-secret-id?`) && requestMethod === "GET") {
      sessionGetCount += 1
      return Response.json({
        session: {
          id: "session-secret-id",
          sessionToken: `reauthorized-secret-token-${sessionGetCount}`,
          expirationDate: "2027-01-15T08:15:00Z",
          factors: {
            user: {
              id: "user-secret-id",
              organizationId: options.sessionOrganizationId ?? "org-1",
            },
            password: { verifiedAt: "2027-01-15T08:00:00Z" },
            ...(assertionChecked
              ? {
                  webAuthN: {
                    verifiedAt: "2027-01-15T08:01:00Z",
                    userVerified: method === "passkey",
                  },
                }
              : {}),
          },
        },
      })
    }
    if (url === `${identityOrigin}/v2/users/user-secret-id` && requestMethod === "GET") {
      return Response.json({
        user: {
          userId: "user-secret-id",
          state: options.userState ?? "USER_STATE_ACTIVE",
          details: { resourceOwner: "org-1" },
          human: { email: { email: "secret@example.com", isVerified: true } },
        },
      })
    }
    if (url === `${identityOrigin}/v2/users/user-secret-id/authentication_methods` && requestMethod === "GET") {
      methodsGetCount += 1
      return Response.json({
        authMethodTypes: [
          "AUTHENTICATION_METHOD_TYPE_PASSWORD",
          ...(activated
            ? [method === "u2f" ? "AUTHENTICATION_METHOD_TYPE_U2F" : "AUTHENTICATION_METHOD_TYPE_PASSKEY"]
            : []),
        ],
      })
    }
    if (url === `${identityOrigin}/v2/settings/login` && requestMethod === "GET") {
      return Response.json({
        settings:
          options.policyAllows === false
            ? { forceMfa: true, secondFactors: [], multiFactors: [] }
            : method === "u2f"
              ? { forceMfa: true, secondFactors: ["SECOND_FACTOR_TYPE_U2F"], multiFactors: [] }
              : { forceMfa: true, secondFactors: [], multiFactors: ["MULTI_FACTOR_TYPE_U2F_WITH_VERIFICATION"] },
      })
    }
    const registrationPath = method === "u2f" ? "/u2f/registration-secret-id" : "/passkeys/registration-secret-id"
    if (url === `${identityOrigin}/v2/users/user-secret-id${registrationPath}` && requestMethod === "POST") {
      if (options.activationStatus) {
        return Response.json({ nativeSecret: "must-not-leak" }, { status: options.activationStatus })
      }
      activated = true
      return Response.json({ details: { sequence: "4", resourceOwner: "org-1" } })
    }
    if (url === `${identityOrigin}/v2/sessions/session-secret-id` && requestMethod === "PATCH") {
      if (body && typeof body === "object" && "checks" in body) {
        assertionChecked = true
        return Response.json({ sessionToken: "assertion-rotated-secret-token" })
      }
      if (options.challengeStatus) {
        return Response.json({ nativeSecret: "must-not-leak" }, { status: options.challengeStatus })
      }
      return Response.json({
        sessionToken: "challenge-rotated-secret-token",
        challenges: {
          webAuthN: {
            publicKeyCredentialRequestOptions: options.malformedChallenge
              ? { invalid: true }
              : {
                  publicKey: {
                    challenge: assertionChallenge,
                    rpId: "login.example",
                    timeout: 300000,
                    userVerification: method === "passkey" ? "required" : "discouraged",
                    allowCredentials: [{ id: "credential-id", type: "public-key" }],
                  },
                },
          },
        },
      })
    }
    throw new Error(`Unexpected request: ${requestMethod} ${url} ${methodsGetCount}`)
  }
  return { fetch, calls }
}

async function cookieCreate(state: FlowV2Cookie) {
  const sealed = await flowV2CookieSeal(state, key, new Uint8Array(12).fill(9))
  if (!sealed.success) throw new Error("Expected sealed flow")
  return `${cookieName}=${sealed.data}`
}

async function verifyRequest(method: "u2f" | "passkey", cookie: string, body: Record<string, unknown> = {}) {
  return new Request(`${origin}/api/v2/mfa/${method}/enroll/verify?flow=${flowHandle}`, {
    method: "POST",
    headers: { origin, "content-type": "application/json", cookie },
    body: JSON.stringify({ method, credential: await attestationCreate(method), csrfToken, ...body }),
  })
}

function cookieValueGet(response: Response): string {
  const value = response.headers.get("set-cookie")?.match(new RegExp(`${cookieName}=([^;]+)`))?.[1]
  if (!value) throw new Error("Expected flow cookie")
  return value
}

describe("POST /api/v2/mfa/{u2f,passkey}/enroll/verify", () => {
  for (const method of ["u2f", "passkey"] as const) {
    test(`activates ${method}, creates a fresh assertion challenge, and seals one-time check-after state`, async () => {
      const native = nativeCreate(method)
      const app = workerAppCreate({
        fetch: native.fetch,
        now: () => now,
        randomBytes: (length) => new Uint8Array(length).fill(7),
        logger: { warn: () => {}, error: () => {} },
      })
      const response = await app.request(
        await verifyRequest(method, await cookieCreate(setupStateCreate(method)), { displayName: "  Work key  " }),
        undefined,
        bindings,
      )

      expect(response.status).toBe(200)
      const text = await response.text()
      expect(JSON.parse(text)).toEqual({
        success: true,
        data: {
          transition: {
            kind: "render",
            route: `/login/mfa?flow=${flowHandle}`,
            screen: {
              name: "mfa",
              factors: [method === "u2f" ? "AUTHENTICATION_METHOD_TYPE_U2F" : "AUTHENTICATION_METHOD_TYPE_PASSKEY"],
              enrollment: true,
              options: {
                publicKey: {
                  challenge: assertionChallenge,
                  rpId: "login.example",
                  timeout: 300000,
                  userVerification: method === "passkey" ? "required" : "discouraged",
                  allowCredentials: [{ id: "credential-id", type: "public-key" }],
                },
              },
            },
            csrfToken,
          },
        },
      })
      for (const hidden of [
        "registration-secret-id",
        "user-secret-id",
        "session-secret-id",
        "initial-secret-token",
        "challenge-rotated-secret-token",
        "test-pat-not-a-real-secret-value",
      ]) {
        expect(text).not.toContain(hidden)
      }

      const opened = await flowV2CookieOpen(cookieValueGet(response), flowHandle, [key], now)
      expect(opened.success).toBe(true)
      if (!opened.success || opened.data.stage !== "mfa") return
      expect(opened.data).toMatchObject({
        stage: "mfa",
        transitionCounter: 4,
        sessionToken: "challenge-rotated-secret-token",
        webAuthnCheckMethod: method,
        options: { publicKey: { challenge: assertionChallenge } },
      })
      expect(native.calls.filter((call) => call.method === "POST").at(-1)).toMatchObject({
        body: {
          publicKeyCredential: { type: "public-key" },
          ...(method === "u2f" ? { tokenName: "Work key" } : { passkeyName: "Work key" }),
        },
      })
      expect(native.calls.filter((call) => call.url.endsWith("/sessions/session-secret-id"))).toHaveLength(1)

      const resumed = await app.request(
        new Request(`${origin}/api/v2/flow/resume?flow=${flowHandle}`, {
          headers: { cookie: `${cookieName}=${cookieValueGet(response)}` },
        }),
        undefined,
        bindings,
      )
      expect(resumed.status).toBe(200)
      expect(await resumed.json()).toMatchObject({
        success: true,
        data: {
          kind: "render",
          screen: { name: "mfa", enrollment: true },
        },
      })
    })
  }

  test("rejects malformed ceremony bindings and required flags before native mutation", async () => {
    const cases = [
      { method: "u2f" as const, credential: await attestationCreate("u2f", { type: "webauthn.get" }) },
      { method: "u2f" as const, credential: await attestationCreate("u2f", { challenge: "wrong" }) },
      { method: "u2f" as const, credential: await attestationCreate("u2f", { origin: "https://evil.example" }) },
      { method: "u2f" as const, credential: await attestationCreate("u2f", { flags: 0x40 }) },
      { method: "passkey" as const, credential: await attestationCreate("passkey", { flags: 0x41 }) },
      { method: "u2f" as const, credential: await attestationCreate("u2f", { rpId: "evil.example" }) },
      { method: "u2f" as const, credential: { ...(await attestationCreate("u2f")), id: "other-id" } },
    ]
    for (const entry of cases) {
      const native = nativeCreate(entry.method)
      const app = workerAppCreate({ fetch: native.fetch, now: () => now, logger: { warn: () => {}, error: () => {} } })
      const request = await verifyRequest(entry.method, await cookieCreate(setupStateCreate(entry.method)), {
        credential: entry.credential,
      })
      const response = await app.request(request, undefined, bindings)
      expect(response.status).toBe(401)
      expect(native.calls.some((call) => call.method === "POST")).toBe(false)
    }
  })

  test("rejects method, CSRF, stage, transition binding, expiry, replay, authorization, and policy changes", async () => {
    const methodMismatchNative = nativeCreate("u2f")
    const app = workerAppCreate({
      fetch: methodMismatchNative.fetch,
      now: () => now,
      logger: { warn: () => {}, error: () => {} },
    })
    const mismatch = await app.request(
      new Request(`${origin}/api/v2/mfa/passkey/enroll/verify?flow=${flowHandle}`, {
        method: "POST",
        headers: { origin, "content-type": "application/json", cookie: await cookieCreate(setupStateCreate("u2f")) },
        body: JSON.stringify({ method: "u2f", credential: await attestationCreate("u2f"), csrfToken }),
      }),
      undefined,
      bindings,
    )
    expect(mismatch.status).toBe(403)

    const badCsrf = await app.request(
      await verifyRequest("u2f", await cookieCreate(setupStateCreate("u2f")), { csrfToken: "C".repeat(43) }),
      undefined,
      bindings,
    )
    expect(badCsrf.status).toBe(403)

    const expired = await app.request(
      await verifyRequest("u2f", await cookieCreate(setupStateCreate("u2f", { registrationExpiresAt: now }))),
      undefined,
      bindings,
    )
    expect(expired.status).toBe(409)

    const malformedTransition = await app.request(
      await verifyRequest("u2f", await cookieCreate(setupStateCreate("u2f", { transitionCounter: 0 }))),
      undefined,
      bindings,
    )
    expect(malformedTransition.status).toBe(409)

    const mfaState: Extract<FlowV2Cookie, { stage: "mfa" }> = {
      ...setupStateCreate("u2f"),
      stage: "mfa",
      mfaMethods: ["AUTHENTICATION_METHOD_TYPE_U2F"],
      webAuthnCheckMethod: "u2f",
    }
    const replay = await app.request(await verifyRequest("u2f", await cookieCreate(mfaState)), undefined, bindings)
    expect(replay.status).toBe(409)

    for (const options of [
      { authClientId: "other-client" },
      { sessionOrganizationId: "other-org" },
      { userState: "USER_STATE_INACTIVE" },
      { policyAllows: false },
    ]) {
      const native = nativeCreate("u2f", options)
      const guardedApp = workerAppCreate({
        fetch: native.fetch,
        now: () => now,
        logger: { warn: () => {}, error: () => {} },
      })
      const response = await guardedApp.request(
        await verifyRequest("u2f", await cookieCreate(setupStateCreate("u2f"))),
        undefined,
        bindings,
      )
      expect([403, 409]).toContain(response.status)
      expect(native.calls.some((call) => call.method === "POST")).toBe(false)
    }
  })

  test("keeps setup before activation failure and consumes it after activation when challenge creation fails", async () => {
    const before = nativeCreate("u2f", { activationStatus: 503 })
    const beforeApp = workerAppCreate({
      fetch: before.fetch,
      now: () => now,
      logger: { warn: () => {}, error: () => {} },
    })
    const beforeResponse = await beforeApp.request(
      await verifyRequest("u2f", await cookieCreate(setupStateCreate("u2f"))),
      undefined,
      bindings,
    )
    expect(beforeResponse.status).toBe(503)
    expect(beforeResponse.headers.get("set-cookie")).toBeNull()
    expect(await beforeResponse.json()).toEqual({
      success: false,
      op: "mfaU2fEnrollmentVerify",
      errorMessage: "enrollment_unavailable",
    })

    for (const failure of [{ challengeStatus: 503 }, { malformedChallenge: true }]) {
      const after = nativeCreate("u2f", failure)
      const afterApp = workerAppCreate({
        fetch: after.fetch,
        now: () => now,
        randomBytes: (length) => new Uint8Array(length).fill(7),
        logger: { warn: () => {}, error: () => {} },
      })
      const afterResponse = await afterApp.request(
        await verifyRequest("u2f", await cookieCreate(setupStateCreate("u2f"))),
        undefined,
        bindings,
      )
      expect(afterResponse.status).toBe(200)
      expect(await afterResponse.clone().json()).toEqual({
        success: true,
        data: {
          transition: {
            kind: "render",
            route: `/login/mfa?flow=${flowHandle}`,
            screen: { name: "mfa", factors: ["AUTHENTICATION_METHOD_TYPE_U2F"], enrollment: true },
            csrfToken,
          },
        },
      })
      const value = cookieValueGet(afterResponse)
      const opened = await flowV2CookieOpen(value, flowHandle, [key], now)
      expect(opened.success).toBe(true)
      if (!opened.success || opened.data.stage !== "mfa") continue
      expect(opened.data.webAuthnCheckMethod).toBe("u2f")
      expect(opened.data.options).toBeUndefined()

      const replay = await afterApp.request(await verifyRequest("u2f", `${cookieName}=${value}`), undefined, bindings)
      expect(replay.status).toBe(409)
      expect(after.calls.filter((call) => call.url.endsWith("/u2f/registration-secret-id"))).toHaveLength(1)
    }
  })

  test("existing assertion verification consumes check-after, re-evaluates policy, and retains the newest token", async () => {
    const native = nativeCreate("passkey")
    const app = workerAppCreate({
      fetch: native.fetch,
      now: () => now,
      randomBytes: (length) => new Uint8Array(length).fill(7),
      logger: { warn: () => {}, error: () => {} },
    })
    const enrolled = await app.request(
      await verifyRequest("passkey", await cookieCreate(setupStateCreate("passkey"))),
      undefined,
      bindings,
    )
    const checkCookie = `${cookieName}=${cookieValueGet(enrolled)}`
    const authenticatorData = new Uint8Array(37)
    authenticatorData[32] = 0x05
    const assertion = {
      id: "credential-id",
      rawId: "credential-id",
      type: "public-key",
      response: {
        clientDataJSON: textEncode(JSON.stringify({ type: "webauthn.get", challenge: assertionChallenge, origin })),
        authenticatorData: base64UrlEncode(authenticatorData),
        signature: "signature",
        userHandle: textEncode("user-secret-id"),
      },
    }
    const checked = await app.request(
      new Request(`${origin}/api/v2/mfa/u2f/verify?flow=${flowHandle}`, {
        method: "POST",
        headers: { origin, "content-type": "application/json", cookie: checkCookie },
        body: JSON.stringify({ method: "passkey", credential: assertion, csrfToken }),
      }),
      undefined,
      bindings,
    )

    expect(checked.status).toBe(200)
    expect(await checked.clone().json()).toEqual({
      success: true,
      data: { kind: "complete", path: `/api/v2/flow/continue?flow=${flowHandle}` },
    })
    const opened = await flowV2CookieOpen(cookieValueGet(checked), flowHandle, [key], now)
    expect(opened.success).toBe(true)
    if (!opened.success || opened.data.stage !== "verified") return
    expect(opened.data.sessionToken).toBe("reauthorized-secret-token-5")
    expect("webAuthnCheckMethod" in opened.data).toBe(false)
    expect(native.calls.filter((call) => call.method === "POST")).toHaveLength(1)
    expect(native.calls.some((call) => JSON.stringify(call.body ?? {}).includes("attestationObject"))).toBe(true)
    expect(native.calls.some((call) => JSON.stringify(call.body ?? {}).includes("credentialAssertionData"))).toBe(true)
  })
})
