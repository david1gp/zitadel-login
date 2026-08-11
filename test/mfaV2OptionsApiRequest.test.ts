import { describe, expect, test } from "bun:test"
import { mfaV2OptionsApiRequest } from "../client/src/mfa/api/mfaV2OptionsApiRequest"

describe("mfaV2OptionsApiRequest", () => {
  test("returns MfaOptions data on successful API response", async () => {
    const fetchMock = async () =>
      Response.json({
        success: true,
        data: {
          mode: "check",
          method: { type: "totp" },
        },
      })

    const res = await mfaV2OptionsApiRequest("https://login.example", "flow-123", fetchMock as unknown as typeof fetch)
    expect(res).toEqual({
      success: true,
      data: {
        mode: "check",
        method: { type: "totp" },
      },
    })
  })

  test("handles select mode with multiple enrolled factors", async () => {
    const fetchMock = async () =>
      Response.json({
        success: true,
        data: {
          mode: "select",
          methods: [{ type: "totp" }, { type: "email_otp" }],
        },
      })

    const res = await mfaV2OptionsApiRequest("https://login.example", "flow-123", fetchMock as unknown as typeof fetch)
    expect(res.success).toBe(true)
    if (res.success) {
      expect(res.data.mode).toBe("select")
    }
  })

  test("returns error result on API error response", async () => {
    const fetchMock = async () =>
      Response.json(
        {
          success: false,
          op: "mfaOptions",
          errorMessage: "mfa_unavailable",
        },
        { status: 503 },
      )

    const res = await mfaV2OptionsApiRequest("https://login.example", "flow-123", fetchMock as unknown as typeof fetch)
    expect(res).toEqual({
      success: false,
      op: "mfaV2OptionsApiRequest",
      errorMessage: "mfa_unavailable",
    })
  })

  test("returns error result when flowHandle is missing", async () => {
    const res = await mfaV2OptionsApiRequest("https://login.example", "")
    expect(res).toEqual({
      success: false,
      op: "mfaV2OptionsApiRequest",
      errorMessage: "flow_handle_missing",
    })
  })

  test("returns error result on invalid schema response", async () => {
    const fetchMock = async () => Response.json({ success: true, data: { mode: "unknown_mode" } })
    const res = await mfaV2OptionsApiRequest("https://login.example", "flow-123", fetchMock as unknown as typeof fetch)
    expect(res.success).toBe(false)
    if (!res.success) {
      expect(res.errorMessage).toBe("mfa_unavailable")
    }
  })
})
