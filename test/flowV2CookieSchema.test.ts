import { describe, expect, test } from "bun:test"
import * as v from "valibot"

import { flowV2CookieSchema } from "../src/flow/model/flowV2CookieSchema"

const base = {
  version: 2 as const,
  flowHandle: "A".repeat(22),
  requestKind: "oidc" as const,
  authRequestId: "request-1",
  clientId: "client-1",
  redirectUri: "https://client.example/callback",
  organizationId: "org-1",
  prompt: ["PROMPT_LOGIN" as const],
  csrfToken: "B".repeat(43),
  issuedAt: 1_800_000_000,
  expiresAt: 1_800_000_900,
  transitionCounter: 1,
}

describe("V2 email OTP cooldown cookie state", () => {
  test("accepts old and cooldown-bearing primary states", () => {
    const state = {
      ...base,
      stage: "otp" as const,
      delegable: false as const,
      userId: "user-1",
      sessionId: "session-1",
      sessionToken: "session-token",
    }

    expect(v.safeParse(flowV2CookieSchema, state).success).toBe(true)
    expect(v.safeParse(flowV2CookieSchema, { ...state, cooldownExpiresAt: 1_800_000_060 }).success).toBe(true)
  })

  test("accepts cooldown-bearing decoy and MFA email OTP states", () => {
    expect(
      v.safeParse(flowV2CookieSchema, {
        ...base,
        stage: "otp_decoy",
        delegable: false,
        cooldownExpiresAt: 1_800_000_060,
      }).success,
    ).toBe(true)
    expect(
      v.safeParse(flowV2CookieSchema, {
        ...base,
        stage: "mfa_email_otp_code",
        delegable: false,
        userId: "user-1",
        sessionId: "session-1",
        sessionToken: "session-token",
        mfaMethods: ["AUTHENTICATION_METHOD_TYPE_OTP_EMAIL"],
        cooldownExpiresAt: 1_800_000_060,
      }).success,
    ).toBe(true)
  })
})
