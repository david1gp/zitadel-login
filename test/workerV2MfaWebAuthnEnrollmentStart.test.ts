import { describe, expect, test } from "bun:test"

import type { WorkerBindingsInput } from "../src/config/workerBindingsSchema"
import { flowV2CookieOpen } from "../src/flow/domain/flowV2CookieOpen"
import { flowV2CookieSeal } from "../src/flow/domain/flowV2CookieSeal"
import type { FlowV2Cookie } from "../src/flow/model/flowV2CookieSchema"
import { workerAppCreate } from "../src/worker/workerAppCreate"

const origin = "https://login.example"
const identityOrigin = "https://identity.example"
const key = "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA"
const now = 1_800_000_000
const flowHandle = "AAAAAAAAAAAAAAAAAAAAAA"
const cookieName = `__Host-zitadel-login-flow-${flowHandle}`
const csrfToken = "B".repeat(43)
const bindings: WorkerBindingsInput = {
  ZITADEL_ORIGIN: identityOrigin,
  ZITADEL_ORGANIZATION_ID: "org-1",
  ZITADEL_ALLOWED_CLIENT_IDS: "client-1",
  LOGIN_V2_FALLBACK_URL: `${identityOrigin}/ui/v2/login`,
  PAGES_ORIGIN: origin,
  SESSION_LIFETIME_SECONDS: "900",
  ZITADEL_LOGIN_CLIENT_PAT: "test-pat-not-a-real-secret-value",
  FLOW_COOKIE_KEY: key,
  RATE_LIMITER: { limit: async () => ({ success: true }) },
}
const mfaState: Extract<FlowV2Cookie, { stage: "mfa" }> = {
  version: 2,
  flowHandle,
  requestKind: "oidc",
  authRequestId: "request-1",
  clientId: "client-1",
  redirectUri: "https://client.example/callback",
  organizationId: "org-1",
  prompt: ["PROMPT_LOGIN"],
  csrfToken,
  issuedAt: now,
  expiresAt: now + 900,
  transitionCounter: 2,
  stage: "mfa",
  delegable: false,
  userId: "user-secret-id",
  sessionId: "session-secret-id",
  sessionToken: "old-secret-session-token",
  mfaMethods: [],
}

function nativeCreate(method: "u2f" | "passkey") {
  const calls: Array<{ method: string; url: string }> = []
  const fetch = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const url = String(input)
    const requestMethod = init?.method ?? "GET"
    calls.push({ method: requestMethod, url })
    if (url === `${identityOrigin}/v2/oidc/auth_requests/request-1` && requestMethod === "GET") {
      return Response.json({
        authRequest: {
          id: "request-1",
          clientId: "client-1",
          redirectUri: "https://client.example/callback",
          scope: ["openid", "urn:zitadel:iam:org:id:org-1"],
          prompt: ["PROMPT_LOGIN"],
        },
      })
    }
    if (url.startsWith(`${identityOrigin}/v2/sessions/session-secret-id?`) && requestMethod === "GET") {
      return Response.json({
        session: {
          id: "session-secret-id",
          sessionToken: "latest-secret-session-token",
          expirationDate: "2027-01-15T08:15:00Z",
          factors: {
            user: { id: "user-secret-id", organizationId: "org-1" },
            password: { verifiedAt: "2027-01-15T08:00:00Z" },
          },
        },
      })
    }
    if (url === `${identityOrigin}/v2/users/user-secret-id` && requestMethod === "GET") {
      return Response.json({
        user: {
          userId: "user-secret-id",
          state: "USER_STATE_ACTIVE",
          details: { resourceOwner: "org-1" },
          human: { email: { email: "secret-person@example.com", isVerified: true } },
        },
      })
    }
    if (url === `${identityOrigin}/v2/users/user-secret-id/authentication_methods` && requestMethod === "GET") {
      return Response.json({ authMethodTypes: ["AUTHENTICATION_METHOD_TYPE_PASSWORD"] })
    }
    if (url === `${identityOrigin}/v2/settings/login` && requestMethod === "GET") {
      return Response.json({
        settings:
          method === "u2f"
            ? { forceMfa: true, secondFactors: ["SECOND_FACTOR_TYPE_U2F"], multiFactors: [] }
            : { forceMfa: true, secondFactors: [], multiFactors: ["MULTI_FACTOR_TYPE_U2F_WITH_VERIFICATION"] },
      })
    }
    const registrationPath = method === "u2f" ? "/u2f" : "/passkeys"
    if (url === `${identityOrigin}/v2/users/user-secret-id${registrationPath}` && requestMethod === "POST") {
      return Response.json({
        ...(method === "u2f" ? { u2fId: "registration-secret-id" } : { passkeyId: "registration-secret-id" }),
        publicKeyCredentialCreationOptions: {
          publicKey: {
            attestation: "none",
            authenticatorSelection: { userVerification: "required" },
            challenge: "registration-challenge",
            pubKeyCredParams: [{ alg: -7, type: "public-key" }],
            rp: { id: "login.example", name: "ZITADEL" },
            timeout: 300000,
            user: { displayName: "Test User", id: "user-handle", name: "test-user" },
          },
        },
      })
    }
    throw new Error(`Unexpected request: ${requestMethod} ${url}`)
  }
  return { fetch, calls }
}

