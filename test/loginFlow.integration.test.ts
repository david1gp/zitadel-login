import { afterEach, describe, expect, test } from "bun:test"

import { emailOtpV2ResendApiRequest } from "../client/src/email-otp/api/emailOtpV2ResendApiRequest"
import { emailOtpV2StartApiRequest } from "../client/src/email-otp/api/emailOtpV2StartApiRequest"
import { emailOtpV2VerifyApiRequest } from "../client/src/email-otp/api/emailOtpV2VerifyApiRequest"
import { flowV2InitializeApiRequest } from "../client/src/flow/api/flowV2InitializeApiRequest"
import { flowV2ResumeApiRequest } from "../client/src/flow/api/flowV2ResumeApiRequest"
import type { WorkerBindingsInput } from "../src/config/workerBindingsSchema"
import { workerAppCreate } from "../src/worker/workerAppCreate"
import { emailOtpCooldownNamespaceFakeCreate } from "./emailOtpCooldownNamespaceFakeCreate"

type EmailOtpV1ApiOperation =
  | { type: "initialize"; authRequest: string }
  | { type: "start"; email: string; csrfToken: string }
  | { type: "resend"; csrfToken: string }
  | { type: "verify"; code: string; csrfToken: string }

async function emailOtpV1ApiRequest(apiOrigin: string, operation: EmailOtpV1ApiOperation) {
  const endpoint =
    operation.type === "initialize"
      ? `/api/auth-request?${new URLSearchParams({ authRequest: operation.authRequest })}`
      : `/api/email-otp/${operation.type}`
  const init: RequestInit = { credentials: "include" }
  if (operation.type !== "initialize") {
    const { type: _, ...payload } = operation
    init.method = "POST"
    init.headers = { "Content-Type": "application/json" }
    init.body = JSON.stringify(payload)
  }
  const response = await fetch(new URL(endpoint, apiOrigin), init)
  const input = await response.json()
  return { success: response.ok, data: input }
}

const workerOrigin = "https://worker.invalid.test"
const browserOrigin = workerOrigin
const identityOrigin = "https://identity.invalid.test"
const originalFetch = globalThis.fetch

const cooldown = emailOtpCooldownNamespaceFakeCreate()
const bindings: WorkerBindingsInput = {
  ZITADEL_ORIGIN: identityOrigin,
  ZITADEL_ORGANIZATION_ID: "org-test",
  ZITADEL_ALLOWED_CLIENT_IDS: "client-test",
  LOGIN_V2_FALLBACK_URL: `${identityOrigin}/ui/v2/login`,
  PAGES_ORIGIN: browserOrigin,
  SESSION_LIFETIME_SECONDS: "900",
  ZITADEL_LOGIN_CLIENT_PAT: "test-pat-not-a-secret-value",
  FLOW_COOKIE_KEY: "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA",
  ZITADEL_CUSTOM_LOGIN_ENABLED: "true",
  RATE_LIMITER: { limit: async () => ({ success: true }) },
  EMAIL_OTP_COOLDOWN: cooldown,
}

const authRequest = {
  id: "request-test",
  clientId: "client-test",
  redirectUri: "https://application.invalid.test/callback",
  scope: ["openid", "urn:zitadel:iam:org:id:org-test"],
  prompt: ["PROMPT_LOGIN"],
  uiLocales: ["en"],
  loginHint: "person@invalid.test",
}

function setCookieValueGet(response: Response): string {
  const setCookie = response.headers.get("set-cookie")
  if (!setCookie) throw new Error("Expected the Worker to set a flow cookie")
  return setCookie.split(";", 1)[0] ?? ""
}

afterEach(() => {
  globalThis.fetch = originalFetch
  cooldown.reset()
})

