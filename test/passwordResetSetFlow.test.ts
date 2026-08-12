import { describe, expect, test } from "bun:test"

import type { WorkerBindingsInput } from "../src/config/workerBindingsSchema"
import { passwordResetCookieOpen } from "../src/password-recovery/domain/passwordResetCookieOpen"
import { passwordResetCookieSeal } from "../src/password-recovery/domain/passwordResetCookieSeal"
import { passwordResetCookieName } from "../src/password-recovery/model/passwordResetCookieName"
import type { PasswordResetCookie } from "../src/password-recovery/model/passwordResetCookieSchema"
import { workerAppCreate } from "../src/worker/workerAppCreate"

const origin = "https://login.example"
const identityOrigin = "https://identity.example"
const key = "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA"
const now = 1_800_000_000
const userId = "secret-user-id"
const verificationCode = "A1B2C3"
const csrfToken = "C".repeat(43)
const password = "New-password-secret-123!"

const bindings: WorkerBindingsInput = {
  ZITADEL_ORIGIN: identityOrigin,
  ZITADEL_ORGANIZATION_ID: "org-1",
  ZITADEL_ALLOWED_CLIENT_IDS: "client-1",
  LOGIN_V2_FALLBACK_URL: `${identityOrigin}/ui/v2/login`,
  PAGES_ORIGIN: origin,
  SESSION_LIFETIME_SECONDS: "900",
  ZITADEL_LOGIN_CLIENT_PAT: "test-pat-not-a-real-secret-value",
  FLOW_COOKIE_KEY: key,
  ZITADEL_PASSWORD_RESET_V2_ENABLED: "true",
  RATE_LIMITER: { limit: async () => ({ success: true }) },
}

function state(overrides: Partial<PasswordResetCookie> = {}): PasswordResetCookie {
  return {
    version: 1,
    purpose: "password_reset",
    userId,
    organizationId: "org-1",
    verificationCode,
    issuedAt: now,
    expiresAt: now + 600,
    transition: 1,
    csrfToken,
    ...overrides,
  } as PasswordResetCookie
}

async function stateSeal(input = state(), ivByte = 1) {
  const result = await passwordResetCookieSeal(input, key, new Uint8Array(12).fill(ivByte))
  if (!result.success) throw new Error("Expected reset state to seal")
  return result.data
}

function requestCreate(
  cookie: string | undefined,
  options: {
    body?: string
    contentType?: string | null
    ip?: string
    originHeader?: string | null
    urlOrigin?: string
    extraCookie?: string
  } = {},
) {
  const headers = new Headers()
  if (cookie) {
    headers.set(
      "cookie",
      `${options.extraCookie ? `${options.extraCookie}; ` : ""}${passwordResetCookieName}=${cookie}`,
    )
  }
  if (options.contentType !== null) headers.set("content-type", options.contentType ?? "application/json")
  if (options.originHeader !== null) headers.set("origin", options.originHeader ?? origin)
  if (options.ip) headers.set("cf-connecting-ip", options.ip)
  return new Request(`${options.urlOrigin ?? origin}/api/v2/password/reset/set`, {
    method: "POST",
    headers,
    body: options.body ?? JSON.stringify({ password, csrfToken }),
  })
}

function cookieValueGet(header: string | null): string {
  if (!header) return ""
  const pair = header.split(";", 1)[0] ?? ""
  return pair.slice(pair.indexOf("=") + 1)
}

function userBodyCreate(overrides: { human?: unknown; organizationId?: string; state?: string; userId?: string } = {}) {
  return {
    user: {
      userId: overrides.userId ?? userId,
      state: overrides.state ?? "USER_STATE_ACTIVE",
      details: { resourceOwner: overrides.organizationId ?? "org-1" },
      ...(overrides.human === null ? {} : { human: overrides.human ?? {} }),
    },
  }
}

