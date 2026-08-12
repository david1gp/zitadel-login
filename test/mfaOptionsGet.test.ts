import { describe, expect, test } from "bun:test"

import type { WorkerBindings } from "../src/config/workerBindingsSchema"
import type { FlowV2Cookie } from "../src/flow/model/flowV2CookieSchema"
import { mfaOptionsGet } from "../src/mfa/domain/mfaOptionsGet"
import { zitadelClientCreate } from "../src/zitadel/zitadelClientCreate"

const identityOrigin = "https://identity.example"
const verifiedAt = "2026-08-11T12:00:00Z"
const state: Extract<FlowV2Cookie, { stage: "mfa" }> = {
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
  sessionToken: "secret-old-token",
  mfaMethods: [],
}

const bindings = {
  ZITADEL_ORIGIN: identityOrigin,
  ZITADEL_ORGANIZATION_ID: "org-1",
  ZITADEL_ALLOWED_CLIENT_IDS: ["client-1"],
  LOGIN_V2_FALLBACK_URL: `${identityOrigin}/ui/v2/login`,
  PAGES_ORIGIN: "https://login.example",
  SESSION_LIFETIME_SECONDS: 900,
  ZITADEL_LOGIN_CLIENT_PAT: "test-pat-not-a-real-secret-value",
  FLOW_COOKIE_KEY: "A".repeat(43),
  FLOW_COOKIE_PREVIOUS_KEY: undefined,
  RECENT_ACCOUNT_COOKIE_KEY: "A".repeat(43),
  RECENT_ACCOUNT_COOKIE_PREVIOUS_KEY: undefined,
  ZITADEL_LOGIN_V2_ENABLED: true,
  ZITADEL_EMAIL_OTP_V2_ENABLED: true,
  ZITADEL_RECENT_ACCOUNT_V2_ENABLED: true,
  ZITADEL_PASSWORD_V2_ENABLED: true,
  ZITADEL_PASSKEY_V2_ENABLED: true,
  ZITADEL_IDP_V2_ENABLED: true,
  ZITADEL_MFA_V2_ENABLED: true,
  RATE_LIMITER: { limit: async () => ({ success: true }) },
} satisfies WorkerBindings

type NativeOptions = {
  methods?: string[]
  secondFactors?: string[]
  multiFactors?: string[]
  forceMfa?: boolean
  forceMfaLocalOnly?: boolean
  factors?: Record<string, unknown>
  sessionStatus?: number
  malformedSession?: boolean
  latestToken?: string
  expirationDate?: string
  emailVerified?: boolean
  phoneVerified?: boolean
}

function nativeCreate(options: NativeOptions = {}) {
  const calls: Array<{ method: string; url: string }> = []
  const fetch = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const url = String(input)
    const method = init?.method ?? "GET"
    calls.push({ method, url })

    if (url.startsWith(`${identityOrigin}/v2/sessions/session-1?`) && method === "GET") {
      if (options.sessionStatus) return Response.json({}, { status: options.sessionStatus })
      if (options.malformedSession) {
        return Response.json({
          session: {
            id: "session-1",
            factors: {
              user: { id: "user-1", organizationId: "org-1" },
              password: { verifiedAt: "not-a-timestamp" },
            },
          },
        })
      }
      return Response.json({
        session: {
          id: "session-1",
          sessionToken: options.latestToken ?? "secret-latest-token",
          ...(options.expirationDate ? { expirationDate: options.expirationDate } : {}),
          factors: options.factors ?? {
            user: { id: "user-1", organizationId: "org-1" },
            password: { verifiedAt },
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
          human: {
            email: { email: "person@example.com", isVerified: options.emailVerified ?? true },
            phone: { phone: "+49123456789", isVerified: options.phoneVerified ?? true },
          },
        },
      })
    }
    if (url === `${identityOrigin}/v2/users/user-1/authentication_methods` && method === "GET") {
      return Response.json({ authMethodTypes: options.methods ?? ["AUTHENTICATION_METHOD_TYPE_PASSWORD"] })
    }
    if (url === `${identityOrigin}/v2/settings/login` && method === "GET") {
      return Response.json({
        settings: {
          forceMfa: options.forceMfa ?? false,
          forceMfaLocalOnly: options.forceMfaLocalOnly ?? false,
          secondFactors: options.secondFactors ?? [],
          multiFactors: options.multiFactors ?? [],
        },
      })
    }
    throw new Error(`Unexpected request: ${method} ${url}`)
  }
  return { client: zitadelClientCreate(bindings, fetch), calls }
}

async function optionsGet(options: NativeOptions) {
  return mfaOptionsGet({ state, now: 1_800_000_000, client: nativeCreate(options).client })
}

