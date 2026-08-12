import { describe, expect, test } from "bun:test"
import * as v from "valibot"

import { passwordResetRequestSchema } from "../src/password-recovery/model/passwordResetRequestSchema"

describe("passwordResetRequestSchema", () => {
  test("normalizes a bounded email and accepts only the memory CSRF contract", () => {
    const parsed = v.safeParse(passwordResetRequestSchema, {
      email: "  PERSON@Example.COM ",
      csrfToken: "C".repeat(43),
    })

    expect(parsed.success).toBe(true)
    if (!parsed.success) return
    expect(parsed.output).toEqual({ email: "person@example.com", csrfToken: "C".repeat(43) })
    expect(
      v.safeParse(passwordResetRequestSchema, {
        email: `${"x".repeat(250)}@example.com`,
        csrfToken: "C".repeat(43),
      }).success,
    ).toBe(false)
    expect(
      v.safeParse(passwordResetRequestSchema, {
        email: "person@example.com",
        csrfToken: "C".repeat(43),
        redirectUrl: "https://attacker.example",
      }).success,
    ).toBe(false)
  })
})
