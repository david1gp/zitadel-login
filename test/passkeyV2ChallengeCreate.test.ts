import { describe, expect, test } from "bun:test"
import type { FlowV2Cookie } from "../src/flow/model/flowV2CookieSchema"
import { passkeyV2ChallengeCreate } from "../src/passkey/domain/passkeyV2ChallengeCreate"
import { resultCreate } from "../src/result/resultCreate"
import type { zitadelClientCreate } from "../src/zitadel/zitadelClientCreate"

const readyState: Extract<FlowV2Cookie, { stage: "ready" }> = {
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
  transitionCounter: 0,
  stage: "ready",
  delegable: true,
  owned: true,
}

const mockPublicKeyOptions = {
  publicKey: {
    challenge: "GAOHYz2jE69kJMYo6Laij8yWw9-dKKgbViNhfuy0StA",
    rpId: "client.example",
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

function clientCreate(
  options: {
    methods?: string[]
    allowLocalAuth?: boolean
    ignoreUnknownUsernames?: boolean
    passkeyError?: { status: number }
    invalidOptions?: boolean
  } = {},
) {
  const calls: Array<{ method: string; domain?: string }> = []
  const client = {
    loginSettingsGet: async () =>
      resultCreate({
        settings: {
          allowLocalAuthentication: options.allowLocalAuth ?? true,
          ignoreUnknownUsernames: options.ignoreUnknownUsernames ?? false,
        },
      }),
    usersByIdentifierList: async () =>
      resultCreate({
        result: [
          {
            userId: "user-1",
            state: "USER_STATE_ACTIVE",
            details: { resourceOwner: "org-1" },
            human: { email: { email: "user@example.com", isVerified: true } },
          },
        ],
      }),
    authenticationMethodsGet: async () =>
      resultCreate({ authMethodTypes: options.methods ?? ["AUTHENTICATION_METHOD_TYPE_PASSKEY"] }),
    passkeySessionCreate: async (_userId: string, domain: string) => {
      calls.push({ method: "passkeySessionCreate", domain })
      if (options.passkeyError) {
        return { success: false, op: "passkeySessionCreate", errorMessage: "rejected", rawData: options.passkeyError }
      }
      return resultCreate({
        sessionId: "session-1",
        sessionToken: "passkey-token-1",
        challenges: {
          webAuthN: {
            publicKeyCredentialRequestOptions: options.invalidOptions ? { invalid: true } : mockPublicKeyOptions,
          },
        },
      })
    },
    passkeySessionChallenge: async (_sessionId: string, _sessionToken: string, domain: string) => {
      calls.push({ method: "passkeySessionChallenge", domain })
      return resultCreate({
        sessionToken: "updated-passkey-token",
        challenges: {
          webAuthN: {
            publicKeyCredentialRequestOptions: mockPublicKeyOptions,
          },
        },
      })
    },
  } as unknown as ReturnType<typeof zitadelClientCreate>
  return { client, calls }
}

describe("passkeyV2ChallengeCreate domain", () => {
  test("creates native WebAuthn passkey challenge for valid user and active flow", async () => {
    const native = clientCreate()
    const result = await passkeyV2ChallengeCreate({
      state: readyState,
      identifier: "user@example.com",
      rpId: "client.example",
      now: 1_800_000_000,
      client: native.client,
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
      transitionCounter: 1,
      stage: "passkey",
      delegable: false,
      userId: "user-1",
      sessionId: "session-1",
      sessionToken: "passkey-token-1",
      options: mockPublicKeyOptions,
    })
    expect(result.data.transition).toEqual({
      kind: "render",
      route: "/login/passkey?flow=AAAAAAAAAAAAAAAAAAAAAA",
      screen: {
        name: "passkey",
        options: mockPublicKeyOptions,
      },
      csrfToken: "B".repeat(43),
    })
    expect(native.calls).toEqual([{ method: "passkeySessionCreate", domain: "client.example" }])
  })

  test("re-challenges existing session when flow already has sessionId/sessionToken", async () => {
    const passkeyState: Extract<FlowV2Cookie, { stage: "passkey" }> = {
      ...readyState,
      stage: "passkey",
      delegable: false,
      userId: "user-1",
      sessionId: "session-1",
      sessionToken: "existing-token",
      options: mockPublicKeyOptions,
    }
    const native = clientCreate()
    const result = await passkeyV2ChallengeCreate({
      state: passkeyState,
      identifier: "user@example.com",
      rpId: "client.example",
      now: 1_800_000_000,
      client: native.client,
    })

    expect(result.success).toBe(true)
    if (!result.success) return
    expect(result.data.state.sessionToken).toBe("updated-passkey-token")
    expect(native.calls).toEqual([{ method: "passkeySessionChallenge", domain: "client.example" }])
  })

  test("returns fallback when local authentication is disabled", async () => {
    const native = clientCreate({ allowLocalAuth: false })
    const result = await passkeyV2ChallengeCreate({
      state: readyState,
      identifier: "user@example.com",
      rpId: "client.example",
      now: 1_800_000_000,
      client: native.client,
    })

    expect(result).toEqual({
      success: true,
      data: {
        state: readyState,
        transition: { kind: "fallback", path: "/api/v2/flow/fallback?flow=AAAAAAAAAAAAAAAAAAAAAA" },
      },
    })
  })

  test("returns fallback when user lacks passkey authentication method", async () => {
    const native = clientCreate({ methods: ["AUTHENTICATION_METHOD_TYPE_PASSWORD"] })
    const result = await passkeyV2ChallengeCreate({
      state: readyState,
      identifier: "user@example.com",
      rpId: "client.example",
      now: 1_800_000_000,
      client: native.client,
    })

    expect(result).toEqual({
      success: true,
      data: {
        state: readyState,
        transition: { kind: "fallback", path: "/api/v2/flow/fallback?flow=AAAAAAAAAAAAAAAAAAAAAA" },
      },
    })
  })

  test("returns fallback before creating a challenge when MFA continuation is not owned", async () => {
    const native = clientCreate({
      methods: ["AUTHENTICATION_METHOD_TYPE_PASSKEY", "AUTHENTICATION_METHOD_TYPE_TOTP"],
    })
    const result = await passkeyV2ChallengeCreate({
      state: readyState,
      identifier: "user@example.com",
      rpId: "client.example",
      now: 1_800_000_000,
      client: native.client,
    })

    expect(result).toEqual({
      success: true,
      data: {
        state: expect.objectContaining({ stage: "passkey", sessionId: "session-1" }),
        transition: expect.objectContaining({ kind: "render", route: "/login/passkey?flow=AAAAAAAAAAAAAAAAAAAAAA" }),
      },
    })
    expect(native.calls).toEqual([{ method: "passkeySessionCreate", domain: "client.example" }])
  })

  test("returns fallback before creating a challenge for an unsupported live MFA policy", async () => {
    const native = clientCreate()
    native.client.loginSettingsGet = async () =>
      resultCreate({ settings: { allowLocalAuthentication: true, secondFactors: ["SECOND_FACTOR_TYPE_UNKNOWN"] } })
    const result = await passkeyV2ChallengeCreate({
      state: readyState,
      identifier: "user@example.com",
      rpId: "client.example",
      now: 1_800_000_000,
      client: native.client,
    })

    expect(result).toEqual({
      success: true,
      data: {
        state: readyState,
        transition: { kind: "fallback", path: "/api/v2/flow/fallback?flow=AAAAAAAAAAAAAAAAAAAAAA" },
      },
    })
    expect(native.calls).toEqual([])
  })

  test("returns fallback on ZITADEL 4xx session creation rejection", async () => {
    const native = clientCreate({ passkeyError: { status: 400 } })
    const result = await passkeyV2ChallengeCreate({
      state: readyState,
      identifier: "user@example.com",
      rpId: "client.example",
      now: 1_800_000_000,
      client: native.client,
    })

    expect(result).toEqual({
      success: true,
      data: {
        state: readyState,
        transition: { kind: "fallback", path: "/api/v2/flow/fallback?flow=AAAAAAAAAAAAAAAAAAAAAA" },
      },
    })
  })

  test("returns error when WebAuthn options fail validation", async () => {
    const native = clientCreate({ invalidOptions: true })
    const result = await passkeyV2ChallengeCreate({
      state: readyState,
      identifier: "user@example.com",
      rpId: "client.example",
      now: 1_800_000_000,
      client: native.client,
    })

    expect(result.success).toBe(false)
    if (result.success) return
    expect(result.errorMessage).toBe("challenge_unavailable")
  })
})
