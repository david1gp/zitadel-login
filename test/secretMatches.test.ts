import { describe, expect, test } from "bun:test"

import { secretMatches } from "../src/http/secretMatches"

describe("secret comparison", () => {
  test("accepts equal values and rejects changed or differently sized values", () => {
    expect(secretMatches("A".repeat(32), "A".repeat(32))).toBe(true)
    expect(secretMatches(`${"A".repeat(31)}B`, "A".repeat(32))).toBe(false)
    expect(secretMatches("A".repeat(31), "A".repeat(32))).toBe(false)
  })
})