function nativeCreate(
  options: { passwordBody?: unknown; passwordStatus?: number; userBody?: unknown; userStatus?: number } = {},
) {
  const calls: Array<{ body?: unknown; method: string; url: string }> = []
  const fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input)
    calls.push({
      body: init?.body === undefined ? undefined : JSON.parse(String(init.body)),
      method: init?.method ?? "GET",
      url,
    })
    if (init?.method !== "POST") {
      return Response.json(options.userBody ?? userBodyCreate(), { status: options.userStatus ?? 200 })
    }
    return Response.json(options.passwordBody ?? { details: { sequence: "4", resourceOwner: "org-1" } }, {
      status: options.passwordStatus ?? 200,
    })
  }
  return { calls, fetch }
}

describe("password reset set flow", () => {
  test("rate limits opaque reset-state and IP scopes before the exact native mutation", async () => {
    const events: string[] = []
    const keys: string[] = []
    const native = nativeCreate()
    const app = workerAppCreate({
      fetch: async (input, init) => {
        events.push("native")
        return native.fetch(input, init)
      },
      now: () => now,
    })
    const response = await app.fetch(requestCreate(await stateSeal(), { ip: "203.0.113.42" }), {
      ...bindings,
      RATE_LIMITER: {
        limit: async ({ key: rateKey }) => {
          events.push("limit")
          keys.push(rateKey)
          return { success: true }
        },
      },
    })

    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ success: true, data: { status: "complete" } })
    expect(events).toEqual(["limit", "limit", "native", "native"])
    expect(keys[0]).toMatch(/^password-reset-set:state:[A-Za-z0-9_-]{43}$/)
    expect(keys[1]).toMatch(/^password-reset-set:ip:[A-Za-z0-9_-]{43}$/)
    expect(JSON.stringify(keys)).not.toContain(userId)
    expect(JSON.stringify(keys)).not.toContain(verificationCode)
    expect(JSON.stringify(keys)).not.toContain("203.0.113.42")
    expect(native.calls).toEqual([
      {
        method: "GET",
        url: `${identityOrigin}/v2/users/${userId}`,
        body: undefined,
      },
      {
        method: "POST",
        url: `${identityOrigin}/v2/users/${userId}/password`,
        body: {
          newPassword: { password, changeRequired: false },
          verificationCode,
        },
      },
    ])
    expect(response.headers.get("set-cookie")).toBe(
      `${passwordResetCookieName}=; Path=/; Max-Age=0; HttpOnly; Secure; SameSite=Lax`,
    )
  })

  test("rejects origin, content type, CSRF, bounds, confirmation, and extra input before native mutation", async () => {
    const native = nativeCreate()
    const app = workerAppCreate({ fetch: native.fetch, now: () => now })
    const cookie = await stateSeal()
    const cases: Array<[Request, number, string]> = [
      [requestCreate(cookie, { originHeader: null }), 403, "origin_rejected"],
      [requestCreate(cookie, { originHeader: "https://evil.example" }), 403, "origin_rejected"],
      [requestCreate(cookie, { urlOrigin: "https://evil.example" }), 403, "origin_rejected"],
      [requestCreate(cookie, { contentType: "application/json; charset=utf-8" }), 415, "unsupported_media_type"],
      [requestCreate(cookie, { body: JSON.stringify({ password: "", csrfToken }) }), 400, "invalid_payload"],
      [
        requestCreate(cookie, { body: JSON.stringify({ password: "x".repeat(201), csrfToken }) }),
        400,
        "invalid_payload",
      ],
      [requestCreate(cookie, { body: JSON.stringify({ password, csrfToken: "short" }) }), 400, "invalid_payload"],
      [
        requestCreate(cookie, { body: JSON.stringify({ password, passwordConfirmation: password, csrfToken }) }),
        400,
        "invalid_payload",
      ],
      [requestCreate(cookie, { body: JSON.stringify({ password, csrfToken, extra: true }) }), 400, "invalid_payload"],
      [requestCreate(cookie, { body: JSON.stringify({ password, csrfToken: "D".repeat(43) }) }), 403, "csrf_rejected"],
    ]

    for (const [request, status, errorMessage] of cases) {
      const response = await app.fetch(request, bindings)
      expect(response.status).toBe(status)
      const body = await response.json()
      if (errorMessage === "origin_rejected" && request.headers.get("origin") === "https://evil.example") {
        expect(body).toEqual({ error: { code: "origin_rejected", message: "Request origin rejected." } })
      } else {
        expect(body).toEqual({ success: false, op: "passwordResetSet", errorMessage })
      }
    }
    expect(native.calls).toHaveLength(0)
  })

  test("rotates CSRF and preserves only sealed retry state on exact native policy rejection", async () => {
    const native = nativeCreate({
      passwordBody: { id: "DOMAIN-HuJf6", message: "native policy secret" },
      passwordStatus: 400,
    })
    const app = workerAppCreate({
      fetch: native.fetch,
      now: () => now,
      randomBytes: (length) => new Uint8Array(length).fill(length === 32 ? 8 : 9),
    })
    const response = await app.fetch(requestCreate(await stateSeal()), bindings)
    const body = await response.json()

    expect(response.status).toBe(400)
    expect(body).toEqual({
      success: false,
      op: "passwordResetSet",
      errorMessage: "password_policy_invalid",
      csrfToken: expect.stringMatching(/^[A-Za-z0-9_-]{43}$/),
      expiresAt: now + 600,
    })
    expect(body.csrfToken).not.toBe(csrfToken)
    const opened = await passwordResetCookieOpen(cookieValueGet(response.headers.get("set-cookie")), [key], now, [1])
    expect(opened).toEqual({ success: true, data: { ...state(), csrfToken: body.csrfToken } })
    const exposed = JSON.stringify(body)
    for (const hidden of [password, userId, verificationCode, "native policy secret", identityOrigin]) {
      expect(exposed).not.toContain(hidden)
    }
  })

  test("clears invalid, expired, foreign-org, duplicate, and terminal native link state", async () => {
    const terminalIds = ["CODE-QvUQ4P", "CODE-woT0xc", "CRYPT-aqrFV", "COMMAND-G8dh3", "COMMAND-M9dse"]
    const localCases = [
      undefined,
      "malformed",
      await stateSeal(state({ issuedAt: now - 601, expiresAt: now - 1 }), 2),
      await stateSeal(state({ organizationId: "other-org" }), 3),
    ]

    for (const cookie of localCases) {
      const native = nativeCreate()
      const response = await workerAppCreate({ fetch: native.fetch, now: () => now }).fetch(
        requestCreate(cookie),
        bindings,
      )
      expect(response.status).toBe(409)
      expect(await response.json()).toEqual({ success: false, op: "passwordResetSet", errorMessage: "invalid_link" })
      expect(response.headers.get("set-cookie")).toContain(`${passwordResetCookieName}=;`)
      expect(native.calls).toHaveLength(0)
    }

    const valid = await stateSeal()
    const duplicate = requestCreate(valid, { extraCookie: `${passwordResetCookieName}=${valid}` })
    const duplicateResponse = await workerAppCreate({ now: () => now }).fetch(duplicate, bindings)
    expect(duplicateResponse.status).toBe(409)
    expect(duplicateResponse.headers.get("set-cookie")).toContain(`${passwordResetCookieName}=;`)

    for (const id of terminalIds) {
      const native = nativeCreate({ passwordBody: { id, message: `${id} native secret` }, passwordStatus: 400 })
      const response = await workerAppCreate({ fetch: native.fetch, now: () => now }).fetch(
        requestCreate(await stateSeal()),
        bindings,
      )
      expect(response.status).toBe(409)
      expect(await response.json()).toEqual({ success: false, op: "passwordResetSet", errorMessage: "invalid_link" })
      expect(response.headers.get("set-cookie")).toContain(`${passwordResetCookieName}=;`)
    }

    const accountCases = [
      { userBody: userBodyCreate({ organizationId: "other-org" }) },
      { userBody: userBodyCreate({ state: "USER_STATE_LOCKED" }) },
      { userBody: userBodyCreate({ human: null }) },
      { userBody: userBodyCreate({ userId: "other-user" }) },
      { userBody: { id: "QUERY-Dfbg2", message: "native account secret" }, userStatus: 404 },
    ]
    for (const options of accountCases) {
      const native = nativeCreate(options)
      const response = await workerAppCreate({ fetch: native.fetch, now: () => now }).fetch(
        requestCreate(await stateSeal()),
        bindings,
      )
      expect(response.status).toBe(409)
      expect(await response.json()).toEqual({ success: false, op: "passwordResetSet", errorMessage: "invalid_link" })
      expect(response.headers.get("set-cookie")).toContain(`${passwordResetCookieName}=;`)
      expect(native.calls.some((call) => call.method === "POST")).toBe(false)
    }
  })

  test("makes a successful cookie replay terminal without creating a Session or OIDC continuation", async () => {
    let mutation = 0
    const calls: string[] = []
    const app = workerAppCreate({
      now: () => now,
      fetch: async (input) => {
        calls.push(String(input))
        if (!String(input).endsWith("/password")) return Response.json(userBodyCreate())
        mutation += 1
        if (mutation === 1) return Response.json({})
        return Response.json({ id: "CRYPT-aqrFV", message: "consumed native secret" }, { status: 400 })
      },
    })
    const cookie = await stateSeal()
    const first = await app.fetch(requestCreate(cookie), bindings)
    const replay = await app.fetch(requestCreate(cookie), bindings)

    expect(first.status).toBe(200)
    expect(replay.status).toBe(409)
    expect(await replay.json()).toEqual({ success: false, op: "passwordResetSet", errorMessage: "invalid_link" })
    expect(replay.headers.get("set-cookie")).toContain(`${passwordResetCookieName}=;`)
    expect(calls).toEqual([
      `${identityOrigin}/v2/users/${userId}`,
      `${identityOrigin}/v2/users/${userId}/password`,
      `${identityOrigin}/v2/users/${userId}`,
      `${identityOrigin}/v2/users/${userId}/password`,
    ])
    expect(calls.some((url) => url.includes("/v2/sessions") || url.includes("/oidc/"))).toBe(false)
  })

  test("returns generic unavailable for rate and native infrastructure failures without state or log leaks", async () => {
    const logs: Array<{ event: string; context?: Record<string, number | string> }> = []
    const logger = {
      warn: () => {},
      error: (event: string, context?: Record<string, number | string>) => logs.push({ event, context }),
    }
    const cookie = await stateSeal()
    const limitedNative = nativeCreate()
    const limited = await workerAppCreate({ fetch: limitedNative.fetch, now: () => now, logger }).fetch(
      requestCreate(cookie),
      { ...bindings, RATE_LIMITER: { limit: async () => ({ success: false }) } },
    )
    const failed = await workerAppCreate({
      fetch: async (input) =>
        String(input).endsWith("/password")
          ? Response.json({ id: "UNCLASSIFIED", message: "native infrastructure secret" }, { status: 503 })
          : Response.json(userBodyCreate()),
      now: () => now,
      logger,
    }).fetch(requestCreate(cookie), bindings)
    const accountFailed = await workerAppCreate({
      fetch: async () => Response.json({ id: "UNCLASSIFIED", message: "native account secret" }, { status: 503 }),
      now: () => now,
      logger,
    }).fetch(requestCreate(cookie), bindings)

    for (const response of [limited, failed, accountFailed]) {
      expect(response.status).toBe(503)
      expect(await response.json()).toEqual({
        success: false,
        op: "passwordResetSet",
        errorMessage: "service_unavailable",
      })
      expect(response.headers.get("set-cookie")).toBeNull()
    }
    expect(limitedNative.calls).toHaveLength(0)
    const exposed = JSON.stringify(logs)
    for (const hidden of [password, userId, verificationCode, csrfToken, "native", "infrastructure secret"]) {
      expect(exposed).not.toContain(hidden)
    }
  })
})
