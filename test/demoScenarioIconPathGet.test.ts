import { describe, expect, test } from "bun:test"

import { mdiEmailOutline } from "@adaptive-ds/mdi/mdiEmailOutline.js"
import { mdiFingerprint } from "@adaptive-ds/mdi/mdiFingerprint.js"
import { mdiViewList } from "@adaptive-ds/mdi/mdiViewList.js"

import { demoScenarioIconPathGet } from "../client/src/demo/model/demoScenarioIconPathGet"
import { demoScenarios } from "../client/src/demo/model/demoScenarios"

describe("demoScenarioIconPathGet", () => {
  test("returns a path for every catalog scenario", () => {
    for (const scenario of demoScenarios) {
      expect(demoScenarioIconPathGet(scenario.id).length).toBeGreaterThan(10)
    }
  })

  test("uses method-specific icons for common screens", () => {
    expect(demoScenarioIconPathGet("directory")).toBe(mdiViewList)
    expect(demoScenarioIconPathGet("email-otp-code")).toBe(mdiEmailOutline)
    expect(demoScenarioIconPathGet("passkey")).toBe(mdiFingerprint)
  })
})
