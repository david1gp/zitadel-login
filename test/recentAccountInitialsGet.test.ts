import { describe, expect, test } from "bun:test"

import { recentAccountInitialsGet } from "../client/src/session/model/recentAccountInitialsGet"

describe("recentAccountInitialsGet unit tests", () => {
  test("extracts initials from first and last name", () => {
    expect(recentAccountInitialsGet("Alice Smith")).toBe("AS")
    expect(recentAccountInitialsGet("Jane Marie Doe")).toBe("JD")
  })

  test("extracts initials from single name or email", () => {
    expect(recentAccountInitialsGet("alice")).toBe("AL")
    expect(recentAccountInitialsGet("bob@example.com")).toBe("BO")
    expect(recentAccountInitialsGet("charlie.brown@example.com")).toBe("CB")
  })

  test("handles empty or whitespace strings", () => {
    expect(recentAccountInitialsGet("")).toBe("")
    expect(recentAccountInitialsGet("   ")).toBe("")
  })
})
