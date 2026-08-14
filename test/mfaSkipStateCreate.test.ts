import { describe, expect, test } from "bun:test"

import { mfaStateCreate } from "../client/src/mfa/ui/mfaStateCreate"
import { lastUsedLoginMethodCandidateKey } from "../client/src/preferences/model/lastUsedLoginMethodCandidateKey"
import { lastUsedLoginMethodCandidateSave } from "../client/src/preferences/model/lastUsedLoginMethodCandidateSave"
import { lastUsedLoginMethodLoad } from "../client/src/preferences/model/lastUsedLoginMethodLoad"
import { lastUsedLoginMethodPromote } from "../client/src/preferences/model/lastUsedLoginMethodPromote"

const apiOrigin = "https://worker.example"
const flowHandle = "flow-handle-123"
const csrfToken = "B".repeat(43)

function storageCreate(): Storage {
  const values = new Map<string, string>()
  return {
    get length() {
      return values.size
    },
    clear: () => values.clear(),
    getItem: (key) => values.get(key) ?? null,
    key: (index) => [...values.keys()][index] ?? null,
    removeItem: (key) => values.delete(key),
    setItem: (key, value) => values.set(key, value),
  }
}

describe("mfaSkipStateCreate", () => {
  test("skipSubmit performs skip request and triggers statusContinue on completion", async () => {
    let busyState = false
    let completedPath = ""
    const localStorage = storageCreate()
    const sessionStorage = storageCreate()
    lastUsedLoginMethodCandidateSave(sessionStorage, flowHandle, "org-1", { method: "password" })
    const fetchMock = async (input: RequestInfo | URL) => {
      const url = String(input)
      if (url.includes("/api/v2/mfa/skip")) {
        return Response.json({
          success: true,
          data: {
            kind: "complete",
            path: `/api/v2/flow/continue?flow=${flowHandle}`,
          },
        })
      }
      return Response.json({
        success: true,
        data: {
          mode: "skip",
          reason: "optional_setup",
          methods: [{ type: "totp" }],
        },
      })
    }

    const state = mfaStateCreate({
      apiOrigin: () => apiOrigin,
      flowHandle: () => flowHandle,
      csrfToken: () => csrfToken,
      csrfTokenSet: () => {},
      selectedFactor: () => undefined,
      busy: () => busyState,
      busySet: (val) => {
        busyState = val
      },
      errorClear: () => {},
      failureSet: () => {},
      fallbackContinue: () => {},
      statusContinue: (path) => {
        completedPath = path
        lastUsedLoginMethodPromote(localStorage, sessionStorage, flowHandle, "org-1", { version: 1 })
      },
      routeSet: () => {},
      fetchFn: fetchMock as unknown as typeof fetch,
    })

    await state.skipSubmit()

    expect(completedPath).toBe(`/api/v2/flow/continue?flow=${flowHandle}`)
    expect(busyState).toBe(false)
    expect(lastUsedLoginMethodLoad(localStorage, "org-1")).toEqual({
      success: true,
      data: { version: 1, primary: { method: "password" } },
    })
    expect(sessionStorage.getItem(lastUsedLoginMethodCandidateKey(flowHandle))).toBeNull()
  })

  test("skipSubmit handles forced-policy rejection by displaying error and reloading options", async () => {
    let busyState = false
    let failureMsg = ""
    let optionsFetchedCount = 0

    const fetchMock = async (input: RequestInfo | URL) => {
      const url = String(input)
      if (url.includes("/api/v2/mfa/skip")) {
        return Response.json(
          {
            success: false,
            op: "mfaSkip",
            errorMessage: "mfa_skip_forbidden",
          },
          { status: 403 },
        )
      }
      if (url.includes("/api/v2/mfa/options")) {
        optionsFetchedCount += 1
        return Response.json({
          success: true,
          data: {
            mode: "enroll",
            methods: [{ type: "totp" }],
          },
        })
      }
      return Response.json({ success: false })
    }

    const state = mfaStateCreate({
      apiOrigin: () => apiOrigin,
      flowHandle: () => flowHandle,
      csrfToken: () => csrfToken,
      csrfTokenSet: () => {},
      selectedFactor: () => undefined,
      busy: () => busyState,
      busySet: (val) => {
        busyState = val
      },
      errorClear: () => {},
      failureSet: (msg) => {
        failureMsg = msg
      },
      fallbackContinue: () => {},
      statusContinue: () => {},
      routeSet: () => {},
      fetchFn: fetchMock as unknown as typeof fetch,
    })

    await state.skipSubmit()

    expect(failureMsg).toBe("Skipping 2-step verification is not allowed for this account.")
    expect(optionsFetchedCount).toBeGreaterThan(0)
    expect(state.options()?.mode).toBe("enroll")
  })
})
