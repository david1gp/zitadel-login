import { describe, expect, test } from "bun:test"

import { pageBackgroundScreenFromDemoGet } from "../client/src/demo/model/pageBackgroundScreenFromDemoGet"
import { demoScenarios } from "../client/src/demo/model/demoScenarios"

describe("pageBackgroundScreenFromDemoGet", () => {
  test("returns a screen for every catalog scenario", () => {
    for (const scenario of demoScenarios) {
      expect(pageBackgroundScreenFromDemoGet(scenario.id).length).toBeGreaterThan(2)
    }
  })

  test("uses distinct patterns for common screens", () => {
    expect(pageBackgroundScreenFromDemoGet("directory")).toBe("directory")
    expect(pageBackgroundScreenFromDemoGet("chooser")).toBe("chooser")
    expect(pageBackgroundScreenFromDemoGet("email-otp-code")).toBe("email_otp")
    expect(pageBackgroundScreenFromDemoGet("password")).toBe("password")
    expect(pageBackgroundScreenFromDemoGet("password-change")).toBe("password_change")
    expect(pageBackgroundScreenFromDemoGet("passkey")).toBe("passkey")
    expect(pageBackgroundScreenFromDemoGet("idp")).toBe("identity_provider")
    expect(pageBackgroundScreenFromDemoGet("mfa-totp")).toBe("mfa")
    expect(pageBackgroundScreenFromDemoGet("recovery-request")).toBe("password_recovery")
    expect(pageBackgroundScreenFromDemoGet("reset")).toBe("password_reset")
    expect(pageBackgroundScreenFromDemoGet("unsupported")).toBe("unsupported")
  })
})
