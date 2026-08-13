import { describe, expect, test } from "bun:test"
import type { FlowV2Cookie } from "../src/flow/model/flowV2CookieSchema"
import { passkeyV2Verify } from "../src/passkey/domain/passkeyV2Verify"
import { resultCreate } from "../src/result/resultCreate"
import type { zitadelClientCreate } from "../src/zitadel/zitadelClientCreate"

const challenge = "GAOHYz2jE69kJMYo6Laij8yWw9-dKKgbViNhfuy0StA"
const origin = "https://login.example"

const passkeyState: Extract<FlowV2Cookie, { stage: "passkey" }> = {
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
  options: {
    publicKey: {
      challenge,
      rpId: "login.example",
      timeout: 300000,
      userVerification: "required",
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

function clientMockCreate(
  options: {
    userVerified?: boolean
    verifyError?: { status: number }
    mfaMethods?: string[]
    forceMfa?: boolean
    secondFactors?: string[]
  } = {},
) {
  const calls: string[] = []
  const client = {
    passkeySessionVerify: async (_sessionId: string, _sessionToken: string, _credential: unknown) => {
      calls.push("passkeySessionVerify")
      if (options.verifyError) {
        return {
          success: false,
          op: "passkeySessionVerify",
          errorMessage: "rejected",
          rawData: options.verifyError,
        }
      }
      return resultCreate({ sessionToken: "updated-passkey-token" })
    },
    sessionGet: async (_sessionId: string, _sessionToken: string) => {
      calls.push("sessionGet")
      return resultCreate({
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
    },
    authenticationMethodsGet: async (_userId: string) => {
      calls.push("authenticationMethodsGet")
      return resultCreate({
        authMethodTypes: options.mfaMethods ?? ["AUTHENTICATION_METHOD_TYPE_PASSKEY"],
      })
    },
    loginSettingsGet: async (_organizationId: string) => {
      calls.push("loginSettingsGet")
      return resultCreate({
        settings: {
          allowLocalAuthentication: true,
          forceMfa: options.forceMfa ?? false,
          secondFactors: options.secondFactors,
        },
      })
    },
  } as unknown as ReturnType<typeof zitadelClientCreate>
  return { client, calls }
}

describe("passkeyV2Verify domain", () => {
  test("successfully verifies passkey assertion and returns verified completion transition", async () => {
    const mock = clientMockCreate({ userVerified: true })
    const result = await passkeyV2Verify({
      state: passkeyState,
      credential: validCredentialCreate(),
      expectedOrigin: origin,
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
      transitionCounter: 2,
      stage: "verified",
      delegable: false,
      userId: "user-1",
      sessionId: "session-1",
      sessionToken: "updated-passkey-token",
    })
    expect(result.data.transition).toEqual({
      kind: "complete",
      path: "/api/v2/flow/continue?flow=AAAAAAAAAAAAAAAAAAAAAA",
    })
    expect(mock.calls).toEqual(["passkeySessionVerify", "sessionGet", "authenticationMethodsGet", "loginSettingsGet"])
  })

  test("rejects malformed/non-JSON clientDataJSON with invalid_payload error", async () => {
    const mock = clientMockCreate()
    const result = await passkeyV2Verify({
      state: passkeyState,
      credential: validCredentialCreate({ clientDataJSON: "invalid-base64-content!!!" }),
      expectedOrigin: origin,
      client: mock.client,
    })

    expect(result.success).toBe(false)
    if (result.success) return
    expect(result.errorMessage).toBe("invalid_payload")
  })

  test("rejects type mismatch in clientDataJSON with credentials_invalid error", async () => {
    const mock = clientMockCreate()
    const result = await passkeyV2Verify({
      state: passkeyState,
      credential: validCredentialCreate({ clientDataJSON: clientDataCreate({ type: "webauthn.create" }) }),
      expectedOrigin: origin,
      client: mock.client,
    })

    expect(result.success).toBe(false)
    if (result.success) return
    expect(result.errorMessage).toBe("credentials_invalid")
  })

  test("rejects challenge mismatch in clientDataJSON with credentials_invalid error", async () => {
    const mock = clientMockCreate()
    const result = await passkeyV2Verify({
      state: passkeyState,
      credential: validCredentialCreate({ clientDataJSON: clientDataCreate({ challenge: "wrong-challenge-value" }) }),
      expectedOrigin: origin,
      client: mock.client,
    })

    expect(result.success).toBe(false)
    if (result.success) return
    expect(result.errorMessage).toBe("credentials_invalid")
  })

  test("rejects origin mismatch in clientDataJSON with credentials_invalid error", async () => {
    const mock = clientMockCreate()
    const result = await passkeyV2Verify({
      state: passkeyState,
      credential: validCredentialCreate({ clientDataJSON: clientDataCreate({ origin: "https://attacker.example" }) }),
      expectedOrigin: origin,
      client: mock.client,
    })

    expect(result.success).toBe(false)
    if (result.success) return
    expect(result.errorMessage).toBe("credentials_invalid")
  })

  test("handles user-handle variants (null, raw match, base64url match, mismatch)", async () => {
    const mock = clientMockCreate({ userVerified: true })

    // null / omitted -> success
    const resultNull = await passkeyV2Verify({
      state: passkeyState,
      credential: validCredentialCreate({ userHandle: null }),
      expectedOrigin: origin,
      client: mock.client,
    })
    expect(resultNull.success).toBe(true)

    // raw string match -> success
    const resultRaw = await passkeyV2Verify({
      state: passkeyState,
      credential: validCredentialCreate({ userHandle: "user-1" }),
      expectedOrigin: origin,
      client: mock.client,
    })
    expect(resultRaw.success).toBe(true)

    // base64url encoded match ("dXNlci0x") -> success
    const resultB64 = await passkeyV2Verify({
      state: passkeyState,
      credential: validCredentialCreate({ userHandle: base64UrlEncodeText("user-1") }),
      expectedOrigin: origin,
      client: mock.client,
    })
    expect(resultB64.success).toBe(true)

    // mismatch -> credentials_invalid
    const resultMismatch = await passkeyV2Verify({
      state: passkeyState,
      credential: validCredentialCreate({ userHandle: "user-999" }),
      expectedOrigin: origin,
      client: mock.client,
    })
    expect(resultMismatch.success).toBe(false)
    if (!resultMismatch.success) {
      expect(resultMismatch.errorMessage).toBe("credentials_invalid")
    }
  })

  test("returns credentials_invalid on 4xx upstream assertion failure", async () => {
    const mock = clientMockCreate({ verifyError: { status: 400 } })
    const result = await passkeyV2Verify({
      state: passkeyState,
      credential: validCredentialCreate(),
      expectedOrigin: origin,
      client: mock.client,
    })

    expect(result.success).toBe(false)
    if (result.success) return
    expect(result.errorMessage).toBe("credentials_invalid")
  })

  test("routes to MFA transition without completing session when userVerified is false and MFA enrolled", async () => {
    const mock = clientMockCreate({
      userVerified: false,
      mfaMethods: ["AUTHENTICATION_METHOD_TYPE_PASSKEY", "AUTHENTICATION_METHOD_TYPE_TOTP"],
      secondFactors: ["SECOND_FACTOR_TYPE_OTP"],
    })
    const result = await passkeyV2Verify({
      state: passkeyState,
      credential: validCredentialCreate(),
      expectedOrigin: origin,
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
      transitionCounter: 2,
      stage: "mfa",
      delegable: false,
      userId: "user-1",
      sessionId: "session-1",
      sessionToken: "updated-passkey-token",
      mfaMethods: ["AUTHENTICATION_METHOD_TYPE_TOTP"],
    })
    expect(result.data.transition).toEqual({
      kind: "render",
      route: "/login/mfa?flow=AAAAAAAAAAAAAAAAAAAAAA",
      screen: {
        name: "mfa",
        factors: ["AUTHENTICATION_METHOD_TYPE_TOTP"],
      },
      csrfToken: "B".repeat(43),
    })
  })

  test("returns passkey_unavailable on 5xx upstream ZITADEL error", async () => {
    const mock = clientMockCreate({ verifyError: { status: 500 } })
    const result = await passkeyV2Verify({
      state: passkeyState,
      credential: validCredentialCreate(),
      expectedOrigin: origin,
      client: mock.client,
    })

    expect(result.success).toBe(false)
    if (result.success) return
    expect(result.errorMessage).toBe("passkey_unavailable")
  })
})
