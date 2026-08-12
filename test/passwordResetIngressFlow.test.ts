import { describe, expect, test } from "bun:test"

import type { WorkerBindingsInput } from "../src/config/workerBindingsSchema"
import { passwordResetCookieOpen } from "../src/password-recovery/domain/passwordResetCookieOpen"
import { passwordResetCookieName } from "../src/password-recovery/model/passwordResetCookieName"
import { workerAppCreate } from "../src/worker/workerAppCreate"

const origin = "https://login.example"
const identityOrigin = "https://identity.example"
const key = "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA"
const now = 1_800_000_000
const userId = "user-1"
const organizationId = "org-1"
const code = "A1B2C3"

const bindings: WorkerBindingsInput = {
  ZITADEL_ORIGIN: identityOrigin,
  ZITADEL_ORGANIZATION_ID: organizationId,
  ZITADEL_ALLOWED_CLIENT_IDS: "client-1",
  LOGIN_V2_FALLBACK_URL: `${identityOrigin}/ui/v2/login`,
  PAGES_ORIGIN: origin,
  SESSION_LIFETIME_SECONDS: "900",
  ZITADEL_LOGIN_CLIENT_PAT: "test-pat-not-a-real-secret-value",
  FLOW_COOKIE_KEY: key,
  ZITADEL_PASSWORD_RESET_V2_ENABLED: "true",
  RATE_LIMITER: { limit: async () => ({ success: true }) },
}

function requestCreate(query = `userId=${userId}&orgId=${organizationId}&code=${code}`, urlOrigin = origin) {
  return new Request(`${urlOrigin}/api/v2/password/reset/ingress?${query}`)
}

function cookieParse(header: string | null) {
  if (!header) return undefined
  const [pair, ...attributes] = header.split(";").map((part) => part.trim())
  const separator = pair?.indexOf("=") ?? -1
  if (!pair || separator < 1) return undefined
  return { name: pair.slice(0, separator), value: pair.slice(separator + 1), attributes }
}

describe("password reset ingress flow", () => {
  test("scrubs native credentials into the standalone reset cookie and fixed redirect", async () => {
    let nativeCalls = 0
    const app = workerAppCreate({
      fetch: async () => {
        nativeCalls += 1
        return Response.json({})
      },
      now: () => now,
      randomBytes: (length) => new Uint8Array(length).fill(7),
    })
    const response = await app.fetch(requestCreate(), bindings)
    const cookie = cookieParse(response.headers.get("set-cookie"))

    expect(response.status).toBe(302)
    expect(response.headers.get("location")).toBe("/password/reset")
    expect(response.headers.get("location")).not.toContain(userId)
    expect(response.headers.get("location")).not.toContain(organizationId)
    expect(response.headers.get("location")).not.toContain(code)
    expect(response.headers.get("referrer-policy")).toBe("no-referrer")
    expect(cookie?.name).toBe(passwordResetCookieName)
    expect(cookie?.attributes).toEqual(
      expect.arrayContaining(["Path=/", "Max-Age=600", "HttpOnly", "Secure", "SameSite=Lax"]),
    )
    expect(cookie?.attributes.some((attribute) => attribute.toLowerCase().startsWith("domain="))).toBe(false)
    expect(nativeCalls).toBe(0)

    const opened = await passwordResetCookieOpen(cookie?.value ?? "", [key], now, [0])
    expect(opened).toEqual({
      success: true,
      data: {
        version: 1,
        purpose: "password_reset",
        userId,
        organizationId,
        verificationCode: code,
        issuedAt: now,
        expiresAt: now + 600,
        transition: 0,
      },
    })
    const visible = `${response.headers.get("location")}${await response.text()}`
    expect(visible).not.toContain(userId)
    expect(visible).not.toContain(organizationId)
    expect(visible).not.toContain(code)
  })

  test("rejects extras, missing keys, duplicates, encoding, malformed separators, alphabet, and bounds", async () => {
    const app = workerAppCreate({ now: () => now })
    const invalidQueries = [
      `userId=${userId}&orgId=${organizationId}`,
      `userId=${userId}&orgId=${organizationId}&code=${code}&next=/evil`,
      `userId=${userId}&userId=other&orgId=${organizationId}&code=${code}`,
      `userId=${userId}&orgId=${organizationId}&code=${code}&`,
      `userId=${userId}&orgId=${organizationId}&code=${code}=extra`,
      `user%49d=${userId}&orgId=${organizationId}&code=${code}`,
      `userId=user%2D1&orgId=${organizationId}&code=${code}`,
      `userId=user+1&orgId=${organizationId}&code=${code}`,
      `userId=user/1&orgId=${organizationId}&code=${code}`,
      `userId=${"u".repeat(201)}&orgId=${organizationId}&code=${code}`,
      `userId=${userId}&orgId=org/1&code=${code}`,
      `userId=${userId}&orgId=${organizationId}&code=ABC_12`,
      `userId=${userId}&orgId=${organizationId}&code=${"A".repeat(21)}`,
    ]

    for (const query of invalidQueries) {
      const response = await app.fetch(requestCreate(query), bindings)
      expect(response.status).toBe(400)
      expect(await response.json()).toEqual({
        success: false,
        op: "passwordResetIngress",
        errorMessage: "invalid_link",
      })
      expect(response.headers.get("set-cookie")).toBeNull()
      expect(response.headers.get("location")).toBeNull()
    }
  })

  test("requires the configured organization, exact request URL origin, and capability gate", async () => {
    const app = workerAppCreate({ now: () => now })
    const wrongOrganization = await app.fetch(requestCreate(`userId=${userId}&orgId=other-org&code=${code}`), bindings)
    const wrongOrigin = await app.fetch(requestCreate(undefined, "https://evil.example"), bindings)
    const disabled = await app.fetch(requestCreate(), { ...bindings, ZITADEL_PASSWORD_RESET_V2_ENABLED: "false" })

    expect(wrongOrganization.status).toBe(400)
    expect(await wrongOrganization.json()).toEqual({
      success: false,
      op: "passwordResetIngress",
      errorMessage: "invalid_link",
    })
    expect(wrongOrigin.status).toBe(400)
    expect(await wrongOrigin.json()).toEqual({
      success: false,
      op: "passwordResetIngress",
      errorMessage: "invalid_link",
    })
    expect(disabled.status).toBe(404)
    expect(await disabled.json()).toEqual({
      success: false,
      op: "passwordResetIngress",
      errorMessage: "capability_disabled",
    })
    for (const response of [wrongOrganization, wrongOrigin, disabled]) {
      expect(response.headers.get("set-cookie")).toBeNull()
      expect(response.headers.get("location")).toBeNull()
    }
  })
})
