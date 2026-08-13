import { describe, expect, test } from "bun:test"

import type { WorkerBindings } from "../src/config/workerBindingsSchema"
import type { FlowV2Cookie } from "../src/flow/model/flowV2CookieSchema"
import { mfaV2WebAuthnEnrollmentVerify } from "../src/mfa/domain/mfaV2WebAuthnEnrollmentVerify"
import { zitadelClientCreate } from "../src/zitadel/zitadelClientCreate"

const identityOrigin = "https://identity.example"
const origin = "https://login.example"
const now = 1_800_000_000
const state: Extract<FlowV2Cookie, { stage: "mfa_webauthn_setup" }> = {
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
  transitionCounter: 3,
  stage: "mfa_webauthn_setup",
  delegable: false,
  userId: "user-1",
  sessionId: "session-1",
  sessionToken: "initial-token",
  mfaMethods: [],
  registrationMethod: "u2f",
  registrationId: "registration-1",
  registrationChallenge: "registration-challenge",
  registrationRpId: "login.example",
  registrationOrigin: origin,
  registrationStartedAt: now,
  registrationExpiresAt: now + 300,
}
const bindings = {
  ZITADEL_ORIGIN: identityOrigin,
  ZITADEL_ORGANIZATION_ID: "org-1",
  ZITADEL_ALLOWED_CLIENT_IDS: ["client-1"],
  LOGIN_V2_FALLBACK_URL: `${identityOrigin}/ui/v2/login`,
  PAGES_ORIGIN: origin,
  SESSION_LIFETIME_SECONDS: 900,
  ZITADEL_LOGIN_CLIENT_PAT: "test-pat-not-a-real-secret-value",
  FLOW_COOKIE_KEY: "A".repeat(43),
  FLOW_COOKIE_PREVIOUS_KEY: undefined,
  RECENT_ACCOUNT_COOKIE_KEY: undefined,
  RECENT_ACCOUNT_COOKIE_PREVIOUS_KEY: undefined,
  ZITADEL_RECENT_ACCOUNT_V2_ENABLED: false,
  RATE_LIMITER: { limit: async () => ({ success: true }) },
} satisfies WorkerBindings

function base64UrlEncode(bytes: Uint8Array): string {
  let binary = ""
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", "")
}

function cborLengthEncode(major: number, length: number): number[] {
  if (length < 24) return [(major << 5) | length]
  return [(major << 5) | 24, length]
}

async function credentialCreate() {
  const credentialId = new TextEncoder().encode("credential-id")
  const authData = new Uint8Array(55 + credentialId.length + 1)
  authData.set(new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode("login.example"))))
  authData[32] = 0x41
  authData[54] = credentialId.length
  authData.set(credentialId, 55)
  authData[55 + credentialId.length] = 0xa0
  const key = new TextEncoder().encode("authData")
  const attestation = new Uint8Array([
    0xa1,
    ...cborLengthEncode(3, key.length),
    ...key,
    ...cborLengthEncode(2, authData.length),
    ...authData,
  ])
  const id = base64UrlEncode(credentialId)
  return {
    id,
    rawId: id,
    type: "public-key" as const,
    response: {
      attestationObject: base64UrlEncode(attestation),
      clientDataJSON: base64UrlEncode(
        new TextEncoder().encode(
          JSON.stringify({ type: "webauthn.create", challenge: "registration-challenge", origin }),
        ),
      ),
    },
  }
}

function nativeCreate(challengeStatus?: number) {
  const calls: Array<{ method: string; url: string }> = []
  let activated = false
  const fetch = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const url = String(input)
    const method = init?.method ?? "GET"
    calls.push({ method, url })
    if (url.startsWith(`${identityOrigin}/v2/sessions/session-1?`) && method === "GET") {
      return Response.json({
        session: {
          id: "session-1",
          sessionToken: "reauthorized-token",
          expirationDate: "2027-01-15T08:15:00Z",
          factors: {
            user: { id: "user-1", organizationId: "org-1" },
            password: { verifiedAt: "2027-01-15T08:00:00Z" },
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
        authMethodTypes: [
          "AUTHENTICATION_METHOD_TYPE_PASSWORD",
          ...(activated ? ["AUTHENTICATION_METHOD_TYPE_U2F"] : []),
        ],
      })
    }
    if (url === `${identityOrigin}/v2/settings/login` && method === "GET") {
      return Response.json({
        settings: { forceMfa: true, secondFactors: ["SECOND_FACTOR_TYPE_U2F"], multiFactors: [] },
      })
    }
    if (url === `${identityOrigin}/v2/users/user-1/u2f/registration-1` && method === "POST") {
      activated = true
      return Response.json({})
    }
    if (url === `${identityOrigin}/v2/sessions/session-1` && method === "PATCH") {
      if (challengeStatus) return Response.json({}, { status: challengeStatus })
      return Response.json({
        sessionToken: "challenge-token",
        challenges: {
          webAuthN: {
            publicKeyCredentialRequestOptions: {
              publicKey: {
                challenge: "assertion-challenge",
                rpId: "login.example",
                userVerification: "discouraged",
              },
            },
          },
        },
      })
    }
    throw new Error(`Unexpected request: ${method} ${url}`)
  }
  return { client: zitadelClientCreate(bindings, fetch), calls }
}

describe("mfaV2WebAuthnEnrollmentVerify", () => {
  test("activates once and returns a sealed-compatible fresh Session assertion state", async () => {
    const native = nativeCreate()
    const result = await mfaV2WebAuthnEnrollmentVerify({
      state,
      method: "u2f",
      credential: await credentialCreate(),
      expectedRpId: "login.example",
      expectedOrigin: origin,
      now,
      client: native.client,
    })

    expect(result.success).toBe(true)
    if (!result.success) return
    expect(result.data.state).toMatchObject({
      stage: "mfa",
      transitionCounter: 4,
      sessionToken: "challenge-token",
      webAuthnCheckMethod: "u2f",
      options: { publicKey: { challenge: "assertion-challenge" } },
    })
    expect(native.calls.filter((call) => call.method === "POST")).toHaveLength(1)
    expect(native.calls.filter((call) => call.method === "PATCH")).toHaveLength(1)
  })

  test("consumes registration into recoverable enrolled-factor state after activation partial success", async () => {
    const native = nativeCreate(503)
    const result = await mfaV2WebAuthnEnrollmentVerify({
      state,
      method: "u2f",
      credential: await credentialCreate(),
      expectedRpId: "login.example",
      expectedOrigin: origin,
      now,
      client: native.client,
    })

    expect(result.success).toBe(true)
    if (!result.success) return
    expect(result.data.state).toMatchObject({
      stage: "mfa",
      transitionCounter: 4,
      webAuthnCheckMethod: "u2f",
      mfaMethods: ["AUTHENTICATION_METHOD_TYPE_U2F"],
    })
    expect(result.data.state.options).toBeUndefined()
    expect(native.calls.filter((call) => call.method === "POST")).toHaveLength(1)
  })
})
