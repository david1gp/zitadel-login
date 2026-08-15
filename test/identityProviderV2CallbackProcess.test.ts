import { describe, expect, test } from "bun:test"

import type { FlowV2Cookie } from "../src/flow/model/flowV2CookieSchema"
import { identityProviderV2CallbackProcess } from "../src/identity-provider/domain/identityProviderV2CallbackProcess"
import { zitadelClientCreate } from "../src/zitadel/zitadelClientCreate"

const pagesOrigin = "https://login.example"
const identityOrigin = "https://identity.example"
const now = 1_800_000_000

const idpIntentState: Extract<FlowV2Cookie, { stage: "idp_intent" }> = {
  version: 2,
  flowHandle: "flow-handle-1234567890",
  requestKind: "oidc",
  authRequestId: "request-1",
  clientId: "client-1",
  redirectUri: "https://client.example/callback",
  organizationId: "org-1",
  prompt: ["PROMPT_LOGIN"],
  csrfToken: "csrf-token-12345678901234567890123456789012345",
  issuedAt: now,
  expiresAt: now + 900,
  transitionCounter: 1,
  stage: "idp_intent",
  delegable: false,
  idpId: "google-1",
  idpType: "IDENTITY_PROVIDER_TYPE_GOOGLE",
  redirectUrl: "https://identity.example/v2/idp/intents/intent-1",
}

const bindings = {
  ZITADEL_ORIGIN: identityOrigin,
  ZITADEL_ORGANIZATION_ID: "org-1",
  ZITADEL_ALLOWED_CLIENT_IDS: ["client-1"],
  LOGIN_V2_FALLBACK_URL: `${identityOrigin}/ui/v2/login`,
  PAGES_ORIGIN: pagesOrigin,
  SESSION_LIFETIME_SECONDS: 900,
  ZITADEL_LOGIN_CLIENT_PAT: "test-pat-not-a-real-secret-value",
  FLOW_COOKIE_KEY: "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA",
  RATE_LIMITER: { limit: async () => ({ success: true }) },
}

function linkedMfaClientCreate(options: { emailVerified: boolean }) {
  const mockFetch = async (input: RequestInfo | URL) => {
    const url = String(input)
    if (url === `${identityOrigin}/v2/idp_intents/intent-1`) {
      return Response.json({
        idpInformation: { idpId: "google-1", userId: "google-user-1" },
        userId: "user-1",
      })
    }
    if (url === `${identityOrigin}/v2/sessions`) {
      return Response.json({ sessionId: "session-1", sessionToken: "token-1" })
    }
    if (url === `${identityOrigin}/v2/sessions/session-1?sessionToken=token-1`) {
      return Response.json({
        session: {
          id: "session-1",
          factors: { user: { id: "user-1", organizationId: "org-1" } },
        },
      })
    }
    if (url === `${identityOrigin}/v2/users/user-1`) {
      return Response.json({
        user: {
          userId: "user-1",
          state: "USER_STATE_ACTIVE",
          details: { resourceOwner: "org-1" },
          human: { email: { email: "redacted@example.invalid", isVerified: options.emailVerified } },
        },
      })
    }
    if (url === `${identityOrigin}/v2/users/user-1/authentication_methods`) {
      return Response.json({ authMethodTypes: ["AUTHENTICATION_METHOD_TYPE_OTP_EMAIL"] })
    }
    if (url === `${identityOrigin}/v2/settings/login`) {
      return Response.json({ settings: { forceMfa: true, secondFactors: ["SECOND_FACTOR_TYPE_OTP_EMAIL"] } })
    }
    throw new Error(`Unexpected url: ${url}`)
  }

  return zitadelClientCreate(bindings, mockFetch)
}

