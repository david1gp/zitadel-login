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
const previousKey = "BBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB"
const now = 1_800_000_000

const bindings: WorkerBindingsInput = {
  ZITADEL_ORIGIN: identityOrigin,
  ZITADEL_ORGANIZATION_ID: "org-1",
  ZITADEL_ALLOWED_CLIENT_IDS: "client-1",
  LOGIN_V2_FALLBACK_URL: `${identityOrigin}/ui/v2/login`,
  PAGES_ORIGIN: origin,
  SESSION_LIFETIME_SECONDS: "900",
  ZITADEL_LOGIN_CLIENT_PAT: "test-pat-not-a-real-secret-value",
  FLOW_COOKIE_KEY: key,
  FLOW_COOKIE_PREVIOUS_KEY: previousKey,
  ZITADEL_PASSWORD_RESET_V2_ENABLED: "true",
  RATE_LIMITER: { limit: async () => ({ success: true }) },
}

function state(overrides: Partial<PasswordResetCookie> = {}): PasswordResetCookie {
  return {
    version: 1,
    purpose: "password_reset",
    userId: "secret-user-id",
    organizationId: "org-1",
    verificationCode: "A1B2C3",
    issuedAt: now,
    expiresAt: now + 600,
    transition: 0,
    ...overrides,
  } as PasswordResetCookie
}

async function stateSeal(input = state(), cookieKey = key, ivByte = 1) {
  const result = await passwordResetCookieSeal(input, cookieKey, new Uint8Array(12).fill(ivByte))
  if (!result.success) throw new Error("Expected reset state to seal")
  return result.data
}

function requestCreate(
  cookie: string | undefined,
  options: {
    body?: string
    contentType?: string | null
    originHeader?: string | null
    urlOrigin?: string
    extraCookie?: string
  } = {},
) {
  const headers = new Headers()
  if (cookie)
    headers.set(
      "cookie",
      `${options.extraCookie ? `${options.extraCookie}; ` : ""}${passwordResetCookieName}=${cookie}`,
    )
  if (options.contentType !== null) headers.set("content-type", options.contentType ?? "application/json")
  if (options.originHeader !== null) headers.set("origin", options.originHeader ?? origin)
  return new Request(`${options.urlOrigin ?? origin}/api/v2/password/reset/set-bootstrap`, {
    method: "POST",
    headers,
    body: options.body ?? "{}",
  })
}

function cookieValueGet(header: string | null): string {
  if (!header) return ""
  const pair = header.split(";", 1)[0] ?? ""
  return pair.slice(pair.indexOf("=") + 1)
}

