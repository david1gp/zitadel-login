import { afterEach, describe, expect, test } from "bun:test"

import { identityProviderStateCreate } from "../client/src/identity-provider/ui/identityProviderStateCreate"
import { createSignalObject } from "../client/src/ui/createSignalObject"

const originalFetch = globalThis.fetch
const validCsrf = "C".repeat(43)
const validFlow = "A".repeat(22)

afterEach(() => {
  globalThis.fetch = originalFetch
})

describe("identityProviderStateCreate factory", () => {
  test("submits form and triggers top-level location assign on redirectUrl", async () => {
    let assignedLocation = ""
    const mockWindow = {
      location: {
        assign: (url: string) => {
          assignedLocation = url
        },
      },
    } as unknown as Window

    globalThis.fetch = async () =>
      Response.json({
        success: true,
        data: { redirectUrl: `/api/v2/identity-provider/redirect?flow=${validFlow}` },
      })

    let preferenceSaved = false
    let failureMessage = ""
    let errorCleared = false
    const busy = createSignalObject(false)

    const state = identityProviderStateCreate({
      apiOrigin: () => "https://worker.example",
      busy,
      csrfToken: () => validCsrf,
      flowHandle: () => validFlow,
      provider: () => ({ id: "google-1", name: "Google", type: "google" }),
      subroute: () => undefined,
      errorClear: () => {
        errorCleared = true
      },
      failureSet: (msg) => {
        failureMessage = msg
      },
      fallbackContinue: () => undefined,
      statusContinue: () => undefined,
      preferenceSave: () => {
        preferenceSaved = true
      },
      browserWindow: mockWindow,
    })

    expect(state.providerName()).toBe("Google")
    expect(state.providerType()).toBe("google")

    let defaultPrevented = false
    const mockEvent = {
      preventDefault: () => {
        defaultPrevented = true
      },
    } as SubmitEvent

    await state.submit(mockEvent)

    expect(defaultPrevented).toBe(true)
    expect(errorCleared).toBe(true)
    expect(preferenceSaved).toBe(true)
    expect(busy.get()).toBe(false)
    expect(failureMessage).toBe("")
    expect(assignedLocation).toBe(`/api/v2/identity-provider/redirect?flow=${validFlow}`)
  })

  test("handles start failure by calling failureSet", async () => {
    globalThis.fetch = async () =>
      Response.json({ success: false, op: "identityProviderStart", errorMessage: "idp_not_found" }, { status: 404 })

    let failureMessage = ""
    const busy = createSignalObject(false)

    const state = identityProviderStateCreate({
      apiOrigin: () => "https://worker.example",
      busy,
      csrfToken: () => validCsrf,
      flowHandle: () => validFlow,
      provider: () => ({ id: "google-1", name: "Google", type: "google" }),
      subroute: () => undefined,
      errorClear: () => undefined,
      failureSet: (msg) => {
        failureMessage = msg
      },
      fallbackContinue: () => undefined,
      statusContinue: () => undefined,
      preferenceSave: () => undefined,
    })

    const mockEvent = { preventDefault: () => undefined } as SubmitEvent
    await state.submit(mockEvent)

    expect(failureMessage).toBe("Sign-in could not be completed. Please try again.")
    expect(busy.get()).toBe(false)
  })
})
