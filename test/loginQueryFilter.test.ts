import { describe, expect, test } from "vitest"

import { loginQueryFilter } from "../client/src/flow/model/loginQueryFilter"

describe("loginQueryFilter", () => {
  test("returns empty string when query is empty", () => {
    expect(loginQueryFilter("")).toBe("")
    expect(loginQueryFilter("?")).toBe("")
  })

  test("preserves allowed query parameters flow, dialog, q", () => {
    expect(loginQueryFilter("?flow=abc12345678901234567890123456789")).toBe("?flow=abc12345678901234567890123456789")
    expect(loginQueryFilter("dialog=open&q=test")).toBe("?dialog=open&q=test")
  })

  test("scrubs ingress-only query parameters like authRequest and code", () => {
    expect(loginQueryFilter("?authRequest=req123")).toBe("")
    expect(loginQueryFilter("?authRequest=req123&flow=123")).toBe("?flow=123")
    expect(loginQueryFilter("?code=secret&id=123")).toBe("")
  })
})
