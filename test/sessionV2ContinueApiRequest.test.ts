import { describe, expect, test } from "bun:test"

import { sessionV2ContinueApiRequest } from "../client/src/session/api/sessionV2ContinueApiRequest"

const apiOrigin = "https://login.example"
const flowHandle = "AAAAAAAAAAAAAAAAAAAAAA"
const csrfToken = "B".repeat(43)

describe("sessionV2ContinueApiRequest client API tests", () => {
  test("returns success result on valid server completion transition", async () => {
    const origFetch = globalThis.fetch
    globalThis.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input)
      expect(url).toBe(`https://login.example/api/v2/session/continue?flow=${flowHandle}`)
      expect(init?.method).toBe("POST")
      const body = JSON.parse(String(init?.body))
      expect(body).toEqual({ accountId: "acc_12345678", csrfToken })
      return Response.json({
        success: true,
        data: {
          kind: "complete",
          path: `/api/v2/flow/continue?flow=${flowHandle}`,
        },
      })
    }

    try {
      const res = await sessionV2ContinueApiRequest(apiOrigin, flowHandle, {
        accountId: "acc_12345678",
        csrfToken,
      })
      expect(res.success).toBe(true)
      if (res.success) {
        expect(res.data.kind).toBe("complete")
      }
    } finally {
      globalThis.fetch = origFetch
    }
  })

  test("returns error result on non-ok response", async () => {
    const origFetch = globalThis.fetch
    globalThis.fetch = async () =>
      Response.json({ success: false, op: "sessionContinue", errorMessage: "account_invalid" }, { status: 401 })

    try {
      const res = await sessionV2ContinueApiRequest(apiOrigin, flowHandle, {
        accountId: "acc_12345678",
        csrfToken,
      })
      expect(res.success).toBe(false)
      if (!res.success) {
        expect(res.errorMessage).toBe("The selected account is no longer valid.")
      }
    } finally {
      globalThis.fetch = origFetch
    }
  })
})
