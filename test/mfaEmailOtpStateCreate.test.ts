import { describe, expect, test, vi } from "vitest"

import { mfaEmailOtpStateCreate } from "../client/src/mfa/ui/mfaEmailOtpStateCreate"

const apiOrigin = "https://worker.example"
const flowHandle = "flow-handle-123"
const csrfToken = "B".repeat(43)

describe("mfaEmailOtpStateCreate", () => {
  test("initializes in stage 'send' with empty code and zero countdown", () => {
    let busyState = false
    const state = mfaEmailOtpStateCreate({
      apiOrigin: () => apiOrigin,
      flowHandle: () => flowHandle,
      csrfToken: () => csrfToken,
      csrfTokenSet: () => {},
      busy: () => busyState,
      busySet: (val) => {
        busyState = val
      },
      errorClear: () => {},
      failureSet: () => {},
      fallbackContinue: () => {},
      statusContinue: () => {},
      showRootChooser: () => {},
    })

    expect(state.stage()).toBe("send")
    expect(state.code()).toBe("")
    expect(state.countdown()).toBe(0)
    expect(state.valid()).toBe(false)
  })

  test("sendCode triggers challenge API and advances stage to 'code' on success", async () => {
    let busyState = false
    let failureMsg = ""
    const fetchMock = vi.fn(
      async () =>
        new Response(
          JSON.stringify({
            success: true,
            data: {
              kind: "render",
              route: `/login/mfa?flow=${flowHandle}`,
              screen: { name: "mfa", factors: ["email_otp"] },
              csrfToken,
            },
          }),
          { status: 202, headers: { "Content-Type": "application/json" } },
        ),
    )

    const state = mfaEmailOtpStateCreate({
      apiOrigin: () => apiOrigin,
      flowHandle: () => flowHandle,
      csrfToken: () => csrfToken,
      csrfTokenSet: () => {},
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
      showRootChooser: () => {},
      fetchFn: fetchMock as unknown as typeof fetch,
    })

    await state.sendCode()

    expect(state.stage()).toBe("code")
    expect(state.notice()).toBe("Verification code sent to your email address.")
    expect(state.countdown()).toBeGreaterThan(0)
    expect(failureMsg).toBe("")

    state.reset()
    expect(state.stage()).toBe("send")
  })

  test("codeInput cleans and validates code between 6 and 20 characters", () => {
    let busyState = false
    const state = mfaEmailOtpStateCreate({
      apiOrigin: () => apiOrigin,
      flowHandle: () => flowHandle,
      csrfToken: () => csrfToken,
      csrfTokenSet: () => {},
      busy: () => busyState,
      busySet: (val) => {
        busyState = val
      },
      errorClear: () => {},
      failureSet: () => {},
      fallbackContinue: () => {},
      statusContinue: () => {},
      showRootChooser: () => {},
    })

    state.codeInput(" 123 45 ")
    expect(state.code()).toBe("12345")
    expect(state.valid()).toBe(false)

    state.codeInput("12345678")
    expect(state.code()).toBe("12345678")
    expect(state.valid()).toBe(true)

    state.codeInput("12345678901234567890123")
    expect(state.code()).toBe("12345678901234567890")
    expect(state.valid()).toBe(true)
  })

  test("submit verifies valid code and calls statusContinue on complete transition", async () => {
    let busyState = false
    let completedPath = ""
    const fetchMock = vi.fn(async () =>
      Response.json({
        success: true,
        data: {
          kind: "complete",
          path: `/api/v2/flow/continue?flow=${flowHandle}`,
        },
      }),
    )

    const state = mfaEmailOtpStateCreate({
      apiOrigin: () => apiOrigin,
      flowHandle: () => flowHandle,
      csrfToken: () => csrfToken,
      csrfTokenSet: () => {},
      busy: () => busyState,
      busySet: (val) => {
        busyState = val
      },
      errorClear: () => {},
      failureSet: () => {},
      fallbackContinue: () => {},
      statusContinue: (path) => {
        completedPath = path
      },
      showRootChooser: () => {},
      fetchFn: fetchMock as unknown as typeof fetch,
    })

    state.codeInput("12345678")
    const fakeEvent = { preventDefault: () => {} } as unknown as SubmitEvent
    await state.submit(fakeEvent)

    expect(completedPath).toBe(`/api/v2/flow/continue?flow=${flowHandle}`)
    expect(state.code()).toBe("") // cleared on submit
  })
})
