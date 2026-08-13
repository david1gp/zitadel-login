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
})
