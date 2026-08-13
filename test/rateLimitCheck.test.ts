import { describe, expect, test } from "bun:test"

import { rateLimitCheck } from "../src/http/rateLimitCheck"

const cookieKey = "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA"

describe("rate limit checking", () => {
  test("checks opaque keys in caller order without exposing values", async () => {
    const keys: string[] = []
    const result = await rateLimitCheck(
      {
        limit: async ({ key }) => {
          keys.push(key)
          return { success: true }
        },
      },
      cookieKey,
      "scope",
      [
        ["email", "secret-person@example.com"],
        ["ip", "203.0.113.42"],
      ],
      { errorMessage: "key_failed", keyOperation: "keyCreate", operation: "limitCheck" },
    )

    expect(result).toEqual({ success: true, data: undefined })
    expect(keys).toHaveLength(2)
    expect(keys[0]).toMatch(/^scope:email:[A-Za-z0-9_-]{43}$/)
    expect(keys[1]).toMatch(/^scope:ip:[A-Za-z0-9_-]{43}$/)
    expect(JSON.stringify(keys)).not.toContain("secret-person@example.com")
    expect(JSON.stringify(keys)).not.toContain("203.0.113.42")
  })

  test("preserves limited and unavailable outcomes", async () => {
    const limited = await rateLimitCheck(
      { limit: async () => ({ success: false }) },
      cookieKey,
      "scope",
      [["subject", "value"]],
      { errorMessage: "key_failed", keyOperation: "keyCreate", operation: "limitCheck" },
    )
    expect(limited).toEqual({ success: false, op: "limitCheck", errorMessage: "rate_limited" })

    const unavailable = await rateLimitCheck(
      {
        limit: async () => {
          throw new Error("not exposed")
        },
      },
      cookieKey,
      "scope",
      [["subject", "value"]],
      { errorMessage: "key_failed", keyOperation: "keyCreate", operation: "limitCheck" },
    )
    expect(unavailable).toEqual({ success: false, op: "limitCheck", errorMessage: "rate_limiter_unavailable" })
  })

  test("returns the caller-selected key failure contract", async () => {
    const result = await rateLimitCheck(
      { limit: async () => ({ success: true }) },
      "not-a-key",
      "scope",
      [["subject", "value"]],
      { errorMessage: "key_failed", keyOperation: "keyCreate", operation: "limitCheck" },
    )
    expect(result).toEqual({ success: false, op: "keyCreate", errorMessage: "key_failed" })
  })
})
