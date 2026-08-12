import { describe, expect, test } from "bun:test"

import { demoChromeRead } from "../client/src/demo/model/demoChromeRead"
import { demoMfaPathGet } from "../client/src/demo/model/demoMfaPathGet"
import { demoMethodPathGet } from "../client/src/demo/model/demoMethodPathGet"
import { demoPathIsActive } from "../client/src/demo/model/demoPathIsActive"
import { demoScenarioRead } from "../client/src/demo/model/demoScenarioRead"
import { demoScenarios } from "../client/src/demo/model/demoScenarios"
import { demoScenariosFilter } from "../client/src/demo/model/demoScenariosFilter"
import { demoSearchRead } from "../client/src/demo/model/demoSearchRead"
import { demoUrlGet } from "../client/src/demo/model/demoUrlGet"

describe("demo routing", () => {
  test("treats only /demo paths as the isolated gallery", () => {
    expect(demoPathIsActive("/demo")).toBe(true)
    expect(demoPathIsActive("/demo/password")).toBe(true)
    expect(demoPathIsActive("/login")).toBe(false)
    expect(demoPathIsActive("/password/forgot")).toBe(false)
  })

  test("resolves every catalog path back to its scenario", () => {
    for (const scenario of demoScenarios) {
      expect(demoScenarioRead(scenario.path).id).toBe(scenario.id)
      expect(demoScenarioRead(`${scenario.path}/`).id).toBe(scenario.id)
    }
  })

  test("falls back to the directory for unknown demo paths", () => {
    expect(demoScenarioRead("/demo/missing").id).toBe("directory")
  })

  test("keeps chrome and search in the shareable demo URL", () => {
    expect(demoUrlGet({ path: "/demo/password", chrome: "sidebar", query: "" })).toBe("/demo/password")
    expect(demoUrlGet({ path: "/demo/password", chrome: "compact", query: "totp", picker: true })).toBe(
      "/demo/password?chrome=compact&q=totp&picker=1",
    )
    expect(demoChromeRead("?chrome=compact")).toBe("compact")
    expect(demoChromeRead("")).toBe("sidebar")
    expect(demoSearchRead("?q=passkey")).toBe("passkey")
  })

  test("filters the directory by group, label, or detail", () => {
    const matches = demoScenariosFilter(demoScenarios, "chooser with recent")
    expect(matches.map((scenario) => scenario.id)).toEqual(["chooser-recent"])
  })

  test("maps method and MFA choices onto demo paths", () => {
    expect(demoMethodPathGet({ method: "email_otp" })).toBe("/demo/email-otp")
    expect(demoMethodPathGet({ method: "identity_provider", identityProviderId: "google", subroute: "failure" })).toBe(
      "/demo/idp/failure",
    )
    expect(demoMfaPathGet({ method: "mfa", factor: "totp" }, "mfa-select")).toBe("/demo/mfa/totp")
    expect(demoMfaPathGet({ method: "mfa", factor: "totp" }, "mfa-enroll")).toBe("/demo/mfa/totp-enroll")
    expect(demoMfaPathGet(undefined, "mfa-select")).toBe("/demo/chooser")
  })
})