describe("password reset set bootstrap flow", () => {
  test("opens transition 0, generates memory-only CSRF, and rotates to render state", async () => {
    let nativeCalls = 0
    const csrfBytes = new Uint8Array(32).fill(8)
    const app = workerAppCreate({
      fetch: async () => {
        nativeCalls += 1
        return Response.json({})
      },
      now: () => now,
      randomBytes: (length) => (length === 32 ? csrfBytes : new Uint8Array(length).fill(9)),
    })
    const response = await app.fetch(
      requestCreate(await stateSeal(), { extraCookie: "__Host-zitadel-login-flow-unused=unrelated" }),
      bindings,
    )
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(body).toEqual({
      success: true,
      data: {
        status: "ready",
        screen: "password_reset",
        csrfToken: expect.stringMatching(/^[A-Za-z0-9_-]{43}$/),
        expiresAt: now + 600,
      },
    })
    expect(Object.keys(body.data).sort()).toEqual(["csrfToken", "expiresAt", "screen", "status"])
    expect(nativeCalls).toBe(0)

    const opened = await passwordResetCookieOpen(cookieValueGet(response.headers.get("set-cookie")), [key], now, [1])
    expect(opened).toEqual({
      success: true,
      data: {
        ...state(),
        transition: 1,
        csrfToken: body.data.csrfToken,
      },
    })
    expect(response.headers.get("set-cookie")).toContain(
      `${passwordResetCookieName}=${cookieValueGet(response.headers.get("set-cookie"))}`,
    )
    expect(response.headers.get("set-cookie")).toContain("Path=/; Max-Age=600; HttpOnly; Secure; SameSite=Lax")

    const exposed = JSON.stringify(body)
    for (const hidden of ["secret-user-id", "org-1", "A1B2C3", identityOrigin, bindings.ZITADEL_LOGIN_CLIENT_PAT]) {
      expect(exposed).not.toContain(hidden)
    }
  })

  test("safely resumes render state with a newly rotated memory-only CSRF", async () => {
    let randomCall = 0
    const app = workerAppCreate({
      now: () => now,
      randomBytes: (length) => new Uint8Array(length).fill(length === 32 ? ++randomCall : 10),
    })
    const rendered = await stateSeal(
      state({ transition: 1, csrfToken: "C".repeat(43) } as Partial<PasswordResetCookie>),
      previousKey,
      2,
    )
    const response = await app.fetch(requestCreate(rendered), bindings)
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(body.data.csrfToken).not.toBe("C".repeat(43))
    const opened = await passwordResetCookieOpen(cookieValueGet(response.headers.get("set-cookie")), [key], now, [1])
    expect(opened).toEqual(
      expect.objectContaining({
        success: true,
        data: expect.objectContaining({ transition: 1, csrfToken: body.data.csrfToken }),
      }),
    )
  })

  test("collapses missing, malformed, expired, tampered, duplicate, foreign-org, and replay state", async () => {
    const app = workerAppCreate({ now: () => now })
    const valid = await stateSeal()
    const expired = await stateSeal(state({ issuedAt: now - 601, expiresAt: now - 1 }), key, 3)
    const foreign = await stateSeal(state({ organizationId: "other-org" }), key, 4)
    const tampered = `${valid.slice(0, -1)}${valid.endsWith("A") ? "B" : "A"}`
    const cases = [
      requestCreate(undefined),
      requestCreate("malformed"),
      requestCreate(expired),
      requestCreate(tampered),
      requestCreate(foreign),
      requestCreate(valid, { extraCookie: `${passwordResetCookieName}=${valid}` }),
    ]

    for (const request of cases) {
      const response = await app.fetch(request, bindings)
      expect(response.status).toBe(409)
      expect(await response.json()).toEqual({
        success: false,
        op: "passwordResetSetBootstrap",
        errorMessage: "invalid_link",
      })
      expect(response.headers.get("set-cookie")).toBeNull()
    }
  })

  test("enforces capability, exact request/header origin, and exact empty JSON before cookie opening", async () => {
    const app = workerAppCreate({ now: () => now })
    const valid = await stateSeal()
    const cases: Array<[Request, WorkerBindingsInput, number, string]> = [
      [requestCreate(valid), { ...bindings, ZITADEL_PASSWORD_RESET_V2_ENABLED: "false" }, 404, "capability_disabled"],
      [requestCreate(valid, { originHeader: null }), bindings, 403, "origin_rejected"],
      [requestCreate(valid, { originHeader: "https://evil.example" }), bindings, 403, "origin_rejected"],
      [requestCreate(valid, { urlOrigin: "https://evil.example" }), bindings, 403, "origin_rejected"],
      [
        requestCreate(valid, { contentType: "application/json; charset=utf-8" }),
        bindings,
        415,
        "unsupported_media_type",
      ],
      [requestCreate(valid, { body: JSON.stringify({ csrfToken: "C".repeat(43) }) }), bindings, 400, "invalid_payload"],
    ]

    for (const [request, environment, status, errorMessage] of cases) {
      const response = await app.fetch(request, environment)
      expect(response.status).toBe(status)
      const body = await response.json()
      if (errorMessage === "origin_rejected" && request.headers.get("origin") === "https://evil.example") {
        expect(JSON.stringify(body)).toContain("origin_rejected")
      } else {
        expect(body).toEqual({ success: false, op: "passwordResetSetBootstrap", errorMessage })
      }
      expect(response.headers.get("set-cookie")).toBeNull()
    }
  })
})
