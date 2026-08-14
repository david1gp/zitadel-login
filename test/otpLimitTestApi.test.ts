import { describe, expect, test } from "bun:test"

import type { WorkerBindingsInput } from "../src/config/workerBindingsSchema"
import { workerAppCreate } from "../src/worker/workerAppCreate"
import { emailOtpCooldownNamespaceFakeCreate } from "./emailOtpCooldownNamespaceFakeCreate"

const origin = "https://login.example"
const identityOrigin = "https://identity.example"
const secret = "test-otp-limit-secret-value-32b!!"
const now = 1_800_000_000
const path = `${origin}/api/v2/internal/otp-limit-test`

const bindings: WorkerBindingsInput = {
  ZITADEL_ORIGIN: identityOrigin,
  ZITADEL_ORGANIZATION_ID: "org-1",
  ZITADEL_ALLOWED_CLIENT_IDS: "client-1",
  LOGIN_V2_FALLBACK_URL: `${identityOrigin}/ui/v2/login`,
  PAGES_ORIGIN: origin,
  SESSION_LIFETIME_SECONDS: "900",
  ZITADEL_LOGIN_CLIENT_PAT: "test-pat-not-a-real-secret-value",
  FLOW_COOKIE_KEY: "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA",
  ZITADEL_CUSTOM_LOGIN_ENABLED: "true",
  RATE_LIMITER: {
    limit: async () => {
      throw new Error("RATE_LIMITER must not be used")
    },
  },
  EMAIL_OTP_COOLDOWN: emailOtpCooldownNamespaceFakeCreate(),
  OTP_LIMIT_TEST_SECRET: secret,
}

function appCreate() {
  return workerAppCreate({
    fetch: async () => {
      throw new Error("ZITADEL must not be invoked")
    },
    now: () => now,
  })
}

function headers(overrides: HeadersInit = {}): HeadersInit {
  return {
    origin,
    "content-type": "application/json",
    authorization: `Bearer ${secret}`,
    ...overrides,
  }
}