async function cookieCreate() {
  const sealed = await flowV2CookieSeal(mfaState, key, new Uint8Array(12).fill(9))
  if (!sealed.success) throw new Error("Expected sealed flow")
  return `${cookieName}=${sealed.data}`
}

describe("POST /api/v2/mfa/{u2f,passkey}/enroll", () => {
  for (const method of ["u2f", "passkey"] as const) {
    test(`starts ${method} enrollment with browser-safe options and an encrypted one-time setup state`, async () => {
      const native = nativeCreate(method)
      const app = workerAppCreate({ fetch: native.fetch, now: () => now })
      const response = await app.request(
        new Request(`${origin}/api/v2/mfa/${method}/enroll?flow=${flowHandle}`, {
          method: "POST",
          headers: { origin, "content-type": "application/json", cookie: await cookieCreate() },
          body: JSON.stringify({ method, csrfToken }),
        }),
        undefined,
        bindings,
      )

      expect(response.status).toBe(201)
      const text = await response.text()
      expect(JSON.parse(text)).toMatchObject({
        success: true,
        data: {
          options: { publicKey: { rp: { id: "login.example" }, challenge: "registration-challenge" } },
          transition: {
            kind: "render",
            route: `/login/mfa?flow=${flowHandle}`,
            screen: { name: "mfa_webauthn_setup", method },
            csrfToken,
          },
        },
      })
      for (const hidden of [
        "user-secret-id",
        "session-secret-id",
        "old-secret-session-token",
        "latest-secret-session-token",
      ]) {
        expect(text).not.toContain(hidden)
      }

      const cookieValue = response.headers.get("set-cookie")?.match(new RegExp(`${cookieName}=([^;]+)`))?.[1]
      expect(cookieValue).toBeTruthy()
      const opened = await flowV2CookieOpen(cookieValue!, flowHandle, [key], now)
      expect(opened.success).toBe(true)
      if (!opened.success) return
      expect(opened.data).toMatchObject({
        stage: "mfa_webauthn_setup",
        registrationMethod: method,
        registrationId: "registration-secret-id",
        registrationChallenge: "registration-challenge",
        registrationRpId: "login.example",
        registrationOrigin: origin,
        registrationStartedAt: now,
        registrationExpiresAt: now + 300,
        sessionToken: "latest-secret-session-token",
        transitionCounter: 3,
      })
      expect(native.calls.filter((call) => call.method === "POST")).toEqual([
        { method: "POST", url: `${identityOrigin}/v2/users/user-secret-id${method === "u2f" ? "/u2f" : "/passkeys"}` },
      ])
    })
  }
})
