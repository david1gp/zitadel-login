import { afterEach, describe, expect, test } from "bun:test"

import { loginApiRequest } from "../client/src/login/loginApiRequest"
import type { WorkerBindingsInput } from "../src/config/workerBindingsSchema"
import { workerAppCreate } from "../src/worker/workerAppCreate"

const browserOrigin = "https://login.invalid.test"
const workerOrigin = "https://worker.invalid.test"
const identityOrigin = "https://identity.invalid.test"
const originalFetch = globalThis.fetch

const bindings: WorkerBindingsInput = {
  ZITADEL_ORIGIN: identityOrigin,
  ZITADEL_ORGANIZATION_ID: "org-test",
  ZITADEL_ALLOWED_CLIENT_IDS: "client-test",
  LOGIN_V2_FALLBACK_URL: `${identityOrigin}/ui/v2/login`,
  PAGES_ORIGIN: browserOrigin,
  SESSION_LIFETIME_SECONDS: "900",
  ZITADEL_LOGIN_CLIENT_PAT: "test-pat-not-a-secret-value",
  FLOW_COOKIE_KEY: "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA",
  RATE_LIMITER: { limit: async () => ({ success: true }) },
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
})

describe("browser, Worker, and ZITADEL email OTP contract", () => {
  test("rotates encrypted state through start, resend, verify, and callback", async () => {
    let zitadelCall = 0
    let cookie = ""
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
      now: () => 1_800_000_000,
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

    const initialized = await loginApiRequest(workerOrigin, { type: "initialize", authRequest: authRequest.id })
    expect(initialized).toEqual({
      success: true,
      data: { status: "ready", csrfToken: expect.any(String), loginHint: "person@invalid.test", uiLocales: ["en"] },
    })
    if (!initialized.success || initialized.data.status !== "ready") throw new Error("Expected ready state")
    expect(cookie).not.toContain(authRequest.id)
    expect(cookie).not.toContain("person@invalid.test")

    const started = await loginApiRequest(workerOrigin, {
      type: "start",
      email: "Person@Invalid.Test",
      csrfToken: initialized.data.csrfToken,
    })
    expect(started).toEqual({ success: true, data: { status: "code_sent" } })
    const startedCookie = cookie
    expect(startedCookie).not.toContain("initial-challenge-token")

    const resent = await loginApiRequest(workerOrigin, { type: "resend", csrfToken: initialized.data.csrfToken })
    expect(resent).toEqual({ success: true, data: { status: "code_sent" } })
    expect(cookie).not.toBe(startedCookie)
    expect(cookie).not.toContain("resent-challenge-token")

    const verified = await loginApiRequest(workerOrigin, {
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
})
