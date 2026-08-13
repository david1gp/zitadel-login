import { describe, expect, test } from "bun:test"

import type { WorkerBindings } from "../src/config/workerBindingsSchema"
import type { FlowV2Cookie } from "../src/flow/model/flowV2CookieSchema"
import { mfaEnrollmentAuthorize } from "../src/mfa/domain/mfaEnrollmentAuthorize"
import { zitadelClientCreate } from "../src/zitadel/zitadelClientCreate"

const identityOrigin = "https://identity.example"
const now = 1_800_000_000
const verifiedAt = "2027-01-15T08:00:00Z"
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
  RECENT_ACCOUNT_COOKIE_KEY: undefined,
  RECENT_ACCOUNT_COOKIE_PREVIOUS_KEY: undefined,
  ZITADEL_RECENT_ACCOUNT_V2_ENABLED: false,
  RATE_LIMITER: { limit: async () => ({ success: true }) },
} satisfies WorkerBindings

type NativeOptions = {
  factors: Record<string, unknown>
  sessionId?: string
  sessionStatus?: number
  sessionUserId?: string
  sessionOrganizationId?: string
  expirationDate?: string
  userId?: string
  userOrganizationId?: string
  userState?: string
  human?: boolean
}

function clientCreate(options: NativeOptions) {
  const fetch = async (input: RequestInfo | URL): Promise<Response> => {
    const url = String(input)
    if (url.startsWith(`${identityOrigin}/v2/sessions/session-1?`)) {
      if (options.sessionStatus) return Response.json({}, { status: options.sessionStatus })
      return Response.json({
        session: {
          id: options.sessionId ?? "session-1",
          sessionToken: "latest-secret-token",
          ...(options.expirationDate ? { expirationDate: options.expirationDate } : {}),
          factors: {
            user: {
              id: options.sessionUserId ?? "user-1",
              organizationId: options.sessionOrganizationId ?? "org-1",
            },
            ...options.factors,
          },
        },
      })
    }
    if (url === `${identityOrigin}/v2/users/user-1`) {
      return Response.json({
        user: {
          userId: options.userId ?? "user-1",
          state: options.userState ?? "USER_STATE_ACTIVE",
          details: { resourceOwner: options.userOrganizationId ?? "org-1" },
          ...(options.human === false ? {} : { human: { email: { email: "person@example.com", isVerified: true } } }),
        },
      })
    }
    throw new Error(`Unexpected request: ${url}`)
  }
  return zitadelClientCreate(bindings, fetch)
}

async function authorize(options: NativeOptions) {
  return mfaEnrollmentAuthorize({ state, now, client: clientCreate(options) })
}

describe("mfaEnrollmentAuthorize", () => {
  const trustedCases = [
    ["password", { password: { verifiedAt } }],
    ["user-verified passkey", { webAuthN: { verifiedAt, userVerified: true } }],
    ["linked identity provider", { intent: { verifiedAt } }],
  ] as const

  for (const [name, factors] of trustedCases) {
    test(`authorizes enrollment after a trusted ${name} primary method`, async () => {
      const result = await authorize({ factors })
      expect(result.success).toBe(true)
      if (!result.success) return
      expect(result.data.state.sessionToken).toBe("latest-secret-token")
    })
  }

  const untrustedCases = [
    ["email OTP only", { otpEmail: { verifiedAt } }],
    ["non-user-verified WebAuthn only", { webAuthN: { verifiedAt, userVerified: false } }],
    ["no verified primary method", {}],
  ] as const

  for (const [name, factors] of untrustedCases) {
    test(`rejects enrollment after ${name}`, async () => {
      const result = await authorize({ factors })
      expect(result.success).toBe(false)
      if (!result.success) expect(result.errorMessage).toBe("mfa_setup_forbidden")
    })
  }

  test("rejects mismatched Session and user ownership", async () => {
    const mismatches: NativeOptions[] = [
      { factors: { password: { verifiedAt } }, sessionId: "session-other" },
      { factors: { password: { verifiedAt } }, sessionUserId: "user-other" },
      { factors: { password: { verifiedAt } }, sessionOrganizationId: "org-other" },
      { factors: { password: { verifiedAt } }, userId: "user-other" },
      { factors: { password: { verifiedAt } }, userOrganizationId: "org-other" },
      { factors: { password: { verifiedAt } }, userState: "USER_STATE_INACTIVE" },
      { factors: { password: { verifiedAt } }, human: false },
    ]

    for (const mismatch of mismatches) {
      const result = await authorize(mismatch)
      expect(result.success).toBe(false)
      if (!result.success) expect(result.errorMessage).toBe("session_stale")
    }
  })

  test("rejects stale or expired native Sessions", async () => {
    const stale = await authorize({ factors: { password: { verifiedAt } }, sessionStatus: 401 })
    expect(stale.success).toBe(false)
    if (!stale.success) expect(stale.errorMessage).toBe("session_stale")

    const expired = await authorize({
      factors: { password: { verifiedAt } },
      expirationDate: "2027-01-15T07:59:59Z",
    })
    expect(expired.success).toBe(false)
    if (!expired.success) expect(expired.errorMessage).toBe("session_stale")
  })
})
