import { describe, expect, test } from "bun:test"

import type { WorkerBindingsInput } from "../src/config/workerBindingsSchema"
import { passwordRecoveryCookieOpen } from "../src/password-recovery/domain/passwordRecoveryCookieOpen"
import { passwordRecoveryCookieSeal } from "../src/password-recovery/domain/passwordRecoveryCookieSeal"
import { passwordRecoveryCookieName } from "../src/password-recovery/model/passwordRecoveryCookieName"
import type { PasswordRecoveryCookie } from "../src/password-recovery/model/passwordRecoveryCookieSchema"
import { workerAppCreate } from "../src/worker/workerAppCreate"

const origin = "https://login.example"
const identityOrigin = "https://identity.example"
const key = "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA"
const now = 1_800_000_000
const email = "secret-person@example.com"
const csrfToken = "C".repeat(43)

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

type NativeOptions = {
  users?: unknown[]
  usersStatus?: number
  methods?: string[]
  methodsStatus?: number
  resetStatus?: number
}

function userCreate(
  overrides: {
    userId?: string
    state?: string
    organizationId?: string
    email?: string
    verified?: boolean
    human?: boolean
  } = {},
) {
  return {
    userId: overrides.userId ?? "secret-user-id",
    state: overrides.state ?? "USER_STATE_ACTIVE",
    details: { resourceOwner: overrides.organizationId ?? "org-1" },
    ...(overrides.human === false
      ? {}
      : { human: { email: { email: overrides.email ?? email, isVerified: overrides.verified ?? true } } }),
  }
}

function nativeCreate(options: NativeOptions = {}, events: string[] = []) {
  const calls: Array<{ url: string; body?: unknown }> = []
  const fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input)
    events.push("native")
    calls.push({ url, ...(init?.body === undefined ? {} : { body: JSON.parse(String(init.body)) }) })
    if (url.endsWith("/v2/users")) {
      return Response.json(
        options.usersStatus === undefined ? { result: options.users ?? [userCreate()] } : { native: "hidden" },
        { status: options.usersStatus ?? 200 },
      )
    }
    if (url.endsWith("/v2/settings/login")) {
      return Response.json({ settings: { allowLocalAuthentication: true, hidePasswordReset: false } })
    }
    if (url.endsWith("/authentication_methods")) {
      return Response.json(
        options.methodsStatus === undefined
          ? { authMethodTypes: options.methods ?? ["AUTHENTICATION_METHOD_TYPE_PASSWORD"] }
          : { native: "hidden" },
        { status: options.methodsStatus ?? 200 },
      )
    }
    return Response.json(options.resetStatus === undefined ? {} : { native: "hidden" }, {
      status: options.resetStatus ?? 200,
    })
  }
  return { fetch, calls }
}

function cookieValueGet(setCookie: string | null): string {
  if (!setCookie) return ""
  const pair = setCookie.split(";", 1)[0] ?? ""
  return pair.slice(pair.indexOf("=") + 1)
}

async function stateSeal(overrides: Partial<PasswordRecoveryCookie> = {}) {
  const sealed = await passwordRecoveryCookieSeal(
    {
      version: 1,
      purpose: "password_recovery",
      csrfToken,
      issuedAt: now,
      expiresAt: now + 300,
      transition: 0,
      ...overrides,
    },
    key,
    new Uint8Array(12).fill(4),
  )
  if (!sealed.success) throw new Error("Expected recovery state to seal")
  return sealed.data
}

function requestCreate(
  cookie: string,
  options: {
    body?: unknown
    contentType?: string | null
    originHeader?: string | null
    urlOrigin?: string
    ip?: string
  } = {},
) {
  const headers = new Headers({ cookie: `${passwordRecoveryCookieName}=${cookie}` })
  if (options.contentType !== null) headers.set("content-type", options.contentType ?? "application/json")
  if (options.originHeader !== null) headers.set("origin", options.originHeader ?? origin)
  if (options.ip) headers.set("cf-connecting-ip", options.ip)
  return new Request(`${options.urlOrigin ?? origin}/api/v2/password/reset/request`, {
    method: "POST",
    headers,
    body: JSON.stringify(options.body ?? { email, csrfToken }),
  })
}

async function acceptedOutcome(options: NativeOptions) {
  const native = nativeCreate(options)
  const app = workerAppCreate({
    delay: async () => {},
    fetch: native.fetch,
    monotonicNow: () => 0,
    now: () => now,
    randomBytes: (length) => new Uint8Array(length).fill(8),
    logger: { warn: () => {}, error: () => {} },
  })
  const response = await app.fetch(requestCreate(await stateSeal()), bindings)
  return {
    body: await response.json(),
    calls: native.calls,
    setCookie: response.headers.get("set-cookie"),
    status: response.status,
  }
}

