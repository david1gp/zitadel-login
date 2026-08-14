import { describe, expect, test } from "bun:test"

import { workerBindingsParse } from "../src/config/workerBindingsParse"
import type { WorkerBindingsInput } from "../src/config/workerBindingsSchema"

const bindings: WorkerBindingsInput = {
  ZITADEL_ORIGIN: "https://identity.example",
  ZITADEL_ORGANIZATION_ID: "org-1",
  ZITADEL_ALLOWED_CLIENT_IDS: "client-1",
  LOGIN_V2_FALLBACK_URL: "https://identity.example/ui/v2/login",
  PAGES_ORIGIN: "https://login.example",
  SESSION_LIFETIME_SECONDS: "900",
  ZITADEL_LOGIN_CLIENT_PAT: "test-pat-not-a-real-secret-value",
  FLOW_COOKIE_KEY: "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA",
  RATE_LIMITER: { limit: async () => ({ success: true }) },
}

describe("workerBindingsParse MFA ownership gate", () => {
  test("defaults the custom login switch off and accepts only canonical values", () => {
    const disabled = workerBindingsParse(bindings)
    expect(disabled.success && disabled.data.ZITADEL_CUSTOM_LOGIN_ENABLED).toBe(false)

    const enabled = workerBindingsParse({ ...bindings, ZITADEL_CUSTOM_LOGIN_ENABLED: "true" })
    expect(enabled.success && enabled.data.ZITADEL_CUSTOM_LOGIN_ENABLED).toBe(true)

    const malformed = workerBindingsParse({ ...bindings, ZITADEL_CUSTOM_LOGIN_ENABLED: "TRUE" as "true" })
    expect(malformed.success).toBe(false)
  })

  test("defaults the validated password recovery capability off", () => {
    const result = workerBindingsParse(bindings)
    expect(result.success).toBe(true)
    if (!result.success) return
    expect(result.data.ZITADEL_PASSWORD_RESET_V2_ENABLED).toBe(false)
  })

  test("accepts only the canonical enabled password recovery value", () => {
    const enabled = workerBindingsParse({ ...bindings, ZITADEL_PASSWORD_RESET_V2_ENABLED: "true" })
    expect(enabled.success && enabled.data.ZITADEL_PASSWORD_RESET_V2_ENABLED).toBe(true)

    const malformed = workerBindingsParse({
      ...bindings,
      ZITADEL_PASSWORD_RESET_V2_ENABLED: "TRUE" as "true",
    })
    expect(malformed.success).toBe(false)
  })

  test("accepts HTTPS legal URLs and rejects unsafe values", () => {
    const configured = workerBindingsParse({
      ...bindings,
      TERMS_OF_SERVICE_URL: "https://legal.example/terms",
      PRIVACY_POLICY_URL: "https://legal.example/privacy",
    })
    expect(configured.success).toBe(true)

    const http = workerBindingsParse({ ...bindings, TERMS_OF_SERVICE_URL: "http://legal.example/terms" })
    expect(http.success).toBe(false)

    const credentials = workerBindingsParse({
      ...bindings,
      PRIVACY_POLICY_URL: "https://user:password@legal.example/privacy",
    })
    expect(credentials.success).toBe(false)
  })

  test("accepts the email OTP cooldown Durable Object namespace", () => {
    const namespace = {
      getByName: () => ({
        reserve: async () => ({ accepted: true, expiresAt: 0 }),
        status: async () => ({ expiresAt: 0 }),
      }),
    }
    const result = workerBindingsParse({ ...bindings, EMAIL_OTP_COOLDOWN: namespace })
    expect(result.success).toBe(true)
    if (!result.success) return
    expect(result.data.EMAIL_OTP_COOLDOWN).toBe(namespace)
  })

  test("rejects a malformed email OTP cooldown namespace", () => {
    const result = workerBindingsParse({ ...bindings, EMAIL_OTP_COOLDOWN: {} as never })
    expect(result.success).toBe(false)
  })

  test("accepts an optional bounded OTP limit-test secret", () => {
    const secret = "x".repeat(32)
    const result = workerBindingsParse({ ...bindings, OTP_LIMIT_TEST_SECRET: secret })
    expect(result.success).toBe(true)
    if (!result.success) return
    expect(result.data.OTP_LIMIT_TEST_SECRET).toBe(secret)

    const short = workerBindingsParse({ ...bindings, OTP_LIMIT_TEST_SECRET: "x".repeat(31) })
    expect(short.success).toBe(false)

    const long = workerBindingsParse({ ...bindings, OTP_LIMIT_TEST_SECRET: "x".repeat(257) })
    expect(long.success).toBe(false)
  })
})
