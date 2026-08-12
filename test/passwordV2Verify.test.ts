import { describe, expect, test } from "bun:test"
import type { FlowV2Cookie } from "../src/flow/model/flowV2CookieSchema"
import { passwordV2Verify } from "../src/password/domain/passwordV2Verify"
import { resultCreate } from "../src/result/resultCreate"
import { zitadelClientCreate } from "../src/zitadel/zitadelClientCreate"

const state: Extract<FlowV2Cookie, { stage: "ready" }> = {
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

function clientCreate(
  options: {
    methods?: string[]
    forceMfa?: boolean
    listedPasswordChangeRequired?: boolean
    listedPasswordChanged?: string
    passwordChangeRequired?: boolean
    passwordChanged?: string
    maxAgeDays?: number
    sessionToken?: string
  } = {},
) {
  const calls: Array<{ method: string; password?: string }> = []
  const user = {
    userId: "user-1",
    state: "USER_STATE_ACTIVE",
    details: { resourceOwner: "org-1" },
    human: {
      email: { email: "person@example.com", isVerified: true },
      passwordChangeRequired: options.passwordChangeRequired ?? false,
      passwordChanged: options.passwordChanged ?? "2027-01-01T00:00:00Z",
    },
  }
  const listedUser = {
    ...user,
    human: {
      ...user.human,
      passwordChangeRequired: options.listedPasswordChangeRequired ?? user.human.passwordChangeRequired,
      passwordChanged: options.listedPasswordChanged ?? user.human.passwordChanged,
    },
  }
  const client = {
    loginSettingsGet: async () =>
      resultCreate({ settings: { allowLocalAuthentication: true, forceMfa: options.forceMfa } }),
    usersByIdentifierList: async () =>
      resultCreate({
        result: [listedUser],
      }),
    userGet: async () => {
      calls.push({ method: "userGet" })
      return resultCreate({ user })
    },
    authenticationMethodsGet: async () =>
      resultCreate({ authMethodTypes: options.methods ?? ["AUTHENTICATION_METHOD_TYPE_PASSWORD"] }),
    passwordExpirySettingsGet: async () => resultCreate({ settings: { maxAgeDays: options.maxAgeDays ?? 90 } }),
    passwordSessionCreate: async (_userId: string, password: string) => {
      calls.push({ method: "passwordSessionCreate", password })
      return resultCreate({ sessionId: "session-1", sessionToken: "latest-token" })
    },
    sessionGet: async () => {
      calls.push({ method: "sessionGet" })
      return resultCreate({
        session: {
          id: "session-1",
          ...(options.sessionToken ? { sessionToken: options.sessionToken } : {}),
          factors: {
            user: { id: "user-1", organizationId: "org-1" },
            password: { verifiedAt: "2026-08-11T00:00:00Z" },
          },
        },
      })
    },
  } as unknown as ReturnType<typeof zitadelClientCreate>
  return { client, calls }
}

describe("passwordV2Verify domain", () => {
  test("returns authorization-ready only after native password verification", async () => {
    const native = clientCreate()
    const result = await passwordV2Verify({
      state,
      identifier: "person@example.com",
      password: "correct-password",
      mfaV2Enabled: false,
      now: 1_800_000_000,
      client: native.client,
    })
    expect(result).toEqual({
      success: true,
      data: {
        state: expect.objectContaining({ stage: "verified", sessionToken: "latest-token" }),
        transition: { kind: "complete", path: "/api/v2/flow/continue?flow=AAAAAAAAAAAAAAAAAAAAAA" },
      },
    })
    expect(native.calls).toEqual([
      { method: "passwordSessionCreate", password: "correct-password" },
      { method: "sessionGet" },
      { method: "userGet" },
    ])
  })

  test("returns policy continuation when an MFA method or policy requires it", async () => {
    const native = clientCreate({ methods: ["AUTHENTICATION_METHOD_TYPE_PASSWORD", "AUTHENTICATION_METHOD_TYPE_TOTP"] })
    const result = await passwordV2Verify({
      state,
      identifier: "person@example.com",
      password: "password",
      mfaV2Enabled: true,
      now: 1_800_000_000,
      client: native.client,
    })
    expect(result).toEqual(
      expect.objectContaining({
        success: true,
        data: expect.objectContaining({
          state: expect.objectContaining({ stage: "mfa", sessionToken: "latest-token" }),
          transition: expect.objectContaining({ kind: "render", route: "/login/mfa?flow=AAAAAAAAAAAAAAAAAAAAAA" }),
        }),
      }),
    )
  })

  test("returns required password change before MFA or completion using refreshed lifecycle state", async () => {
    for (const native of [
      clientCreate({
        methods: ["AUTHENTICATION_METHOD_TYPE_PASSWORD", "AUTHENTICATION_METHOD_TYPE_TOTP"],
        listedPasswordChangeRequired: false,
        passwordChangeRequired: true,
        sessionToken: "rotated-token",
      }),
      clientCreate({
        listedPasswordChanged: "2027-01-01T00:00:00Z",
        passwordChanged: "2020-01-01T00:00:00Z",
        maxAgeDays: 30,
      }),
    ]) {
      const result = await passwordV2Verify({
        state,
        identifier: "person@example.com",
        password: "password",
        mfaV2Enabled: true,
        now: 1_800_000_000,
        client: native.client,
      })
      expect(result).toEqual(
        expect.objectContaining({
          success: true,
          data: {
            state: expect.objectContaining({
              stage: "password_change_required",
              delegable: false,
              sessionToken: expect.stringMatching(/^(latest|rotated)-token$/),
              transitionCounter: 1,
            }),
            transition: expect.objectContaining({
              kind: "render",
              screen: expect.objectContaining({ name: "password_change_required" }),
            }),
          },
        }),
      )
      expect(native.calls.map((call) => call.method)).toEqual(["passwordSessionCreate", "sessionGet", "userGet"])
    }
  })

  test("delegates when local authentication is disabled before session mutation", async () => {
    const native = clientCreate()
    native.client.loginSettingsGet = async () => resultCreate({ settings: { allowLocalAuthentication: false } })
    const result = await passwordV2Verify({
      state,
      identifier: "person@example.com",
      password: "password",
      mfaV2Enabled: false,
      now: 1_800_000_000,
      client: native.client,
    })
    expect(result).toEqual({
      success: true,
      data: {
        state,
        transition: { kind: "fallback", path: "/api/v2/flow/fallback?flow=AAAAAAAAAAAAAAAAAAAAAA" },
      },
    })
    expect(native.calls).toEqual([])
  })
})
