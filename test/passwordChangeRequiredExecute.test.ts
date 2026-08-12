import { describe, expect, test } from "bun:test"
import type { FlowV2Cookie } from "../src/flow/model/flowV2CookieSchema"
import { passwordChangeRequiredExecute } from "../src/password/domain/passwordChangeRequiredExecute"
import { resultCreate } from "../src/result/resultCreate"
import { resultErrorCreate } from "../src/result/resultErrorCreate"
import type { zitadelClientCreate } from "../src/zitadel/zitadelClientCreate"

const now = 1_800_000_000
const state: Extract<FlowV2Cookie, { stage: "password_change_required" }> = {
  version: 2,
  flowHandle: "A".repeat(22),
  requestKind: "oidc",
  authRequestId: "request-1",
  clientId: "client-1",
  redirectUri: "https://client.example/callback",
  organizationId: "org-1",
  prompt: ["PROMPT_LOGIN"],
  csrfToken: "B".repeat(43),
  issuedAt: now - 60,
  expiresAt: now + 900,
  transitionCounter: 1,
  stage: "password_change_required",
  delegable: false,
  userId: "user-1",
  sessionId: "session-1",
  sessionToken: "session-token",
  expired: false,
}

type Options = {
  explicit?: boolean
  expired?: boolean
  sealedExpired?: boolean
  methods?: string[]
  forceMfa?: boolean
  setError?: "password_policy_invalid" | "password_current_invalid" | "password_set_unavailable"
  postRequired?: boolean
  postSessionFailure?: boolean
  rotatedToken?: string
}

function clientCreate(options: Options = {}) {
  const calls: Array<{ method: string; args?: unknown[] }> = []
  let userCalls = 0
  let sessionCalls = 0
  const user = () => {
    userCalls += 1
    const post = userCalls > 1
    return {
      userId: "user-1",
      state: "USER_STATE_ACTIVE",
      details: { resourceOwner: "org-1" },
      human: {
        email: { email: "person@example.com", isVerified: true },
        passwordChangeRequired: post ? (options.postRequired ?? false) : (options.explicit ?? true),
        passwordChanged: options.expired && !post ? "2020-01-01T00:00:00Z" : new Date(now * 1000).toISOString(),
      },
    }
  }
  const client = {
    sessionGet: async (_sessionId: string, token: string) => {
      sessionCalls += 1
      calls.push({ method: "sessionGet", args: [token] })
      if (options.postSessionFailure && sessionCalls > 1) return resultErrorCreate("sessionGet", "failed")
      return resultCreate({
        session: {
          id: "session-1",
          ...(options.rotatedToken ? { sessionToken: options.rotatedToken } : {}),
          expirationDate: new Date((now + 600) * 1000).toISOString(),
          factors: {
            user: { id: "user-1", organizationId: "org-1" },
            password: { verifiedAt: new Date((now - 30) * 1000).toISOString() },
          },
        },
      })
    },
    userGet: async () => {
      calls.push({ method: "userGet" })
      return resultCreate({ user: user() })
    },
    passwordExpirySettingsGet: async () => {
      calls.push({ method: "passwordExpirySettingsGet" })
      return resultCreate({ settings: { maxAgeDays: 30 } })
    },
    authenticationMethodsGet: async () => {
      calls.push({ method: "authenticationMethodsGet" })
      return resultCreate({
        authMethodTypes: options.methods ?? ["AUTHENTICATION_METHOD_TYPE_PASSWORD"],
      })
    },
    loginSettingsGet: async () => {
      calls.push({ method: "loginSettingsGet" })
      return resultCreate({
        settings: {
          allowLocalAuthentication: true,
          forceMfa: options.forceMfa ?? false,
          secondFactors: options.methods?.includes("AUTHENTICATION_METHOD_TYPE_TOTP") ? ["SECOND_FACTOR_TYPE_OTP"] : [],
          multiFactors: [],
        },
      })
    },
    passwordSet: async (...args: unknown[]) => {
      calls.push({ method: "passwordSet", args })
      if (options.setError) return resultErrorCreate("passwordSet", options.setError)
      return resultCreate({})
    },
  } as unknown as ReturnType<typeof zitadelClientCreate>
  return { client, calls }
}