describe("identityProviderV2CallbackProcess", () => {
  test("returns provider_mismatch when providerId does not match state idpId", async () => {
    const mockFetch = async () => Response.json({})
    const client = zitadelClientCreate(bindings, mockFetch)

    const result = await identityProviderV2CallbackProcess({
      state: idpIntentState,
      providerId: "github-1",
      intentId: "intent-1",
      intentToken: "token-1",
      client,
    })

    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.errorMessage).toBe("provider_mismatch")
    }
  })

  test("processes linked existing user without MFA successfully to verified state", async () => {
    const mockFetch = async (input: RequestInfo | URL) => {
      const url = String(input)
      if (url === `${identityOrigin}/v2/idp_intents/intent-1`) {
        return Response.json({
          idpInformation: { idpId: "google-1", userId: "google-user-1", userName: "user@example.com" },
          userId: "user-1",
        })
      }
      if (url === `${identityOrigin}/v2/sessions`) {
        return Response.json({ sessionId: "session-1", sessionToken: "token-1" })
      }
      if (url === `${identityOrigin}/v2/sessions/session-1?sessionToken=token-1`) {
        return Response.json({
          session: {
            id: "session-1",
            factors: {
              user: { id: "user-1", organizationId: "org-1" },
            },
          },
        })
      }
      if (url === `${identityOrigin}/v2/users/user-1`) {
        return Response.json({
          user: {
            userId: "user-1",
            state: "USER_STATE_ACTIVE",
            details: { resourceOwner: "org-1" },
            human: { phone: { phone: "+15555550123", isVerified: false } },
          },
        })
      }
      if (url === `${identityOrigin}/v2/users/user-1/authentication_methods`) {
        return Response.json({ authMethodTypes: [] })
      }
      if (url === `${identityOrigin}/v2/settings/login`) {
        return Response.json({ settings: { forceMfa: false } })
      }
      throw new Error(`Unexpected url: ${url}`)
    }

    const client = zitadelClientCreate(bindings, mockFetch)

    const result = await identityProviderV2CallbackProcess({
      state: idpIntentState,
      providerId: "google-1",
      intentId: "intent-1",
      intentToken: "token-1",
      client,
    })

    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.state.stage).toBe("verified")
      if (result.data.state.stage === "verified") {
        expect(result.data.state.userId).toBe("user-1")
        expect(result.data.state.sessionId).toBe("session-1")
        expect(result.data.state.sessionToken).toBe("token-1")
      }
      expect(result.data.transition.kind).toBe("complete")
    }
  })

  test("processes linked existing user requiring MFA to mfa stage", async () => {
    const mockFetch = async (input: RequestInfo | URL) => {
      const url = String(input)
      if (url === `${identityOrigin}/v2/idp_intents/intent-1`) {
        return Response.json({
          idpInformation: { idpId: "google-1", userId: "google-user-1", userName: "user@example.com" },
          userId: "user-1",
        })
      }
      if (url === `${identityOrigin}/v2/sessions`) {
        return Response.json({ sessionId: "session-1", sessionToken: "token-1" })
      }
      if (url === `${identityOrigin}/v2/sessions/session-1?sessionToken=token-1`) {
        return Response.json({
          session: {
            id: "session-1",
            factors: {
              user: { id: "user-1", organizationId: "org-1" },
            },
          },
        })
      }
      if (url === `${identityOrigin}/v2/users/user-1`) {
        return Response.json({
          user: {
            userId: "user-1",
            state: "USER_STATE_ACTIVE",
            details: { resourceOwner: "org-1" },
            human: { phone: { phone: "+15555550123", isVerified: true } },
          },
        })
      }
      if (url === `${identityOrigin}/v2/users/user-1/authentication_methods`) {
        return Response.json({ authMethodTypes: ["AUTHENTICATION_METHOD_TYPE_OTP_SMS"] })
      }
      if (url === `${identityOrigin}/v2/settings/login`) {
        return Response.json({ settings: { forceMfa: true, secondFactors: ["SECOND_FACTOR_TYPE_OTP_SMS"] } })
      }
      throw new Error(`Unexpected url: ${url}`)
    }

    const client = zitadelClientCreate(bindings, mockFetch)

    const result = await identityProviderV2CallbackProcess({
      state: idpIntentState,
      providerId: "google-1",
      intentId: "intent-1",
      intentToken: "token-1",
      client,
    })

    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.state.stage).toBe("mfa")
      if (result.data.state.stage === "mfa") {
        expect(result.data.state.userId).toBe("user-1")
        expect(result.data.state.mfaMethods).toEqual(["AUTHENTICATION_METHOD_TYPE_OTP_SMS"])
      }
      expect(result.data.transition.kind).toBe("render")
    }
  })

  test("uses the linked user's verified email for enrolled email OTP MFA", async () => {
    const result = await identityProviderV2CallbackProcess({
      state: idpIntentState,
      providerId: "google-1",
      intentId: "intent-1",
      intentToken: "token-1",
      client: linkedMfaClientCreate({ emailVerified: true }),
    })

    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.state.stage).toBe("mfa")
      if (result.data.state.stage === "mfa") {
        expect(result.data.state.mfaMethods).toEqual(["AUTHENTICATION_METHOD_TYPE_OTP_EMAIL"])
      }
    }
  })

  test("does not offer email OTP MFA when the linked user's email is unverified", async () => {
    const result = await identityProviderV2CallbackProcess({
      state: idpIntentState,
      providerId: "google-1",
      intentId: "intent-1",
      intentToken: "token-1",
      client: linkedMfaClientCreate({ emailVerified: false }),
    })

    expect(result.success).toBe(false)
    if (!result.success) expect(result.errorMessage).toBe("authorization_unavailable")
  })

  test("does not offer SMS MFA after linked identity-provider authentication when the phone is unverified", async () => {
    const mockFetch = async (input: RequestInfo | URL) => {
      const url = String(input)
      if (url === `${identityOrigin}/v2/idp_intents/intent-1`) {
        return Response.json({
          idpInformation: { idpId: "google-1", userId: "google-user-1", userName: "user@example.com" },
          userId: "user-1",
        })
      }
      if (url === `${identityOrigin}/v2/sessions`) {
        return Response.json({ sessionId: "session-1", sessionToken: "token-1" })
      }
      if (url === `${identityOrigin}/v2/sessions/session-1?sessionToken=token-1`) {
        return Response.json({
          session: {
            id: "session-1",
            factors: {
              user: { id: "user-1", organizationId: "org-1" },
            },
          },
        })
      }
      if (url === `${identityOrigin}/v2/users/user-1`) {
        return Response.json({
          user: {
            userId: "user-1",
            state: "USER_STATE_ACTIVE",
            details: { resourceOwner: "org-1" },
            human: { phone: { phone: "+15555550123", isVerified: false } },
          },
        })
      }
      if (url === `${identityOrigin}/v2/users/user-1/authentication_methods`) {
        return Response.json({ authMethodTypes: ["AUTHENTICATION_METHOD_TYPE_OTP_SMS"] })
      }
      if (url === `${identityOrigin}/v2/settings/login`) {
        return Response.json({ settings: { forceMfa: true, secondFactors: ["SECOND_FACTOR_TYPE_OTP_SMS"] } })
      }
      throw new Error(`Unexpected url: ${url}`)
    }

    const client = zitadelClientCreate(bindings, mockFetch)

    const result = await identityProviderV2CallbackProcess({
      state: idpIntentState,
      providerId: "google-1",
      intentId: "intent-1",
      intentToken: "token-1",
      client,
    })

    expect(result.success).toBe(false)
    if (!result.success) expect(result.errorMessage).toBe("authorization_unavailable")
  })

  test("processes unlinked user to idp_unlinked stage", async () => {
    const mockFetch = async (input: RequestInfo | URL) => {
      const url = String(input)
      if (url === `${identityOrigin}/v2/idp_intents/intent-1`) {
        return Response.json({
          idpInformation: { idpId: "google-1", userId: "google-user-1", userName: "newuser@example.com" },
        })
      }
      throw new Error(`Unexpected url: ${url}`)
    }

    const client = zitadelClientCreate(bindings, mockFetch)

    const result = await identityProviderV2CallbackProcess({
      state: idpIntentState,
      providerId: "google-1",
      intentId: "intent-1",
      intentToken: "token-1",
      client,
    })

    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.state.stage).toBe("idp_unlinked")
      if (result.data.state.stage === "idp_unlinked") {
        expect(result.data.state.idpId).toBe("google-1")
        expect(result.data.state.idpUserId).toBe("google-user-1")
        expect(result.data.state.idpUserName).toBe("newuser@example.com")
      }
      expect(result.data.transition.kind).toBe("render")
      if (result.data.transition.kind === "render") {
        expect(result.data.transition.route).toContain("/account-not-found")
      }
    }
  })

  test("returns idp_intent_invalid when upstream intent retrieval fails", async () => {
    const mockFetch = async (input: RequestInfo | URL) => {
      const url = String(input)
      if (url === `${identityOrigin}/v2/idp_intents/intent-1`) {
        return Response.json({ error: "intent expired" }, { status: 400 })
      }
      throw new Error(`Unexpected url: ${url}`)
    }

    const client = zitadelClientCreate(bindings, mockFetch)

    const result = await identityProviderV2CallbackProcess({
      state: idpIntentState,
      providerId: "google-1",
      intentId: "intent-1",
      intentToken: "token-1",
      client,
    })

    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.errorMessage).toBe("idp_intent_invalid")
    }
  })
})
