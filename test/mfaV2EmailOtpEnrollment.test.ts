import { describe, expect, test } from "bun:test"

import type { WorkerBindings } from "../src/config/workerBindingsSchema"
import type { FlowV2Cookie } from "../src/flow/model/flowV2CookieSchema"
import { mfaV2EmailOtpEnrollmentActivate } from "../src/mfa/domain/mfaV2EmailOtpEnrollmentActivate"
import { mfaV2EmailOtpEnrollmentPrepare } from "../src/mfa/domain/mfaV2EmailOtpEnrollmentPrepare"
import { zitadelClientCreate } from "../src/zitadel/zitadelClientCreate"

const identityOrigin = "https://identity.example"
const now = 1_800_000_000
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
  issuedAt: now,
  expiresAt: now + 900,
  transitionCounter: 2,
  stage: "mfa",
  delegable: false,
  userId: "user-1",
  sessionId: "session-1",
  sessionToken: "old-secret-token",
  mfaMethods: ["AUTHENTICATION_METHOD_TYPE_PASSWORD"],
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
  ZITADEL_RECENT_ACCOUNT_V2_ENABLED: true,
  RATE_LIMITER: { limit: async () => ({ success: true }) },
} satisfies WorkerBindings

function nativeCreate() {
  const calls: Array<{ method: string; url: string; body?: unknown }> = []
  const fetch = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const url = String(input)
    const method = init?.method ?? "GET"
    const body = init?.body ? JSON.parse(String(init.body)) : undefined
    calls.push({ method, url, ...(body === undefined ? {} : { body }) })

    if (url.startsWith(`${identityOrigin}/v2/sessions/session-1?`) && method === "GET") {
      return Response.json({
        session: {
          id: "session-1",
          sessionToken: "latest-secret-token",
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
          human: { email: { email: "person@example.com", isVerified: true } },
        },
      })
    }
    if (url === `${identityOrigin}/v2/users/user-1/authentication_methods` && method === "GET") {
      return Response.json({ authMethodTypes: ["AUTHENTICATION_METHOD_TYPE_PASSWORD"] })
    }
    if (url === `${identityOrigin}/v2/settings/login` && method === "GET") {
      return Response.json({ settings: { forceMfa: true, secondFactors: ["SECOND_FACTOR_TYPE_OTP_EMAIL"] } })
    }
    if (url === `${identityOrigin}/v2/users/user-1/otp_email` && method === "POST") {
      return Response.json({ details: { resourceOwner: "org-1", sequence: "4" } })
    }
    if (url === `${identityOrigin}/v2/sessions/session-1` && method === "PATCH") {
      return Response.json({ sessionToken: "challenge-secret-token" })
    }
    throw new Error(`Unexpected request: ${method} ${url}`)
  }
  return { client: zitadelClientCreate(bindings, fetch), calls }
}

describe("mfaV2EmailOtpEnrollment", () => {
  test("consumes setup before activation and then issues a native Session challenge", async () => {
    const native = nativeCreate()
    const prepared = await mfaV2EmailOtpEnrollmentPrepare({ state, now, client: native.client })

    expect(prepared.success).toBe(true)
    if (!prepared.success) return
    expect(prepared.data.state).toMatchObject({
      stage: "mfa_email_otp_code",
      sessionToken: "latest-secret-token",
      transitionCounter: 3,
      enrollmentActivationConsumedAt: now,
    })
    expect(prepared.data.state.challengeIssuedAt).toBeUndefined()

    const activated = await mfaV2EmailOtpEnrollmentActivate({
      state: prepared.data.state,
      now,
      client: native.client,
    })
    expect(activated.success).toBe(true)
    if (!activated.success) return
    expect(activated.data.state).toMatchObject({
      stage: "mfa_email_otp_code",
      sessionToken: "challenge-secret-token",
      challengeIssuedAt: now,
    })
    expect(activated.data.state.mfaMethods).toContain("AUTHENTICATION_METHOD_TYPE_OTP_EMAIL")
    const mutations = native.calls.filter((call) => call.method === "POST" || call.method === "PATCH")
    expect(mutations.map((call) => call.url)).toEqual([
      `${identityOrigin}/v2/users/user-1/otp_email`,
      `${identityOrigin}/v2/sessions/session-1`,
    ])
  })
})