describe("isolated OTP limit test API", () => {
  test("returns 404 when the secret or Durable Object is unconfigured", async () => {
    const missingSecret = await appCreate().request(
      path,
      { method: "POST", headers: headers(), body: JSON.stringify({ bucket: "synthetic", key: "probe" }) },
      { ...bindings, OTP_LIMIT_TEST_SECRET: undefined },
    )
    expect(missingSecret.status).toBe(404)
    expect(await missingSecret.json()).toEqual({
      success: false,
      op: "otpLimitTest",
      errorMessage: "not_found",
    })

    const missingLimiter = await appCreate().request(
      path,
      { method: "POST", headers: headers(), body: JSON.stringify({ bucket: "synthetic", key: "probe" }) },
      { ...bindings, EMAIL_OTP_COOLDOWN: undefined },
    )
    expect(missingLimiter.status).toBe(404)
  })

  test("rejects missing, mismatched, and cross-origin authorization before the Durable Object", async () => {
    const objectNames: string[] = []
    const cooldown = emailOtpCooldownNamespaceFakeCreate()
    const env = {
      ...bindings,
      EMAIL_OTP_COOLDOWN: {
        ...cooldown,
        getByName: (name: string) => {
          objectNames.push(name)
          return cooldown.getByName(name)
        },
      },
    }
    const app = appCreate()
    const body = JSON.stringify({ bucket: "synthetic", key: "probe" })

    const missing = await app.request(path, { method: "POST", headers: headers({ authorization: "" }), body }, env)
    expect(missing.status).toBe(401)

    const wrong = await app.request(
      path,
      { method: "POST", headers: headers({ authorization: `Bearer ${secret.slice(0, -1)}x` }), body },
      env,
    )
    expect(wrong.status).toBe(401)

    const crossOrigin = await app.request(
      path,
      { method: "POST", headers: headers({ origin: "https://other.example" }), body },
      env,
    )
    expect(crossOrigin.status).toBe(403)

    const hostMismatch = await app.request(
      "https://other.example/api/v2/internal/otp-limit-test",
      { method: "POST", headers: headers(), body },
      env,
    )
    expect(hostMismatch.status).toBe(403)
    expect(objectNames).toEqual([])
  })

  test("rejects unknown buckets, extra fields, and oversized payloads without calling the Durable Object", async () => {
    const objectNames: string[] = []
    const cooldown = emailOtpCooldownNamespaceFakeCreate()
    const env = {
      ...bindings,
      EMAIL_OTP_COOLDOWN: {
        ...cooldown,
        getByName: (name: string) => {
          objectNames.push(name)
          return cooldown.getByName(name)
        },
      },
    }
    const app = appCreate()

    const unknownBucket = await app.request(
      path,
      { method: "POST", headers: headers(), body: JSON.stringify({ bucket: "otp-resend", key: "probe" }) },
      env,
    )
    expect(unknownBucket.status).toBe(400)

    const extraField = await app.request(
      path,
      { method: "POST", headers: headers(), body: JSON.stringify({ bucket: "synthetic", key: "probe", extra: true }) },
      env,
    )
    expect(extraField.status).toBe(400)

    const oversized = await app.request(
      path,
      { method: "POST", headers: headers(), body: JSON.stringify({ bucket: "synthetic", key: "x".repeat(65) }) },
      env,
    )
    expect(oversized.status).toBe(400)

    const media = await app.request(
      path,
      {
        method: "POST",
        headers: headers({ "content-type": "text/plain" }),
        body: JSON.stringify({ bucket: "synthetic", key: "probe" }),
      },
      env,
    )
    expect(media.status).toBe(415)
    expect(objectNames).toEqual([])
  })

  test("uses only the synthetic Durable Object scope and returns exact cooldown metadata", async () => {
    const objectNames: string[] = []
    const reservationExpiresAt = now + 37
    let accepted = true
    const env = {
      ...bindings,
      EMAIL_OTP_COOLDOWN: {
        getByName: (name: string) => {
          objectNames.push(name)
          return {
            reserve: async () => {
              const currentAccepted = accepted
              accepted = false
              return { accepted: currentAccepted, expiresAt: reservationExpiresAt }
            },
            status: async () => ({ expiresAt: reservationExpiresAt }),
          }
        },
      },
    }
    const app = appCreate()
    const body = JSON.stringify({ bucket: "synthetic", key: "probe-1" })

    const allowed = await app.request(path, { method: "POST", headers: headers(), body }, env)
    expect(allowed.status).toBe(200)
    expect(allowed.headers.get("x-cooldown-expires-at")).toBe(String(reservationExpiresAt))
    expect(allowed.headers.get("x-cooldown-remaining-seconds")).toBe("37")
    expect(await allowed.json()).toEqual({
      success: true,
      data: { cooldownExpiresAt: reservationExpiresAt, cooldownRemainingSeconds: 37 },
    })

    const limited = await app.request(path, { method: "POST", headers: headers(), body }, env)
    expect(limited.status).toBe(429)
    expect(limited.headers.get("retry-after")).toBe("37")
    expect(limited.headers.get("x-cooldown-expires-at")).toBe(String(reservationExpiresAt))
    expect(await limited.json()).toEqual({
      success: false,
      op: "otpLimitTest",
      errorMessage: "rate_limited",
      data: { cooldownExpiresAt: reservationExpiresAt, cooldownRemainingSeconds: 37 },
    })

    expect(objectNames).toHaveLength(2)
    expect(objectNames[0]).toMatch(/^synthetic:[A-Za-z0-9_-]{43}$/)
    expect(objectNames[0]).toBe(objectNames[1])
    expect(JSON.stringify(objectNames)).not.toContain("probe-1")
  })

  test("admits only one concurrent synthetic request", async () => {
    const env = { ...bindings, EMAIL_OTP_COOLDOWN: emailOtpCooldownNamespaceFakeCreate() }
    const app = appCreate()
    const body = JSON.stringify({ bucket: "synthetic", key: "concurrent-probe" })
    const [first, second] = await Promise.all([
      app.request(path, { method: "POST", headers: headers(), body }, env),
      app.request(path, { method: "POST", headers: headers(), body }, env),
    ])

    expect([first.status, second.status].sort()).toEqual([200, 429])
    const accepted = first.status === 200 ? first : second
    const rejected = first.status === 429 ? first : second
    expect(await accepted.json()).toEqual({
      success: true,
      data: { cooldownExpiresAt: now + 60, cooldownRemainingSeconds: 60 },
    })
    expect(rejected.headers.get("retry-after")).toBe("60")
    expect(await rejected.json()).toEqual({
      success: false,
      op: "otpLimitTest",
      errorMessage: "rate_limited",
      data: { cooldownExpiresAt: now + 60, cooldownRemainingSeconds: 60 },
    })
  })

  test("re-admits the same synthetic key at exact expiry", async () => {
    let currentNow = now
    const env = { ...bindings, EMAIL_OTP_COOLDOWN: emailOtpCooldownNamespaceFakeCreate() }
    const app = workerAppCreate({
      fetch: async () => {
        throw new Error("ZITADEL must not be invoked")
      },
      now: () => currentNow,
    })
    const body = JSON.stringify({ bucket: "synthetic", key: "exact-expiry-probe" })

    const first = await app.request(path, { method: "POST", headers: headers(), body }, env)
    expect(first.status).toBe(200)
    expect(await first.json()).toEqual({
      success: true,
      data: { cooldownExpiresAt: now + 60, cooldownRemainingSeconds: 60 },
    })

    currentNow = now + 60
    const second = await app.request(path, { method: "POST", headers: headers(), body }, env)
    expect(second.status).toBe(200)
    expect(await second.json()).toEqual({
      success: true,
      data: { cooldownExpiresAt: now + 120, cooldownRemainingSeconds: 60 },
    })
  })
})