describe("password reset request flow", () => {
  test("returns identical accepted response and recovery transition for every account outcome", async () => {
    const outcomes = [
      await acceptedOutcome({ users: [] }),
      await acceptedOutcome({ users: [userCreate(), userCreate({ userId: "other-secret-id" })] }),
      await acceptedOutcome({ users: [userCreate({ state: "USER_STATE_INACTIVE" })] }),
      await acceptedOutcome({ users: [userCreate({ organizationId: "foreign-secret-org" })] }),
      await acceptedOutcome({ users: [userCreate({ verified: false })] }),
      await acceptedOutcome({ users: [userCreate({ human: false })] }),
      await acceptedOutcome({ methods: ["AUTHENTICATION_METHOD_TYPE_PASSKEY"] }),
      await acceptedOutcome({ resetStatus: 400 }),
      await acceptedOutcome({}),
    ]

    const publicOutcomes = outcomes.map(({ status, body, setCookie }) => ({ status, body, setCookie }))
    expect(new Set(publicOutcomes.map(JSON.stringify)).size).toBe(1)
    expect(publicOutcomes[0]).toEqual({
      status: 202,
      body: { success: true, data: { status: "accepted" } },
      setCookie: expect.stringContaining(`${passwordRecoveryCookieName}=`),
    })
    for (const outcome of outcomes.slice(0, -1)) {
      expect(outcome.calls.some((call) => call.url.endsWith("/password_reset"))).toBe(outcome === outcomes.at(-2))
    }

    const opened = await passwordRecoveryCookieOpen(cookieValueGet(outcomes[0]?.setCookie ?? null), [key], now, 1)
    expect(opened).toEqual(
      expect.objectContaining({ success: true, data: expect.objectContaining({ transition: 1, csrfToken }) }),
    )
  })

  test("pads every account outcome to the same minimum duration", async () => {
    const delays: number[] = []
    let monotonicTime = 10
    const native = nativeCreate({ users: [] })
    const app = workerAppCreate({
      delay: async (milliseconds) => {
        delays.push(milliseconds)
      },
      fetch: async (input, init) => {
        monotonicTime += 275
        return native.fetch(input, init)
      },
      monotonicNow: () => monotonicTime,
      now: () => now,
      logger: { warn: () => {}, error: () => {} },
    })

    const response = await app.fetch(requestCreate(await stateSeal()), bindings)

    expect(response.status).toBe(202)
    expect(delays).toEqual([1_450])
  })

  test("enforces capability, exact origin, exact JSON, CSRF, expiry, and replay before lookup", async () => {
    const native = nativeCreate()
    const app = workerAppCreate({ fetch: native.fetch, now: () => now, logger: { warn: () => {}, error: () => {} } })
    const validCookie = await stateSeal()
    const cases: Array<[Request, WorkerBindingsInput, number, string]> = [
      [
        requestCreate(validCookie),
        { ...bindings, ZITADEL_PASSWORD_RESET_V2_ENABLED: "false" },
        404,
        "capability_disabled",
      ],
      [requestCreate(validCookie, { originHeader: null }), bindings, 403, "origin_rejected"],
      [requestCreate(validCookie, { originHeader: "https://evil.example" }), bindings, 403, "origin_rejected"],
      [requestCreate(validCookie, { urlOrigin: "https://evil.example" }), bindings, 403, "origin_rejected"],
      [
        requestCreate(validCookie, { contentType: "application/json; charset=utf-8" }),
        bindings,
        415,
        "unsupported_media_type",
      ],
      [requestCreate(validCookie, { contentType: "Application/JSON" }), bindings, 415, "unsupported_media_type"],
      [requestCreate(validCookie, { body: { email, csrfToken: "D".repeat(43) } }), bindings, 403, "csrf_rejected"],
      [
        requestCreate(await stateSeal({ issuedAt: now - 301, expiresAt: now - 1 })),
        bindings,
        409,
        "recovery_state_expired",
      ],
      [requestCreate(await stateSeal({ transition: 1 })), bindings, 409, "recovery_state_replayed"],
    ]

    for (const [request, environment, status, errorMessage] of cases) {
      const response = await app.fetch(request, environment)
      expect(response.status).toBe(status)
      const body = await response.json()
      if (errorMessage === "origin_rejected" && request.headers.get("origin") === "https://evil.example") {
        expect(JSON.stringify(body)).toContain("origin_rejected")
      } else {
        expect(body).toEqual({ success: false, op: "passwordResetRequest", errorMessage })
      }
      expect(response.headers.get("set-cookie")).toBeNull()
    }
    expect(native.calls).toHaveLength(0)
  })

  test("applies HMAC-opaque email and IP limits before native lookup", async () => {
    const events: string[] = []
    const keys: string[] = []
    const native = nativeCreate({}, events)
    const app = workerAppCreate({ fetch: native.fetch, now: () => now, logger: { warn: () => {}, error: () => {} } })
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

    expect(response.status).toBe(202)
    expect(events).toEqual(["limit", "limit", "native", "native", "native", "native"])
    expect(keys).toHaveLength(2)
    expect(keys[0]).toMatch(/^password-reset-request:email:[A-Za-z0-9_-]{43}$/)
    expect(keys[1]).toMatch(/^password-reset-request:ip:[A-Za-z0-9_-]{43}$/)
    expect(JSON.stringify(keys)).not.toContain(email)
    expect(JSON.stringify(keys)).not.toContain("203.0.113.42")
  })

  test("exposes rate-limit and infrastructure failures only through generic bounded responses", async () => {
    const lookup = nativeCreate({ usersStatus: 503 })
    const logs: Array<{ event: string; context?: Record<string, number | string> }> = []
    const lookupApp = workerAppCreate({
      fetch: lookup.fetch,
      now: () => now,
      logger: {
        warn: (event, context) => logs.push({ event, context }),
        error: (event, context) => logs.push({ event, context }),
      },
    })
    const infrastructure = await lookupApp.fetch(requestCreate(await stateSeal()), bindings)
    const limitedApp = workerAppCreate({ now: () => now, logger: { warn: () => {}, error: () => {} } })
    const limited = await limitedApp.fetch(requestCreate(await stateSeal()), {
      ...bindings,
      RATE_LIMITER: { limit: async () => ({ success: false }) },
    })

    expect(infrastructure.status).toBe(503)
    expect(await infrastructure.json()).toEqual({
      success: false,
      op: "passwordResetRequest",
      errorMessage: "service_unavailable",
    })
    expect(infrastructure.headers.get("set-cookie")).toBeNull()
    expect(limited.status).toBe(429)
    expect(await limited.json()).toEqual({
      success: false,
      op: "passwordResetRequest",
      errorMessage: "rate_limited",
    })
    expect(limited.headers.get("retry-after")).toBe("60")
    expect(limited.headers.get("set-cookie")).toBeNull()

    const exposed = JSON.stringify({ logs, infrastructure: "service_unavailable", limited: "rate_limited" })
    for (const hidden of [email, "secret-user-id", "foreign-secret-org", "{{.UserID}}", "native", "hidden"]) {
      expect(exposed).not.toContain(hidden)
    }
  })

  test("treats native account failures like other accepted account outcomes", async () => {
    const outcome = await acceptedOutcome({ resetStatus: 400 })

    expect(outcome).toEqual({
      status: 202,
      body: { success: true, data: { status: "accepted" } },
      calls: expect.any(Array),
      setCookie: expect.stringContaining(`${passwordRecoveryCookieName}=`),
    })
    const opened = await passwordRecoveryCookieOpen(cookieValueGet(outcome.setCookie), [key], now, 1)
    expect(opened).toEqual(expect.objectContaining({ success: true, data: expect.objectContaining({ transition: 1 }) }))
  })

  test("keeps native reset infrastructure failures indistinguishable from accepted outcomes", async () => {
    const outcome = await acceptedOutcome({ resetStatus: 503 })

    expect(outcome.status).toBe(202)
    expect(outcome.body).toEqual({ success: true, data: { status: "accepted" } })
    expect(outcome.setCookie).toContain(`${passwordRecoveryCookieName}=`)
  })

  test("keeps accepted responses bounded and secret-free", async () => {
    const outcome = await acceptedOutcome({})
    const exposed = JSON.stringify(outcome.body)

    expect(Object.keys(outcome.body as object)).toEqual(["success", "data"])
    expect(exposed.length).toBeLessThan(64)
    for (const hidden of [email, "secret-user-id", "org-1", "{{.Code}}", identityOrigin, origin, "password_reset"]) {
      expect(exposed).not.toContain(hidden)
    }
  })
})
