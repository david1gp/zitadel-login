import { describe, expect, test } from "bun:test"

import { demoFetchCreate } from "../client/src/demo/model/demoFetchCreate"
import { mfaV2OptionsApiRequest } from "../client/src/mfa/api/mfaV2OptionsApiRequest"
import { passwordRecoveryBootstrapApiRequest } from "../client/src/password-recovery/api/passwordRecoveryBootstrapApiRequest"

describe("demoFetchCreate", () => {
  test("serves fake MFA options without touching the network", async () => {
    const fetchFn = demoFetchCreate(() => "mfa-select")
    const result = await mfaV2OptionsApiRequest("https://demo.local", "demo-flow", fetchFn)
    expect(result.success).toBe(true)
    if (result.success) expect(result.data.mode).toBe("select")
  })

  test("serves a memory-only recovery bootstrap token", async () => {
    const fetchFn = demoFetchCreate(() => "recovery-request")
    const result = await passwordRecoveryBootstrapApiRequest("https://demo.local", fetchFn)
    expect(result.success).toBe(true)
    if (result.success) expect(result.data.csrfToken).toHaveLength(43)
  })
})
