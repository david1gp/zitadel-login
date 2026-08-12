import { describe, expect, test } from "bun:test"

import type { WorkerBindingsInput } from "../src/config/workerBindingsSchema"
import { passwordRecoveryCookieOpen } from "../src/password-recovery/domain/passwordRecoveryCookieOpen"
import { passwordRecoveryCookieName } from "../src/password-recovery/model/passwordRecoveryCookieName"
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

function bootstrapRequest(
  options: { originHeader?: string | null; urlOrigin?: string; body?: string; contentType?: string | null } = {},
) {
  const urlOrigin = options.urlOrigin ?? origin
  const headers = new Headers()
  if (options.originHeader !== null) headers.set("origin", options.originHeader ?? origin)
  if (options.contentType !== null) headers.set("content-type", options.contentType ?? "application/json")
  return new Request(`${urlOrigin}/api/v2/password/reset/bootstrap`, {
    method: "POST",
    headers,
    body: options.body ?? "{}",
  })
}

function cookieHeaderParse(header: string | null): { name: string; value: string; attributes: string[] } | undefined {
  if (!header) return undefined
  const [pair, ...attributes] = header.split(";").map((part) => part.trim())
  if (!pair) return undefined
  const separator = pair.indexOf("=")
  if (separator <= 0) return undefined
  return {
    name: pair.slice(0, separator),
    value: pair.slice(separator + 1),
    attributes,
  }
}

describe("password recovery bootstrap flow", () => {
  test("issues a purpose-bound recovery cookie and memory-only CSRF token", async () => {
    const csrfBytes = new Uint8Array(32).fill(7)
    const app = workerAppCreate({
      now: () => now,
      randomBytes: (length) => (length === 32 ? csrfBytes : new Uint8Array(length).fill(9)),
    })

    const response = await app.fetch(bootstrapRequest(), bindings)
    const body = await response.json()
    const setCookie = cookieHeaderParse(response.headers.get("set-cookie"))

    expect(response.status).toBe(200)
    expect(body).toEqual({
      success: true,
      data: {
        status: "ready",
        csrfToken: expect.stringMatching(/^[A-Za-z0-9_-]{43}$/),
        expiresAt: now + 300,
      },
    })
    expect(Object.keys(body.data).sort()).toEqual(["csrfToken", "expiresAt", "status"])
    expect(JSON.stringify(body)).not.toContain("@")
    expect(JSON.stringify(body)).not.toContain("user")
    expect(JSON.stringify(body)).not.toContain("code")
    expect(JSON.stringify(body)).not.toContain("authRequest")
    expect(JSON.stringify(body)).not.toContain(bindings.ZITADEL_LOGIN_CLIENT_PAT)

    expect(setCookie?.name).toBe(passwordRecoveryCookieName)
    expect(setCookie?.attributes).toEqual(
      expect.arrayContaining(["Path=/", "Max-Age=300", "HttpOnly", "Secure", "SameSite=Lax"]),
    )
    expect(setCookie?.attributes.some((attribute) => attribute.toLowerCase().startsWith("domain="))).toBe(false)

    const opened = await passwordRecoveryCookieOpen(setCookie?.value ?? "", [key], now, 0)
    expect(opened.success).toBe(true)
    if (!opened.success) return
    expect(opened.data).toEqual({
      version: 1,
      purpose: "password_recovery",
      csrfToken: body.data.csrfToken,
      issuedAt: now,
      expiresAt: now + 300,
      transition: 0,
    })
    expect(Object.keys(opened.data).sort()).toEqual([
      "csrfToken",
      "expiresAt",
      "issuedAt",
      "purpose",
      "transition",
      "version",
    ])
  })

  test("rejects bootstrap when the independent recovery capability is disabled", async () => {
    const app = workerAppCreate({ now: () => now })
    const response = await app.fetch(bootstrapRequest(), {
      ...bindings,
      ZITADEL_PASSWORD_RESET_V2_ENABLED: "false",
    })
    expect(response.status).toBe(404)
    expect(await response.json()).toEqual({
      success: false,
      op: "passwordRecoveryBootstrap",
      errorMessage: "capability_disabled",
    })
    expect(response.headers.get("set-cookie")).toBeNull()
  })

  test("rejects non-exact request and Origin boundaries", async () => {
    const app = workerAppCreate({ now: () => now })

    const wrongOriginHeader = await app.fetch(bootstrapRequest({ originHeader: "https://evil.example" }), bindings)
    expect(wrongOriginHeader.status).toBe(403)
    expect(await wrongOriginHeader.json()).toEqual({
      error: { code: "origin_rejected", message: "Request origin rejected." },
    })
    expect(wrongOriginHeader.headers.get("set-cookie")).toBeNull()

    const missingOrigin = await app.fetch(bootstrapRequest({ originHeader: null }), bindings)
    expect(missingOrigin.status).toBe(403)
    expect(await missingOrigin.json()).toEqual({
      success: false,
      op: "passwordRecoveryBootstrap",
      errorMessage: "origin_rejected",
    })
    expect(missingOrigin.headers.get("set-cookie")).toBeNull()

    const wrongUrlOrigin = await app.fetch(bootstrapRequest({ urlOrigin: "https://evil.example" }), bindings)
    expect(wrongUrlOrigin.status).toBe(403)
    expect(await wrongUrlOrigin.json()).toEqual({
      success: false,
      op: "passwordRecoveryBootstrap",
      errorMessage: "origin_rejected",
    })
    expect(wrongUrlOrigin.headers.get("set-cookie")).toBeNull()
  })

  test("rejects non-empty JSON payloads and non-JSON content types", async () => {
    const app = workerAppCreate({ now: () => now })

    const invalidPayload = await app.fetch(bootstrapRequest({ body: JSON.stringify({ email: "a@b.co" }) }), bindings)
    expect(invalidPayload.status).toBe(400)
    expect(await invalidPayload.json()).toEqual({
      success: false,
      op: "passwordRecoveryBootstrap",
      errorMessage: "invalid_payload",
    })

    const mediaType = await app.fetch(bootstrapRequest({ contentType: "text/plain", body: "{}" }), bindings)
    expect(mediaType.status).toBe(415)
    expect(await mediaType.json()).toEqual({
      success: false,
      op: "passwordRecoveryBootstrap",
      errorMessage: "unsupported_media_type",
    })

    const parameterizedMediaType = await app.fetch(
      bootstrapRequest({ contentType: "application/json; charset=utf-8" }),
      bindings,
    )
    expect(parameterizedMediaType.status).toBe(415)
    expect(await parameterizedMediaType.json()).toEqual({
      success: false,
      op: "passwordRecoveryBootstrap",
      errorMessage: "unsupported_media_type",
    })
  })

  test("opens bootstrap state sealed under the previous key after rotation", async () => {
    const app = workerAppCreate({
      now: () => now,
      randomBytes: (length) => new Uint8Array(length).fill(length === 32 ? 5 : 11),
    })
    const response = await app.fetch(bootstrapRequest(), {
      ...bindings,
      FLOW_COOKIE_KEY: previousKey,
    })
    expect(response.status).toBe(200)
    const setCookie = cookieHeaderParse(response.headers.get("set-cookie"))
    const opened = await passwordRecoveryCookieOpen(setCookie?.value ?? "", [key, previousKey], now, 0)
    expect(opened.success).toBe(true)
  })
})