async function execute(options: Options = {}) {
  const native = clientCreate(options)
  const consumed: FlowV2Cookie[] = []
  const result = await passwordChangeRequiredExecute({
    state: { ...state, expired: options.sealedExpired ?? options.expired ?? false },
    currentPassword: "current-password-secret",
    newPassword: "new-password-secret",
    csrfToken: "C".repeat(43),
    mfaV2Enabled: true,
    now,
    consume: async (nextState) => {
      consumed.push(nextState)
      return resultCreate(undefined)
    },
    client: native.client,
  })
  return { result, calls: native.calls, consumed }
}

describe("required password change domain", () => {
  test("rechecks explicit and expired requirements before consuming or mutating", async () => {
    for (const options of [{ explicit: false }, { explicit: false, sealedExpired: true }]) {
      const output = await execute(options)
      expect(output.result.success).toBe(false)
      expect(output.consumed).toEqual([])
      expect(output.calls.some((call) => call.method === "passwordSet")).toBe(false)
    }
  })

  test("seals consumed state before the exact current-password mutation and completes with latest token", async () => {
    const output = await execute({ rotatedToken: "rotated-token" })
    expect(output.result).toEqual({
      success: true,
      data: {
        state: expect.objectContaining({ stage: "verified", sessionToken: "rotated-token", transitionCounter: 3 }),
        transition: { kind: "complete", path: `/api/v2/flow/continue?flow=${state.flowHandle}` },
        partial: false,
      },
    })
    expect(output.consumed).toEqual([
      expect.objectContaining({ stage: "password_changed", csrfToken: "C".repeat(43), sessionToken: "rotated-token" }),
    ])
    const setCall = output.calls.find((call) => call.method === "passwordSet")
    expect(setCall?.args).toEqual([
      "user-1",
      "new-password-secret",
      { mode: "current_password", currentPassword: "current-password-secret" },
      false,
    ])
  })

  test("continues to existing MFA policy without treating the password change as satisfaction", async () => {
    const output = await execute({
      methods: ["AUTHENTICATION_METHOD_TYPE_PASSWORD", "AUTHENTICATION_METHOD_TYPE_TOTP"],
    })
    expect(output.result).toEqual(
      expect.objectContaining({
        success: true,
        data: expect.objectContaining({
          state: expect.objectContaining({ stage: "mfa" }),
          transition: expect.objectContaining({ kind: "render", screen: { name: "mfa", factors: expect.any(Array) } }),
          partial: false,
        }),
      }),
    )
  })

  test("returns retryable policy and credential errors after pre-sealing consumption", async () => {
    for (const item of [
      { setError: "password_policy_invalid" as const, expected: "password_policy_invalid" },
      { setError: "password_current_invalid" as const, expected: "credentials_invalid" },
    ]) {
      const output = await execute({ setError: item.setError })
      expect(output.result).toEqual({
        success: false,
        op: "passwordChangeRequiredExecute",
        errorMessage: item.expected,
      })
      expect(output.consumed).toHaveLength(1)
    }
  })

  test("keeps post-change failures recoverable without replaying mutation", async () => {
    for (const options of [{ postRequired: true }, { postSessionFailure: true }]) {
      const output = await execute(options)
      expect(output.result).toEqual(
        expect.objectContaining({
          success: true,
          data: expect.objectContaining({
            state: expect.objectContaining({ stage: "password_changed" }),
            transition: { kind: "fallback", path: `/api/v2/flow/fallback?flow=${state.flowHandle}` },
            partial: true,
          }),
        }),
      )
      expect(output.calls.filter((call) => call.method === "passwordSet")).toHaveLength(1)
    }
  })
})