describe("browser, Worker, and ZITADEL email OTP contract", () => {
  test("rotates v1 encrypted state through start, resend, verify, and callback", async () => {
    let zitadelCall = 0
    let cookie = ""
    let currentNow = 1_800_000_000
    const app = workerAppCreate({
      fetch: async (input, init) => {
        const url = String(input)
        const body = init?.body ? JSON.parse(String(init.body)) : undefined
        const call = zitadelCall
        zitadelCall += 1

        expect(init?.headers).toEqual(
          expect.objectContaining({ authorization: `Bearer ${bindings.ZITADEL_LOGIN_CLIENT_PAT}` }),
        )
        if ([0, 1, 6, 8, 10].includes(call)) {
          expect(url).toBe(`${identityOrigin}/v2/oidc/auth_requests/${authRequest.id}`)
          return Response.json({ authRequest })
        }
        if (call === 2) {
          expect(url).toBe(`${identityOrigin}/v2/users`)
          expect(body).toEqual({
            query: { limit: 2 },
            queries: [
              { emailQuery: { emailAddress: "person@invalid.test", method: "TEXT_QUERY_METHOD_EQUALS_IGNORE_CASE" } },
              { organizationIdQuery: { organizationId: "org-test" } },
            ],
          })
          return Response.json({
            result: [
              {
                userId: "user-test",
                state: "USER_STATE_ACTIVE",
                details: { resourceOwner: "org-test" },
                human: { email: { email: "person@invalid.test", isVerified: true } },
              },
            ],
          })
        }
        if (call === 3) return Response.json({ authMethodTypes: ["AUTHENTICATION_METHOD_TYPE_OTP_EMAIL"] })
        if (call === 4) {
          expect(body).toEqual({ checks: { user: { userId: "user-test" } }, lifetime: "900s" })
          return Response.json({ sessionId: "session-test", sessionToken: "created-token" }, { status: 201 })
        }
        if (call === 5) {
          expect(body).toEqual({ challenges: { otpEmail: { sendCode: {} } } })
          return Response.json({ sessionToken: "initial-challenge-token" })
        }
        if (call === 7) {
          expect(body).toEqual({ challenges: { otpEmail: { sendCode: {} } } })
          return Response.json({ sessionToken: "resent-challenge-token" })
        }
        if (call === 9) {
          expect(body).toEqual({ checks: { otpEmail: { code: "654321" } } })
          return Response.json({ sessionToken: "verified-token" })
        }
        if (call === 11) {
          expect(body).toEqual({ session: { sessionId: "session-test", sessionToken: "verified-token" } })
          return Response.json({ callbackUrl: "https://application.invalid.test/callback?code=test&state=test" })
        }
        throw new Error(`Unexpected mocked ZITADEL v4.16 call ${call}`)
      },
      now: () => currentNow,
      randomBytes: (length) => new Uint8Array(length).fill(9),
    })

    globalThis.fetch = async (input, init) => {
      const requestUrl = new URL(String(input))
      expect(requestUrl.origin).toBe(workerOrigin)
      expect(init?.credentials).toBe("include")
      const headers = new Headers(init?.headers)
      headers.set("origin", browserOrigin)
      if (cookie) headers.set("cookie", cookie)
      const response = await app.request(requestUrl, { ...init, headers }, bindings)
      const setCookie = response.headers.get("set-cookie")
      if (setCookie) cookie = setCookieValueGet(response)
      return response
    }

    const initialized = await emailOtpV1ApiRequest(workerOrigin, { type: "initialize", authRequest: authRequest.id })
    expect(initialized).toEqual({
      success: true,
      data: { status: "ready", csrfToken: expect.any(String), loginHint: "person@invalid.test", uiLocales: ["en"] },
    })
    if (!initialized.success || initialized.data.status !== "ready") throw new Error("Expected ready state")
    expect(cookie).not.toContain(authRequest.id)
    expect(cookie).not.toContain("person@invalid.test")

    const started = await emailOtpV1ApiRequest(workerOrigin, {
      type: "start",
      email: "Person@Invalid.Test",
      csrfToken: initialized.data.csrfToken,
    })
    expect(started).toEqual({ success: true, data: { status: "code_sent" } })
    const startedCookie = cookie
    expect(startedCookie).not.toContain("initial-challenge-token")

    currentNow += 60
    const resent = await emailOtpV1ApiRequest(workerOrigin, { type: "resend", csrfToken: initialized.data.csrfToken })
    expect(resent).toEqual({ success: true, data: { status: "code_sent" } })
    expect(cookie).not.toBe(startedCookie)
    expect(cookie).not.toContain("resent-challenge-token")

    const verified = await emailOtpV1ApiRequest(workerOrigin, {
      type: "verify",
      code: "654321",
      csrfToken: initialized.data.csrfToken,
    })
    expect(verified).toEqual({
      success: true,
      data: { status: "verified", continuationUrl: "/api/email-otp/callback" },
    })
    if (!verified.success || verified.data.status !== "verified") throw new Error("Expected verified state")

    const continued = await app.request(
      `${workerOrigin}${verified.data.continuationUrl}`,
      { headers: { cookie } },
      bindings,
    )
    expect(continued.status).toBe(302)
    expect(continued.headers.get("location")).toBe("https://application.invalid.test/callback?code=test&state=test")
    expect(continued.headers.get("set-cookie")).toContain("Max-Age=0")
    expect(zitadelCall).toBe(12)
  })

  test("runs client v2 flow initialization, start, resend, verify, resume, and continuation end-to-end", async () => {
    let zitadelCall = 0
    let cookie = ""
    let token = "token-created"
    let currentNow = 1_800_000_000
    const app = workerAppCreate({
      fetch: async (input, init) => {
        const url = String(input)
        const method = init?.method ?? "GET"
        const body = init?.body ? JSON.parse(String(init.body)) : undefined
        zitadelCall += 1

        if (url === `${identityOrigin}/v2/oidc/auth_requests/${authRequest.id}` && method === "GET") {
          return Response.json({ authRequest })
        }
        if (url === `${identityOrigin}/v2/settings/login` && method === "GET") {
          return Response.json({
            settings: {
              allowLocalAuthentication: true,
              ignoreUnknownUsernames: false,
            },
          })
        }
        if (url === `${identityOrigin}/v2/users` && method === "POST") {
          return Response.json({
            result: [
              {
                userId: "user-v2",
                state: "USER_STATE_ACTIVE",
                details: { resourceOwner: "org-test" },
                human: { email: { email: "person@invalid.test", isVerified: true } },
              },
            ],
          })
        }
        if (url === `${identityOrigin}/v2/users/user-v2/authentication_methods` && method === "GET") {
          return Response.json({ authMethodTypes: ["AUTHENTICATION_METHOD_TYPE_OTP_EMAIL"] })
        }
        if (url === `${identityOrigin}/v2/users/user-v2` && method === "GET") {
          return Response.json({
            user: {
              userId: "user-v2",
              state: "USER_STATE_ACTIVE",
              details: { resourceOwner: "org-test" },
              human: { email: { email: "person@invalid.test", isVerified: true } },
            },
          })
        }
        if (url === `${identityOrigin}/v2/sessions` && method === "POST") {
          token = "token-created"
          return Response.json({ sessionId: "session-v2", sessionToken: token }, { status: 201 })
        }
        if (url === `${identityOrigin}/v2/sessions/session-v2` && method === "PATCH") {
          token = body?.checks?.otpEmail ? "token-verified" : "token-resent"
          return Response.json({ sessionToken: token })
        }
        if (url.startsWith(`${identityOrigin}/v2/sessions/session-v2?`) && method === "GET") {
          const query = new URL(url).searchParams
          if (query.get("sessionToken") !== token) return Response.json({}, { status: 401 })
          return Response.json({
            session: {
              id: "session-v2",
              expirationDate: "2027-02-01T00:00:00Z",
              factors: {
                user: { id: "user-v2", organizationId: "org-test" },
                otpEmail: { verifiedAt: new Date(1_800_000_000 * 1000).toISOString() },
              },
            },
          })
        }
        if (url === `${identityOrigin}/v2/oidc/auth_requests/${authRequest.id}` && method === "POST") {
          return Response.json({ callbackUrl: "https://application.invalid.test/callback?code=v2code&state=v2state" })
        }
        throw new Error(`Unexpected v2 test native request: ${method} ${url}`)
      },
      now: () => currentNow,
      randomBytes: (length) => new Uint8Array(length).fill(7),
    })

    globalThis.fetch = async (input, init) => {
      const requestUrl = new URL(String(input))
      expect(requestUrl.origin).toBe(workerOrigin)
      expect(init?.credentials).toBe("include")
      const headers = new Headers(init?.headers)
      headers.set("origin", browserOrigin)
      if (cookie) headers.set("cookie", cookie)
      const response = await app.request(requestUrl, { ...init, headers }, bindings)
      const setCookie = response.headers.get("set-cookie")
      if (setCookie) cookie = setCookieValueGet(response)
      return response
    }

    const initialized = await flowV2InitializeApiRequest(workerOrigin, authRequest.id)
    expect(initialized.success).toBe(true)
    if (!initialized.success || initialized.data.kind !== "render") throw new Error("Expected render transition")

    const flowHandle = new URL(`${workerOrigin}${initialized.data.route}`).searchParams.get("flow") ?? ""
    expect(flowHandle).toMatch(/^[A-Za-z0-9_-]{22}$/)
    const csrfToken = initialized.data.csrfToken

    const resumed = await flowV2ResumeApiRequest(workerOrigin, flowHandle)
    expect(resumed).toEqual(initialized)

    const started = await emailOtpV2StartApiRequest(workerOrigin, flowHandle, {
      email: "Person@Invalid.Test",
      csrfToken,
    })
    expect(started.success).toBe(true)

    currentNow += 60
    const resent = await emailOtpV2ResendApiRequest(workerOrigin, flowHandle, { csrfToken })
    expect(resent.success).toBe(true)

    const verified = await emailOtpV2VerifyApiRequest(workerOrigin, flowHandle, { code: "654321", csrfToken })
    expect(verified).toEqual({
      success: true,
      data: { kind: "complete", path: `/api/v2/flow/continue?flow=${flowHandle}` },
    })
    if (!verified.success || verified.data.kind !== "complete") throw new Error("Expected complete transition")

    const continued = await app.request(`${workerOrigin}${verified.data.path}`, { headers: { cookie } }, bindings)
    expect(continued.status).toBe(302)
    expect(continued.headers.get("location")).toBe(
      "https://application.invalid.test/callback?code=v2code&state=v2state",
    )
  })
})
