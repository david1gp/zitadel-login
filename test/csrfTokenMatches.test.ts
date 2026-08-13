import { describe, expect, test } from "bun:test"

import { csrfTokenMatches } from "../src/http/csrfTokenMatches"

describe("csrf token comparison", () => {
  test("accepts equal values and rejects changed or differently sized values", () => {
    expect(csrfTokenMatches("A".repeat(43), "A".repeat(43))).toBe(true)
    expect(csrfTokenMatches(`${"A".repeat(42)}B`, "A".repeat(43))).toBe(false)
    expect(csrfTokenMatches("A".repeat(42), "A".repeat(43))).toBe(false)
  })
})
