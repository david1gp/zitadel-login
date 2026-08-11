import { describe, expect, test } from "bun:test"

import type { FlowV2Cookie } from "../src/flow/model/flowV2CookieSchema"
import { mfaV2U2fChallenge } from "../src/mfa/domain/mfaV2U2fChallenge"
import { resultCreate } from "../src/result/resultCreate"
import type { zitadelClientCreate } from "../src/zitadel/zitadelClientCreate"

const mfaState: Extract<FlowV2Cookie, { stage: "mfa" }> = {
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
}

const mockDiscouragedOptions = {
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

const mockRequiredOptions = {
  publicKey: {
    ...mockDiscouragedOptions.publicKey,
    userVerification: "required" as const,
  },
}

function clientCreate(
  options: {
    secondFactors?: string[]
    multiFactors?: string[]
    authMethods?: string[]
    factors?: Record<string, unknown>
    u2fError?: { status: number }
    invalidOptions?: boolean
  } = {},
) {
  const calls: Array<{ method: string; domain?: string; requirement?: string }> = []
  const client = {
    sessionGet: async () =>
      resultCreate({
        session: {
          id: "session-1",
          sessionToken: "secret-mfa-session-token",
          expirationDate: "2027-08-11T13:00:00Z",
          factors: options.factors ?? {
            user: { id: "user-1", organizationId: "org-1" },
            password: { verifiedAt: "2026-08-11T12:00:00Z" },
          },
        },
      }),
    userGet: async () =>
      resultCreate({
        user: {
          userId: "user-1",
          state: "USER_STATE_ACTIVE",
          details: { resourceOwner: "org-1" },
          human: { email: { email: "user@example.com", isVerified: true } },
        },
      }),
    authenticationMethodsGet: async () =>
      resultCreate({
        authMethodTypes: options.authMethods ?? [
          "AUTHENTICATION_METHOD_TYPE_PASSWORD",
          "AUTHENTICATION_METHOD_TYPE_U2F",
        ],
      }),
    loginSettingsGet: async () =>
      resultCreate({
        settings: {
          forceMfa: true,
          secondFactors: options.secondFactors ?? ["SECOND_FACTOR_TYPE_U2F"],
          multiFactors: options.multiFactors ?? [],
        },
      }),
    u2fSessionChallenge: async (
      _sessionId: string,
      _sessionToken: string,
      domain: string,
      userVerificationRequirement: string,
    ) => {
      calls.push({ method: "u2fSessionChallenge", domain, requirement: userVerificationRequirement })
      if (options.u2fError) {
        return { success: false, op: "u2fSessionChallenge", errorMessage: "rejected", rawData: options.u2fError }
      }
      const rawOptions = options.invalidOptions
        ? { invalid: true }
        : userVerificationRequirement === "USER_VERIFICATION_REQUIREMENT_REQUIRED"
          ? mockRequiredOptions
          : mockDiscouragedOptions
      return resultCreate({
        sessionToken: "updated-mfa-u2f-token",
        challenges: {
          webAuthN: {
            publicKeyCredentialRequestOptions: rawOptions,
          },
        },
      })
    },
  } as unknown as ReturnType<typeof zitadelClientCreate>
  return { client, calls }
}

describe("mfaV2U2fChallenge domain", () => {
  test("creates U2F challenge with discouraged user verification semantics for standard U2F MFA", async () => {
    const native = clientCreate()
    const result = await mfaV2U2fChallenge({
      state: mfaState,
      rpId: "login.example",
      now: 1_800_000_000,
      client: native.client,
    })

    expect(result.success).toBe(true)
    if (!result.success) return
    expect(native.calls).toEqual([
      {
        method: "u2fSessionChallenge",
        domain: "login.example",
        requirement: "USER_VERIFICATION_REQUIREMENT_DISCOURAGED",
      },
    ])
    expect(result.data.state.sessionToken).toBe("updated-mfa-u2f-token")
    expect(result.data.state.options).toEqual(mockDiscouragedOptions)
    expect(result.data.transition).toEqual({
      kind: "render",
      route: "/login/mfa?flow=AAAAAAAAAAAAAAAAAAAAAA",
      screen: {
        name: "mfa",
        factors: ["u2f"],
        options: mockDiscouragedOptions,
      },
      csrfToken: "B".repeat(43),
    })
  })

  test("creates verified-U2F challenge with required user verification semantics for passkey MFA", async () => {
    const native = clientCreate({
      secondFactors: [],
      multiFactors: ["MULTI_FACTOR_TYPE_U2F_WITH_VERIFICATION"],
    })
    const result = await mfaV2U2fChallenge({
      state: { ...mfaState, mfaMethods: ["passkey"] },
      method: "passkey",
      rpId: "login.example",
      now: 1_800_000_000,
      client: native.client,
    })

    expect(result.success).toBe(true)
    if (!result.success) return
    expect(native.calls).toEqual([
      {
        method: "u2fSessionChallenge",
        domain: "login.example",
        requirement: "USER_VERIFICATION_REQUIREMENT_REQUIRED",
      },
    ])
    expect(result.data.state.options).toEqual(mockRequiredOptions)
  })

  test("returns method_not_enrolled when U2F is not enrolled for user or policy", async () => {
    const native = clientCreate({ authMethods: ["AUTHENTICATION_METHOD_TYPE_PASSWORD"] })
    const result = await mfaV2U2fChallenge({
      state: mfaState,
      rpId: "login.example",
      now: 1_800_000_000,
      client: native.client,
    })

    expect(result.success).toBe(false)
    if (result.success) return
    expect(result.errorMessage).toBe("method_not_enrolled")
  })

  test("prevents factor reuse when WebAuthn was already verified as primary factor", async () => {
    const native = clientCreate({
      factors: {
        user: { id: "user-1", organizationId: "org-1" },
        webAuthN: { verifiedAt: "2026-08-11T12:00:00Z", userVerified: true },
      },
    })
    const result = await mfaV2U2fChallenge({
      state: mfaState,
      rpId: "login.example",
      now: 1_800_000_000,
      client: native.client,
    })

    expect(result.success).toBe(false)
    if (result.success) return
    expect(result.errorMessage).toBe("method_not_enrolled")
  })

  test("returns challenge_unavailable when ZITADEL options payload is malformed", async () => {
    const native = clientCreate({ invalidOptions: true })
    const result = await mfaV2U2fChallenge({
      state: mfaState,
      rpId: "login.example",
      now: 1_800_000_000,
      client: native.client,
    })

    expect(result.success).toBe(false)
    if (result.success) return
    expect(result.errorMessage).toBe("challenge_unavailable")
  })
})
