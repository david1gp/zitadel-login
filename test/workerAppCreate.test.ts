import { describe, expect, test } from "bun:test"

import type { WorkerBindingsInput } from "../src/config/workerBindingsSchema"
import { flowCookieSeal } from "../src/flow/flowCookieSeal"
import { workerAppCreate } from "../src/worker/workerAppCreate"

const rateLimiter = {
  limit: async (_options: { key: string }) => ({ success: true }),
}

const bindings: WorkerBindingsInput = {
  ZITADEL_ORIGIN: "https://identity.example",
  ZITADEL_ORGANIZATION_ID: "org-1",
  ZITADEL_ALLOWED_CLIENT_IDS: "client-1",
  LOGIN_V2_FALLBACK_URL: "https://identity.example/ui/v2/login",
  PAGES_ORIGIN: "https://login.example",
  SESSION_LIFETIME_SECONDS: "900",
  ZITADEL_LOGIN_CLIENT_PAT: "test-pat-not-a-real-secret-value",
  FLOW_COOKIE_KEY: "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA",
  RATE_LIMITER: rateLimiter,
}

const authRequest = {
  id: "request-1",
  clientId: "client-1",
  redirectUri: "https://client.example/callback",
  scope: ["openid", "urn:zitadel:iam:org:id:org-1"],
  prompt: ["PROMPT_LOGIN"],
  uiLocales: ["de"],
  loginHint: "person@example.com",
}

const silentAuthRequest = { ...authRequest, id: "silent-1", prompt: ["PROMPT_NONE"] }

function jsonResponse(body: unknown, status = 200): Response {
  return Response.json(body, { status })
}

function cookieGet(response: Response): string {
  const setCookie = response.headers.get("set-cookie")
  if (!setCookie) throw new Error("Expected Set-Cookie header")
  return setCookie.split(";", 1)[0] ?? ""
}

function postHeaders(cookie: string): HeadersInit {
  return {
    origin: bindings.PAGES_ORIGIN,
    "content-type": "application/json",
    cookie,
  }
}

