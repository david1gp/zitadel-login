import { describe, expect, test } from "bun:test"

import type { FlowV2Cookie } from "../src/flow/model/flowV2CookieSchema"
import { mfaV2U2fVerify } from "../src/mfa/domain/mfaV2U2fVerify"
import { resultCreate } from "../src/result/resultCreate"
import type { zitadelClientCreate } from "../src/zitadel/zitadelClientCreate"

const challenge = "GAOHYz2jE69kJMYo6Laij8yWw9-dKKgbViNhfuy0StA"
const origin = "https://login.example"

const mfaStateWithChallenge: Extract<FlowV2Cookie, { stage: "mfa" }> = {
  version: 2,
  flowHandle: "AAAAAAAAAAAAAAAAAAAAAA",
  requestKind: "oidc",
  authRequestId: "request-1",
  clientId: "client-1",
  redirectUri: "https://client.example/callback",
  organizationId: "org-1",
  prompt: ["PROMPT_LOGIN"],
  csrfToken: "B".repeat(43),
  issuedAt: 1_800_000_000,
  expiresAt: 1_800_000_900,
  transitionCounter: 2,
  stage: "mfa",
  delegable: false,
  userId: "user-1",
  sessionId: "session-1",
  sessionToken: "secret-mfa-session-token",
  mfaMethods: ["u2f"],
  options: {
    publicKey: {
      challenge,
      rpId: "login.example",
      timeout: 300000,
      userVerification: "discouraged",
      allowCredentials: [
        {
          id: "ATmqBg-99qyOZk2zloPdJQyS2R7IkFT7v9Hoos_B_nM",
          type: "public-key",
        },
      ],
    },
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

function clientMockCreate(
  options: {
    userVerified?: boolean
    verifyError?: { status: number }
    sessionError?: { status: number }
    authMethods?: string[]
    postAuthMethods?: string[]
    secondFactors?: string[]
    multiFactors?: string[]
    factors?: Record<string, unknown>
  } = {},
) {
  const calls: string[] = []
  let passkeyVerified = false
  const client = {
    sessionGet: async () => {
      calls.push("sessionGet")
      if (options.sessionError) {
        return { success: false, op: "sessionGet", errorMessage: "rejected", rawData: options.sessionError }
      }
      return resultCreate({
        session: {
          id: "session-1",
          sessionToken: "updated-u2f-verify-token",
          expirationDate: "2027-08-11T13:00:00Z",
          factors: options.factors ?? {
            user: { id: "user-1", organizationId: "org-1" },
            password: { verifiedAt: "2026-08-11T12:00:00Z" },
            ...(passkeyVerified
              ? {
                  webAuthN: {
                    verifiedAt: "2026-08-11T12:05:00Z",
                    userVerified: options.userVerified ?? false,
                  },
                }
              : {}),
          },
        },
      })
    },
    userGet: async () => {
      calls.push("userGet")
      return resultCreate({
        user: {
          userId: "user-1",
          state: "USER_STATE_ACTIVE",
          details: { resourceOwner: "org-1" },
          human: { email: { email: "user@example.com", isVerified: true } },
        },
      })
    },
    authenticationMethodsGet: async () => {
      calls.push("authenticationMethodsGet")
      const methods =
        passkeyVerified && options.postAuthMethods
          ? options.postAuthMethods
          : (options.authMethods ?? ["AUTHENTICATION_METHOD_TYPE_PASSWORD", "AUTHENTICATION_METHOD_TYPE_U2F"])
      return resultCreate({
        authMethodTypes: methods,
      })
    },
    loginSettingsGet: async () => {
      calls.push("loginSettingsGet")
      return resultCreate({
        settings: {
          forceMfa: true,
          secondFactors: options.secondFactors ?? ["SECOND_FACTOR_TYPE_U2F"],
          multiFactors: options.multiFactors ?? [],
        },
      })
    },
    passkeySessionVerify: async (_sessionId: string, _sessionToken: string, _credential: unknown) => {
      calls.push("passkeySessionVerify")
      if (options.verifyError) {
        return { success: false, op: "passkeySessionVerify", errorMessage: "rejected", rawData: options.verifyError }
      }
      passkeyVerified = true
      return resultCreate({ sessionToken: "updated-u2f-verify-token" })
    },
  } as unknown as ReturnType<typeof zitadelClientCreate>
  return { client, calls }
}

describe("mfaV2U2fVerify domain", () => {
  test("successfully verifies U2F second-factor assertion and completes authorization", async () => {
    const mock = clientMockCreate({ userVerified: false })
    const result = await mfaV2U2fVerify({
      state: mfaStateWithChallenge,
      credential: validCredentialCreate(),
      expectedOrigin: origin,
      now: 1_800_000_000,
      client: mock.client,
    })

    expect(result.success).toBe(true)
    if (!result.success) return
    expect(result.data.state).toEqual({
      version: 2,
      flowHandle: "AAAAAAAAAAAAAAAAAAAAAA",
      requestKind: "oidc",
      authRequestId: "request-1",
      clientId: "client-1",
      redirectUri: "https://client.example/callback",
      organizationId: "org-1",
      prompt: ["PROMPT_LOGIN"],
      csrfToken: "B".repeat(43),
      issuedAt: 1_800_000_000,
      expiresAt: 1_800_000_900,
      transitionCounter: 3,
      stage: "verified",
      delegable: false,
      userId: "user-1",
      sessionId: "session-1",
      sessionToken: "updated-u2f-verify-token",
    })
    expect(result.data.transition).toEqual({
      kind: "complete",
      path: "/api/v2/flow/continue?flow=AAAAAAAAAAAAAAAAAAAAAA",
    })
  })

  test("successfully verifies verified-U2F passkey second-factor assertion with UV semantics", async () => {
    const mock = clientMockCreate({
      userVerified: true,
      secondFactors: [],
      multiFactors: ["MULTI_FACTOR_TYPE_U2F_WITH_VERIFICATION"],
    })

    const stateRequired: Extract<FlowV2Cookie, { stage: "mfa" }> = {
      ...mfaStateWithChallenge,
      mfaMethods: ["passkey"],
      options: {
        publicKey: {
          ...mfaStateWithChallenge.options!.publicKey,
          userVerification: "required",
        },
      },
    }

    const result = await mfaV2U2fVerify({
      state: stateRequired,
      credential: validCredentialCreate({ authenticatorData: authenticatorDataCreate(5) }),
      method: "passkey",
      expectedOrigin: origin,
      now: 1_800_000_000,
      client: mock.client,
    })

    expect(result.success).toBe(true)
    if (!result.success) return
    expect(result.data.state.stage).toBe("verified")
  })

  test("returns credentials_invalid when required user verification (UV) is missing", async () => {
    const mock = clientMockCreate({
      userVerified: false,
      secondFactors: [],
      multiFactors: ["MULTI_FACTOR_TYPE_U2F_WITH_VERIFICATION"],
    })

    const stateRequired: Extract<FlowV2Cookie, { stage: "mfa" }> = {
      ...mfaStateWithChallenge,
      mfaMethods: ["passkey"],
      options: {
        publicKey: {
          ...mfaStateWithChallenge.options!.publicKey,
          userVerification: "required",
        },
      },
    }

    // authenticatorData with UV bit = 0 (only UP = 1)
    const result = await mfaV2U2fVerify({
      state: stateRequired,
      credential: validCredentialCreate({ authenticatorData: authenticatorDataCreate(1) }),
      method: "passkey",
      expectedOrigin: origin,
      now: 1_800_000_000,
      client: mock.client,
    })

    expect(result.success).toBe(false)
    if (result.success) return
    expect(result.errorMessage).toBe("credentials_invalid")
  })

  test("rejects challenge, origin, and type mismatches with credentials_invalid", async () => {
    const mock = clientMockCreate()

    // type mismatch
    const resultType = await mfaV2U2fVerify({
      state: mfaStateWithChallenge,
      credential: validCredentialCreate({ clientDataJSON: clientDataCreate({ type: "webauthn.create" }) }),
      expectedOrigin: origin,
      now: 1_800_000_000,
      client: mock.client,
    })
    expect(resultType.success).toBe(false)
    if (!resultType.success) expect(resultType.errorMessage).toBe("credentials_invalid")

    // challenge mismatch
    const resultChallenge = await mfaV2U2fVerify({
      state: mfaStateWithChallenge,
      credential: validCredentialCreate({ clientDataJSON: clientDataCreate({ challenge: "wrong-challenge" }) }),
      expectedOrigin: origin,
      now: 1_800_000_000,
      client: mock.client,
    })
    expect(resultChallenge.success).toBe(false)
    if (!resultChallenge.success) expect(resultChallenge.errorMessage).toBe("credentials_invalid")

    // origin mismatch
    const resultOrigin = await mfaV2U2fVerify({
      state: mfaStateWithChallenge,
      credential: validCredentialCreate({ clientDataJSON: clientDataCreate({ origin: "https://attacker.example" }) }),
      expectedOrigin: origin,
      now: 1_800_000_000,
      client: mock.client,
    })
    expect(resultOrigin.success).toBe(false)
    if (!resultOrigin.success) expect(resultOrigin.errorMessage).toBe("credentials_invalid")
  })

  test("rejects malformed assertion payloads with credentials_invalid", async () => {
    const mock = clientMockCreate()

    // invalid clientDataJSON
    const resultClientData = await mfaV2U2fVerify({
      state: mfaStateWithChallenge,
      credential: validCredentialCreate({ clientDataJSON: "invalid-base64-json!!!" }),
      expectedOrigin: origin,
      now: 1_800_000_000,
      client: mock.client,
    })
    expect(resultClientData.success).toBe(false)
    if (!resultClientData.success) expect(resultClientData.errorMessage).toBe("credentials_invalid")

    // short authenticatorData (< 37 bytes)
    const resultShortAuth = await mfaV2U2fVerify({
      state: mfaStateWithChallenge,
      credential: validCredentialCreate({ authenticatorData: base64UrlEncodeText("short") }),
      expectedOrigin: origin,
      now: 1_800_000_000,
      client: mock.client,
    })
    expect(resultShortAuth.success).toBe(false)
    if (!resultShortAuth.success) expect(resultShortAuth.errorMessage).toBe("credentials_invalid")
  })

  test("rejects verify-before-challenge with challenge_unavailable error", async () => {
    const mock = clientMockCreate()

    const stateNoChallenge: Extract<FlowV2Cookie, { stage: "mfa" }> = {
      ...mfaStateWithChallenge,
      options: undefined,
    }

    const result = await mfaV2U2fVerify({
      state: stateNoChallenge,
      credential: validCredentialCreate(),
      expectedOrigin: origin,
      now: 1_800_000_000,
      client: mock.client,
    })

    expect(result.success).toBe(false)
    if (result.success) return
    expect(result.errorMessage).toBe("challenge_unavailable")
  })

  test("rejects verification when U2F is not enrolled or factor reuse is attempted", async () => {
    const mockNotEnrolled = clientMockCreate({ authMethods: ["AUTHENTICATION_METHOD_TYPE_PASSWORD"] })

    const result = await mfaV2U2fVerify({
      state: mfaStateWithChallenge,
      credential: validCredentialCreate(),
      expectedOrigin: origin,
      now: 1_800_000_000,
      client: mockNotEnrolled.client,
    })

    expect(result.success).toBe(false)
    if (result.success) return
    expect(result.errorMessage).toBe("method_not_enrolled")
  })

  test("returns session_stale when ZITADEL sessionGet returns 401/404 or expired session", async () => {
    const mockStale = clientMockCreate({ sessionError: { status: 401 } })

    const result = await mfaV2U2fVerify({
      state: mfaStateWithChallenge,
      credential: validCredentialCreate(),
      expectedOrigin: origin,
      now: 1_800_000_000,
      client: mockStale.client,
    })

    expect(result.success).toBe(false)
    if (result.success) return
    expect(result.errorMessage).toBe("session_stale")
  })

  test("returns fallback transition when post-verification policy requires fallback", async () => {
    const mockFallback = clientMockCreate({
      userVerified: false,
      authMethods: ["AUTHENTICATION_METHOD_TYPE_PASSWORD", "AUTHENTICATION_METHOD_TYPE_U2F"],
      postAuthMethods: [
        "AUTHENTICATION_METHOD_TYPE_PASSWORD",
        "AUTHENTICATION_METHOD_TYPE_U2F",
        "AUTHENTICATION_METHOD_TYPE_RECOVERY_CODE",
      ],
    })

    const result = await mfaV2U2fVerify({
      state: mfaStateWithChallenge,
      credential: validCredentialCreate(),
      expectedOrigin: origin,
      now: 1_800_000_000,
      client: mockFallback.client,
    })

    expect(result.success).toBe(true)
    if (!result.success) return
    expect(result.data.transition).toEqual({
      kind: "fallback",
      path: "/api/v2/flow/fallback?flow=AAAAAAAAAAAAAAAAAAAAAA",
    })
  })
})