const factorCases = [
  {
    type: "totp",
    method: "AUTHENTICATION_METHOD_TYPE_TOTP",
    second: "SECOND_FACTOR_TYPE_OTP",
  },
  {
    type: "email_otp",
    method: "AUTHENTICATION_METHOD_TYPE_OTP_EMAIL",
    second: "SECOND_FACTOR_TYPE_OTP_EMAIL",
  },
  {
    type: "sms_otp",
    method: "AUTHENTICATION_METHOD_TYPE_OTP_SMS",
    second: "SECOND_FACTOR_TYPE_OTP_SMS",
  },
  {
    type: "u2f",
    method: "AUTHENTICATION_METHOD_TYPE_U2F",
    second: "SECOND_FACTOR_TYPE_U2F",
  },
] as const

describe("mfaOptionsGet", () => {
  for (const factor of factorCases) {
    test(`checks the single enrolled ${factor.type} second factor`, async () => {
      const result = await optionsGet({
        methods: ["AUTHENTICATION_METHOD_TYPE_PASSWORD", factor.method],
        secondFactors: [factor.second],
      })
      expect(result.success).toBe(true)
      if (!result.success) return
      expect(result.data.options).toEqual({ mode: "check", method: { type: factor.type } })
    })
  }

  test("projects verified-U2F multi-factor policy as a passkey check", async () => {
    const result = await optionsGet({
      methods: ["AUTHENTICATION_METHOD_TYPE_PASSWORD", "AUTHENTICATION_METHOD_TYPE_U2F"],
      multiFactors: ["MULTI_FACTOR_TYPE_U2F_WITH_VERIFICATION"],
    })
    expect(result.success).toBe(true)
    if (!result.success) return
    expect(result.data.options).toEqual({ mode: "check", method: { type: "passkey" } })
  })

  for (let first = 0; first < factorCases.length; first += 1) {
    for (let second = first + 1; second < factorCases.length; second += 1) {
      const left = factorCases[first]!
      const right = factorCases[second]!
      test(`selects between enrolled ${left.type} and ${right.type}`, async () => {
        const result = await optionsGet({
          methods: ["AUTHENTICATION_METHOD_TYPE_PASSWORD", left.method, right.method],
          secondFactors: [left.second, right.second],
        })
        expect(result.success).toBe(true)
        if (!result.success) return
        expect(result.data.options).toEqual({
          mode: "select",
          methods: [{ type: left.type }, { type: right.type }],
        })
      })
    }
  }

  test("selects every enrolled second-factor and verified-U2F policy option", async () => {
    const result = await optionsGet({
      methods: [
        "AUTHENTICATION_METHOD_TYPE_PASSWORD",
        "AUTHENTICATION_METHOD_TYPE_TOTP",
        "AUTHENTICATION_METHOD_TYPE_OTP_EMAIL",
        "AUTHENTICATION_METHOD_TYPE_OTP_SMS",
        "AUTHENTICATION_METHOD_TYPE_U2F",
      ],
      secondFactors: factorCases.map((factor) => factor.second),
      multiFactors: ["MULTI_FACTOR_TYPE_U2F_WITH_VERIFICATION"],
    })
    expect(result.success).toBe(true)
    if (!result.success) return
    expect(result.data.options).toEqual({
      mode: "select",
      methods: [{ type: "totp" }, { type: "email_otp" }, { type: "sms_otp" }, { type: "u2f" }, { type: "passkey" }],
    })
  })

  test("requires enrollment from every policy-allowed unconfigured factor when MFA is forced", async () => {
    const result = await optionsGet({
      forceMfa: true,
      secondFactors: factorCases.map((factor) => factor.second),
      multiFactors: ["MULTI_FACTOR_TYPE_U2F_WITH_VERIFICATION"],
    })
    expect(result.success).toBe(true)
    if (!result.success) return
    expect(result.data.options).toEqual({
      mode: "enroll",
      methods: [{ type: "totp" }, { type: "email_otp" }, { type: "u2f" }, { type: "passkey" }],
    })
  })

  test("omits un-enrolled SMS from optional setup while retaining other allowed methods", async () => {
    const result = await optionsGet({ secondFactors: ["SECOND_FACTOR_TYPE_OTP", "SECOND_FACTOR_TYPE_OTP_SMS"] })
    expect(result.success).toBe(true)
    if (!result.success) return
    expect(result.data.options).toEqual({
      mode: "skip",
      reason: "optional_setup",
      methods: [{ type: "totp" }],
    })
  })

  test("applies local-only forced MFA to local primary factors but not an external intent", async () => {
    const local = await optionsGet({ forceMfaLocalOnly: true, secondFactors: ["SECOND_FACTOR_TYPE_OTP"] })
    expect(local.success).toBe(true)
    if (local.success) expect(local.data.options).toEqual({ mode: "enroll", methods: [{ type: "totp" }] })

    const external = await optionsGet({
      forceMfaLocalOnly: true,
      secondFactors: ["SECOND_FACTOR_TYPE_OTP"],
      factors: {
        user: { id: "user-1", organizationId: "org-1" },
        intent: { verifiedAt },
      },
    })
    expect(external.success).toBe(true)
    if (external.success) {
      expect(external.data.options).toEqual({
        mode: "skip",
        reason: "optional_setup",
        methods: [{ type: "totp" }],
      })
    }
  })

  test("does not reuse a primary email OTP as its own second factor", async () => {
    const result = await optionsGet({
      methods: ["AUTHENTICATION_METHOD_TYPE_OTP_EMAIL", "AUTHENTICATION_METHOD_TYPE_TOTP"],
      secondFactors: ["SECOND_FACTOR_TYPE_OTP_EMAIL", "SECOND_FACTOR_TYPE_OTP"],
      factors: {
        user: { id: "user-1", organizationId: "org-1" },
        otpEmail: { verifiedAt },
      },
    })
    expect(result.success).toBe(true)
    if (!result.success) return
    expect(result.data.options).toEqual({ mode: "check", method: { type: "totp" } })
  })

  test("skips checks when an MFA factor or user-verified passkey already satisfied the session", async () => {
    const satisfiedFactors = [
      { password: { verifiedAt }, totp: { verifiedAt } },
      { password: { verifiedAt }, otpEmail: { verifiedAt } },
      { password: { verifiedAt }, otpSms: { verifiedAt } },
      { password: { verifiedAt }, webAuthN: { verifiedAt, userVerified: false } },
      { webAuthN: { verifiedAt, userVerified: true } },
    ]
    for (const factor of satisfiedFactors) {
      const result = await optionsGet({
        secondFactors: ["SECOND_FACTOR_TYPE_OTP"],
        factors: { user: { id: "user-1", organizationId: "org-1" }, ...factor },
      })
      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.data.options).toEqual({ mode: "skip", reason: "factor_satisfied", methods: [] })
      }
    }
  })

  test("filters email and SMS setup when the current user contacts are not verified", async () => {
    const result = await optionsGet({
      forceMfa: true,
      emailVerified: false,
      phoneVerified: false,
      secondFactors: ["SECOND_FACTOR_TYPE_OTP", "SECOND_FACTOR_TYPE_OTP_EMAIL", "SECOND_FACTOR_TYPE_OTP_SMS"],
    })
    expect(result.success).toBe(true)
    if (!result.success) return
    expect(result.data.options).toEqual({ mode: "enroll", methods: [{ type: "totp" }] })
  })

  test("returns a safe fallback for recovery codes and unknown native branches", async () => {
    const recovery = await optionsGet({
      methods: ["AUTHENTICATION_METHOD_TYPE_PASSWORD", "AUTHENTICATION_METHOD_TYPE_RECOVERY_CODE"],
      secondFactors: ["SECOND_FACTOR_TYPE_OTP"],
    })
    expect(recovery.success).toBe(true)
    if (recovery.success) {
      expect(recovery.data.options).toEqual({ mode: "fallback", reason: "recovery_code" })
    }

    const unknown = await optionsGet({
      secondFactors: ["SECOND_FACTOR_TYPE_FUTURE"],
      factors: {
        user: { id: "user-1", organizationId: "org-1" },
        password: { verifiedAt },
        recoveryCode: { verifiedAt },
      },
    })
    expect(unknown.success).toBe(true)
    if (unknown.success) {
      expect(unknown.data.options).toEqual({ mode: "fallback", reason: "unsupported_branch" })
    }
  })

  test("classifies stale and malformed Sessions without continuing to policy reads", async () => {
    const staleNative = nativeCreate({ sessionStatus: 401 })
    const stale = await mfaOptionsGet({ state, now: 1_800_000_000, client: staleNative.client })
    expect(stale.success).toBe(false)
    if (!stale.success) expect(stale.errorMessage).toBe("session_stale")
    expect(staleNative.calls).toHaveLength(1)

    const malformedNative = nativeCreate({ malformedSession: true })
    const malformed = await mfaOptionsGet({ state, now: 1_800_000_000, client: malformedNative.client })
    expect(malformed.success).toBe(false)
    if (!malformed.success) expect(malformed.errorMessage).toBe("mfa_unavailable")
    expect(malformedNative.calls).toHaveLength(1)

    const expiredNative = nativeCreate({ expirationDate: "2026-08-11T11:59:59Z" })
    const expired = await mfaOptionsGet({ state, now: 1_800_000_000, client: expiredNative.client })
    expect(expired.success).toBe(false)
    if (!expired.success) expect(expired.errorMessage).toBe("session_stale")
    expect(expiredNative.calls).toHaveLength(1)
  })

  test("retains only the latest native Session token in encrypted state and performs no native mutation", async () => {
    const native = nativeCreate({
      latestToken: "secret-rotated-token",
      methods: ["AUTHENTICATION_METHOD_TYPE_PASSWORD", "AUTHENTICATION_METHOD_TYPE_TOTP"],
      secondFactors: ["SECOND_FACTOR_TYPE_OTP"],
    })
    const result = await mfaOptionsGet({ state, now: 1_800_000_000, client: native.client })
    expect(result.success).toBe(true)
    if (!result.success) return
    expect(result.data.state.sessionToken).toBe("secret-rotated-token")
    expect(JSON.stringify(result.data.options)).not.toContain("secret")
    expect(native.calls.every((call) => call.method === "GET")).toBe(true)
  })
})