describe("Worker native email OTP flow", () => {
  test("uses rotated session tokens and redirects the callback without exposing it as JSON", async () => {
    let call = 0
    const fetchMock = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
      const url = String(input)
      const body = init?.body ? JSON.parse(String(init.body)) : undefined
      const current = call
      call += 1

      if ([0, 1, 6, 8].includes(current)) {
        expect(url).toBe(`https://identity.example/v2/oidc/auth_requests/${authRequest.id}`)
        expect(init?.headers).toEqual(
          expect.objectContaining({ authorization: `Bearer ${bindings.ZITADEL_LOGIN_CLIENT_PAT}` }),
        )
        return jsonResponse({ authRequest })
      }
      if (current === 2) {
        expect(url).toBe("https://identity.example/v2/users")
        expect(body.query.limit).toBe(2)
        expect(body.queries).toContainEqual({ organizationIdQuery: { organizationId: "org-1" } })
        return jsonResponse({
          result: [
            {
              userId: "user-1",
              state: "USER_STATE_ACTIVE",
              details: { resourceOwner: "org-1" },
              human: { email: { email: "person@example.com", isVerified: true } },
            },
          ],
        })
      }
      if (current === 3) {
        expect(url).toBe("https://identity.example/v2/users/user-1/authentication_methods")
        return jsonResponse({ authMethodTypes: ["AUTHENTICATION_METHOD_TYPE_OTP_EMAIL"] })
      }
      if (current === 4) {
        expect(url).toBe("https://identity.example/v2/sessions")
        expect(body).toEqual({ checks: { user: { userId: "user-1" } }, lifetime: "900s" })
        return jsonResponse({ sessionId: "session-1", sessionToken: "created-token" }, 201)
      }
      if (current === 5) {
        expect(body).toEqual({ challenges: { otpEmail: { sendCode: {} } } })
        return jsonResponse({ sessionToken: "challenged-token" })
      }
      if (current === 7) {
        expect(body).toEqual({ checks: { otpEmail: { code: "123456" } } })
        return jsonResponse({ sessionToken: "verified-latest-token" })
      }
      if (current === 9) {
        expect(url).toBe(`https://identity.example/v2/oidc/auth_requests/${authRequest.id}`)
        expect(body).toEqual({
          session: { sessionId: "session-1", sessionToken: "verified-latest-token" },
        })
        return jsonResponse({ callbackUrl: "https://client.example/callback?code=credential&state=state" })
      }
      throw new Error(`Unexpected fetch call ${current}`)
    }
    const app = workerAppCreate({
      fetch: fetchMock,
      now: () => 1_800_000_000,
      randomBytes: (length) => new Uint8Array(length).fill(7),
    })

    const initialized = await app.request(
      `https://worker.example/api/auth-request?authRequest=${authRequest.id}`,
      { headers: { origin: bindings.PAGES_ORIGIN } },
      bindings,
    )
    expect(initialized.status).toBe(200)
    expect(initialized.headers.get("cache-control")).toBe("no-store")
    expect(initialized.headers.get("access-control-allow-origin")).toBe(bindings.PAGES_ORIGIN)
    const initializedBody = await initialized.json()
    expect(initializedBody).toEqual({
      status: "ready",
      csrfToken: expect.any(String),
      loginHint: "person@example.com",
      uiLocales: ["de"],
    })
    const requestCookie = cookieGet(initialized)
    expect(requestCookie).not.toContain(authRequest.id)
    expect(requestCookie).not.toContain("person@example.com")

    const started = await app.request(
      "https://worker.example/api/email-otp/start",
      {
        method: "POST",
        headers: postHeaders(requestCookie),
        body: JSON.stringify({ email: "Person@Example.com", csrfToken: initializedBody.csrfToken }),
      },
      bindings,
    )
    expect(started.status).toBe(202)
    expect(await started.json()).toEqual({ status: "code_sent" })
    const otpCookie = cookieGet(started)
    expect(otpCookie).not.toContain("challenged-token")

    const verified = await app.request(
      "https://worker.example/api/email-otp/verify",
      {
        method: "POST",
        headers: postHeaders(otpCookie),
        body: JSON.stringify({ code: "123456", csrfToken: initializedBody.csrfToken }),
      },
      bindings,
    )
    expect(verified.status).toBe(200)
    expect(await verified.json()).toEqual({
      status: "verified",
      continuationUrl: "/api/email-otp/callback",
    })
    const verifiedCookie = cookieGet(verified)

    const continued = await app.request(
      "https://worker.example/api/email-otp/callback",
      { headers: { cookie: verifiedCookie } },
      bindings,
    )
    expect(continued.status).toBe(302)
    expect(continued.headers.get("location")).toBe("https://client.example/callback?code=credential&state=state")
    expect(continued.headers.get("set-cookie")).toContain("Max-Age=0")
    expect(call).toBe(10)
  })

  test("completes prompt none with login_required instead of starting interaction", async () => {
    let call = 0
    const fetchMock = async (_input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
      call += 1
      if (call <= 2) return jsonResponse({ authRequest: silentAuthRequest })
      expect(JSON.parse(String(init?.body))).toEqual({ error: { error: "ERROR_REASON_LOGIN_REQUIRED" } })
      return jsonResponse({ callbackUrl: "https://client.example/callback?error=login_required&state=state" })
    }
    const app = workerAppCreate({ fetch: fetchMock })
    const initialized = await app.request(
      `https://worker.example/api/auth-request?authRequest=${silentAuthRequest.id}`,
      { headers: { origin: bindings.PAGES_ORIGIN } },
      bindings,
    )

    expect(initialized.status).toBe(200)
    expect(await initialized.json()).toEqual({ status: "continue", continuationUrl: "/api/prompt-none" })

    const response = await app.request(
      "https://worker.example/api/prompt-none",
      { headers: { cookie: cookieGet(initialized) } },
      bindings,
    )
    expect(response.status).toBe(302)
    expect(response.headers.get("location")).toBe("https://client.example/callback?error=login_required&state=state")
    expect(call).toBe(3)
  })

  test("falls back through the trusted Login V2 origin for ambiguous users", async () => {
    let call = 0
    const fetchMock = async (): Promise<Response> => {
      call += 1
      if ([1, 2, 4].includes(call)) return jsonResponse({ authRequest })
      if (call === 3) {
        return jsonResponse({
          result: [
            { userId: "user-1", state: "USER_STATE_ACTIVE" },
            { userId: "user-2", state: "USER_STATE_ACTIVE" },
          ],
        })
      }
      throw new Error(`Unexpected fetch call ${call}`)
    }
    const app = workerAppCreate({ fetch: fetchMock })
    const initialized = await app.request(
      `https://worker.example/api/auth-request?authRequest=${authRequest.id}`,
      { headers: { origin: bindings.PAGES_ORIGIN } },
      bindings,
    )
    const body = await initialized.json()
    const cookie = cookieGet(initialized)
    const started = await app.request(
      "https://worker.example/api/email-otp/start",
      {
        method: "POST",
        headers: postHeaders(cookie),
        body: JSON.stringify({ email: "person@example.com", csrfToken: body.csrfToken }),
      },
      bindings,
    )
    expect(await started.json()).toEqual({ status: "fallback", fallbackUrl: "/api/fallback" })

    const fallback = await app.request("https://worker.example/api/fallback", { headers: { cookie } }, bindings)
    expect(fallback.status).toBe(302)
    expect(fallback.headers.get("location")).toBe("https://identity.example/ui/v2/login?authRequest=request-1")
    expect(call).toBe(4)
  })

  test("rejects cross-origin mutation before calling ZITADEL", async () => {
    let called = false
    const app = workerAppCreate({
      fetch: async () => {
        called = true
        return jsonResponse({})
      },
    })
    const response = await app.request(
      "https://worker.example/api/email-otp/start",
      {
        method: "POST",
        headers: { origin: "https://attacker.example", "content-type": "application/json" },
        body: JSON.stringify({ email: "person@example.com", csrfToken: "A".repeat(43) }),
      },
      bindings,
    )

    expect(response.status).toBe(403)
    expect(called).toBe(false)
  })

  test("rejects malformed and expired flow cookies", async () => {
    const now = 1_800_000_000
    const app = workerAppCreate({
      now: () => now,
      fetch: async () => {
        throw new Error("ZITADEL must not be called")
      },
    })
    const request = (cookie: string) =>
      app.request(
        "https://worker.example/api/email-otp/start",
        {
          method: "POST",
          headers: postHeaders(cookie),
          body: JSON.stringify({ email: "person@example.com", csrfToken: "A".repeat(43) }),
        },
        bindings,
      )

    const malformed = await request("__Host-zitadel-login-flow=not-a-cookie")
    expect(malformed.status).toBe(409)

    const sealed = await flowCookieSeal(
      {
        version: 1,
        stage: "request",
        authRequestId: "request-1",
        clientId: "client-1",
        csrfToken: "A".repeat(43),
        issuedAt: now - 120,
        expiresAt: now - 1,
      },
      bindings.FLOW_COOKIE_KEY,
      new Uint8Array(12).fill(1),
    )
    if (!sealed.success) throw new Error("Expected an expired cookie to seal")
    const expired = await request(`__Host-zitadel-login-flow=${sealed.data}`)
    expect(expired.status).toBe(409)
  })

  test("rejects an unsafe callback URL returned by ZITADEL", async () => {
    let call = 0
    const app = workerAppCreate({
      fetch: async (_input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
        call += 1
        if (call <= 2) return jsonResponse({ authRequest: silentAuthRequest })
        expect(JSON.parse(String(init?.body))).toEqual({ error: { error: "ERROR_REASON_LOGIN_REQUIRED" } })
        return jsonResponse({ callbackUrl: "https://attacker.example/callback?error=login_required&state=state" })
      },
    })

    const initialized = await app.request(
      `https://worker.example/api/auth-request?authRequest=${silentAuthRequest.id}`,
      { headers: { origin: bindings.PAGES_ORIGIN } },
      bindings,
    )
    const response = await app.request(
      "https://worker.example/api/prompt-none",
      { headers: { cookie: cookieGet(initialized) } },
      bindings,
    )
    expect(response.status).toBe(502)
    expect(await response.json()).toEqual({
      error: { code: "callback_unavailable", message: "The sign-in request could not be completed." },
    })
  })

  test("does not expose a ZITADEL error response", async () => {
    const app = workerAppCreate({
      fetch: async () => jsonResponse({ error: { message: "internal details" } }, 500),
      logger: { warn: () => undefined, error: () => undefined },
    })
    const response = await app.request(
      `https://worker.example/api/auth-request?authRequest=${authRequest.id}`,
      { headers: { origin: bindings.PAGES_ORIGIN } },
      bindings,
    )
    expect(response.status).toBe(403)
    expect(await response.json()).toEqual({
      error: { code: "invalid_request", message: "Invalid sign-in request." },
    })
  })

  test("fails closed when configuration is missing", async () => {
    const response = await workerAppCreate().request("https://worker.example/api/auth-request?authRequest=request-1")
    expect(response.status).toBe(500)
    expect(await response.json()).toEqual({
      error: { code: "service_unavailable", message: "The sign-in service is not configured." },
    })
  })

  test("rate limits with opaque keys", async () => {
    const keys: string[] = []
    const app = workerAppCreate({
      fetch: async () => jsonResponse({ authRequest }),
    })
    const limitedBindings = {
      ...bindings,
      RATE_LIMITER: {
        limit: async ({ key }: { key: string }) => {
          keys.push(key)
          return { success: !key.startsWith("otp-start:email:") }
        },
      },
    }
    const initialized = await app.request(
      `https://worker.example/api/auth-request?authRequest=${authRequest.id}`,
      { headers: { origin: bindings.PAGES_ORIGIN } },
      limitedBindings,
    )
    const body = await initialized.json()
    const response = await app.request(
      "https://worker.example/api/email-otp/start",
      {
        method: "POST",
        headers: postHeaders(cookieGet(initialized)),
        body: JSON.stringify({ email: "Person@Example.com", csrfToken: body.csrfToken }),
      },
      limitedBindings,
    )
    expect(response.status).toBe(429)
    expect(response.headers.get("retry-after")).toBe("60")
    expect(keys.some((key) => key.includes("person@example.com"))).toBe(false)
  })
})
