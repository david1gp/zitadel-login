import { describe, expect, test, vi } from "vitest"

import { browserHistoryNavigate } from "../client/src/flow/model/browserHistoryNavigate"
import { browserLocationAssign } from "../client/src/flow/model/browserLocationAssign"
import { browserUrlRead } from "../client/src/flow/model/browserUrlRead"

describe("browser navigation adapters", () => {
  test("browserLocationAssign navigates and returns ok Result", () => {
    const assignMock = vi.fn()
    const mockWindow = { location: { assign: assignMock } } as unknown as Window
    const result = browserLocationAssign(mockWindow, "/api/fallback")
    expect(result.success).toBe(true)
    expect(assignMock).toHaveBeenCalledWith("/api/fallback")
  })

  test("browserLocationAssign catches throwing error and returns ResultErr", () => {
    const mockWindow = {
      location: {
        assign: () => {
          throw new Error("Navigation blocked")
        },
      },
    } as unknown as Window
    const result = browserLocationAssign(mockWindow, "/api/fallback")
    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.errorMessage).toBe("Could not navigate to target URL.")
    }
  })

  test("browserHistoryNavigate updates history and returns ok Result", () => {
    const replaceMock = vi.fn()
    const pushMock = vi.fn()
    const mockWindow = {
      history: { replaceState: replaceMock, pushState: pushMock },
    } as unknown as Window

    const resPush = browserHistoryNavigate(mockWindow, "/login/email-otp", false)
    expect(resPush.success).toBe(true)
    expect(pushMock).toHaveBeenCalledWith(null, "", "/login/email-otp")

    const resReplace = browserHistoryNavigate(mockWindow, "/login", true)
    expect(resReplace.success).toBe(true)
    expect(replaceMock).toHaveBeenCalledWith(null, "", "/login")
  })

  test("browserUrlRead parses location.href and returns Result<URL>", () => {
    const mockWindow = { location: { href: "https://login.example.com/login?authRequest=req1" } } as unknown as Window
    const result = browserUrlRead(mockWindow)
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.pathname).toBe("/login")
      expect(result.data.searchParams.get("authRequest")).toBe("req1")
    }
  })
})
