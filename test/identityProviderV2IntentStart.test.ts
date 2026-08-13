import { describe, expect, test } from "bun:test"

import type { FlowV2Cookie } from "../src/flow/model/flowV2CookieSchema"
import { identityProviderV2IntentStart } from "../src/identity-provider/domain/identityProviderV2IntentStart"
import { zitadelClientCreate } from "../src/zitadel/zitadelClientCreate"

const pagesOrigin = "https://login.example"
const identityOrigin = "https://identity.example"
const now = 1_800_000_000

const readyState: Extract<FlowV2Cookie, { stage: "ready" }> = {
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
  transitionCounter: 0,
  stage: "ready",
  delegable: true,
  owned: true,
}

describe("identityProviderV2IntentStart", () => {
  test("returns error when stage is not delegable", async () => {
    const nonDelegableState = { ...readyState, delegable: false }
    const mockFetch = async () => Response.json({})
    const client = zitadelClientCreate(
      {
        ZITADEL_ORIGIN: identityOrigin,
        ZITADEL_ORGANIZATION_ID: "org-1",
        ZITADEL_ALLOWED_CLIENT_IDS: ["client-1"],
        LOGIN_V2_FALLBACK_URL: `${identityOrigin}/ui/v2/login`,
        PAGES_ORIGIN: pagesOrigin,
        SESSION_LIFETIME_SECONDS: 900,
        ZITADEL_LOGIN_CLIENT_PAT: "test-pat-not-a-real-secret-value",
        FLOW_COOKIE_KEY: "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA",
        RATE_LIMITER: { limit: async () => ({ success: true }) },
      },
      mockFetch,
    )

    const result = await identityProviderV2IntentStart({
      state: nonDelegableState,
      idpId: "google-1",
      pagesOrigin,
      client,
    })

    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.errorMessage).toBe("flow_stage_invalid")
    }
  })

  test("returns fallback when external IdPs are disallowed in settings", async () => {
    const mockFetch = async (input: RequestInfo | URL) => {
      const url = String(input)
      if (url === `${identityOrigin}/v2/settings/login`) {
        return Response.json({ settings: { allowExternalIdp: false } })
      }
      throw new Error(`Unexpected url: ${url}`)
    }

    const client = zitadelClientCreate(
      {
        ZITADEL_ORIGIN: identityOrigin,
        ZITADEL_ORGANIZATION_ID: "org-1",
        ZITADEL_ALLOWED_CLIENT_IDS: ["client-1"],
        LOGIN_V2_FALLBACK_URL: `${identityOrigin}/ui/v2/login`,
        PAGES_ORIGIN: pagesOrigin,
        SESSION_LIFETIME_SECONDS: 900,
        ZITADEL_LOGIN_CLIENT_PAT: "test-pat-not-a-real-secret-value",
        FLOW_COOKIE_KEY: "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA",
        RATE_LIMITER: { limit: async () => ({ success: true }) },
      },
      mockFetch,
    )

    const result = await identityProviderV2IntentStart({
      state: readyState,
      idpId: "google-1",
      pagesOrigin,
      client,
    })

    expect(result.success).toBe(true)
    if (result.success && "transition" in result.data) {
      expect(result.data.transition.kind).toBe("fallback")
    }
  })

  test("returns fallback before creating an IdP intent for an unsupported live MFA policy", async () => {
    const mockFetch = async (input: RequestInfo | URL) => {
      const url = String(input)
      if (url === `${identityOrigin}/v2/settings/login`) {
        return Response.json({ settings: { allowExternalIdp: true, secondFactors: ["SECOND_FACTOR_TYPE_UNKNOWN"] } })
      }
      if (url === `${identityOrigin}/v2/settings/login/idps`) {
        return Response.json({
          identityProviders: [{ id: "google-1", name: "Google", type: "IDENTITY_PROVIDER_TYPE_GOOGLE" }],
        })
      }
      throw new Error(`Unexpected url: ${url}`)
    }
    const client = zitadelClientCreate(
      {
        ZITADEL_ORIGIN: identityOrigin,
        ZITADEL_ORGANIZATION_ID: "org-1",
        ZITADEL_ALLOWED_CLIENT_IDS: ["client-1"],
        LOGIN_V2_FALLBACK_URL: `${identityOrigin}/ui/v2/login`,
        PAGES_ORIGIN: pagesOrigin,
        SESSION_LIFETIME_SECONDS: 900,
        ZITADEL_LOGIN_CLIENT_PAT: "test-pat-not-a-real-secret-value",
        FLOW_COOKIE_KEY: "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA",
        RATE_LIMITER: { limit: async () => ({ success: true }) },
      },
      mockFetch,
    )

    const result = await identityProviderV2IntentStart({
      state: readyState,
      idpId: "google-1",
      pagesOrigin,
      client,
    })

    expect(result.success).toBe(true)
    if (result.success && "transition" in result.data) expect(result.data.transition.kind).toBe("fallback")
  })
})
