import { describe, expect, test } from "bun:test"

import { appIngressRead } from "../client/src/flow/model/appIngressRead"
import { loginRoutePathGet } from "../client/src/flow/model/loginRoutePathGet"
import { loginRouteRead } from "../client/src/flow/model/loginRouteRead"

describe("login URL state", () => {
  test("round-trips canonical method paths", () => {
    const selections = [
      { method: "email_otp" as const },
      { method: "password" as const },
      { method: "passkey" as const },
      { method: "mfa" as const },
      { method: "mfa" as const, factor: "totp" as const },
      { method: "mfa" as const, factor: "email_otp" as const },
      { method: "mfa" as const, factor: "sms_otp" as const },
      { method: "mfa" as const, factor: "u2f" as const },
      { method: "mfa" as const, factor: "passkey" as const },
      { method: "identity_provider" as const, identityProviderId: "github/contentoren" },
    ]
    for (const selection of selections) {
      const result = loginRouteRead(loginRoutePathGet(selection))
      expect(result).toEqual({ success: true, data: selection })
    }
  })

  test("accepts only one bounded ingress auth request", () => {
    expect(appIngressRead(new URL("https://login.example/login?authRequest=request-1"))).toEqual({
      success: true,
      data: "request-1",
    })
    expect(appIngressRead(new URL("https://login.example/login?authRequest=one&authRequest=two")).success).toBe(false)
    expect(appIngressRead(new URL("https://login.example/login?token=secret")).success).toBe(false)
  })

  test("keeps the selected method when ingress state is attached to its bookmarkable path", () => {
    const url = new URL("https://login.example/login/idp/github-1?authRequest=request-1")
    expect(appIngressRead(url)).toEqual({ success: true, data: "request-1" })
    expect(loginRouteRead(url.pathname)).toEqual({
      success: true,
      data: { method: "identity_provider", identityProviderId: "github-1" },
    })
  })
})
