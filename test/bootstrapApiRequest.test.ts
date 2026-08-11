import { afterEach, describe, expect, test } from "bun:test"

import { bootstrapApiRequest } from "../client/src/branding/api/bootstrapApiRequest"

const originalFetch = globalThis.fetch

afterEach(() => {
  globalThis.fetch = originalFetch
})

describe("bootstrap browser API", () => {
  test("validates the Result projection and sends only the ingress request", async () => {
    globalThis.fetch = async (input, init) => {
      expect(String(input)).toBe("https://worker.example/api/v2/bootstrap?authRequest=request-1")
      expect(init).toEqual({ credentials: "include" })
      return Response.json({
        success: true,
        data: {
          branding: {
            dark: { colors: { background: "#111111", font: "#ffffff", primary: "#eeeeee", warn: "#ff0000" } },
            disableWatermark: true,
            light: { colors: { background: "#ffffff", font: "#111111", primary: "#225544", warn: "#aa0000" } },
            themeMode: "system",
          },
          identityProviders: [{ id: "github-1", name: "GitHub", type: "github" }],
          organization: { id: "org-1", name: "Contentoren" },
          primaryMethods: ["email_otp", "identity_provider"],
          updatedAt: 1,
        },
      })
    }

    const result = await bootstrapApiRequest("https://worker.example", "request-1")
    expect(result.success).toBe(true)
  })

  test("rejects malformed successful data", async () => {
    globalThis.fetch = async () => Response.json({ success: true, data: { token: "must-not-be-accepted" } })
    const result = await bootstrapApiRequest("https://worker.example", "request-1")
    expect(result.success).toBe(false)
  })
})
