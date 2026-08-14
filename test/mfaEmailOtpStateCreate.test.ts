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
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      if (String(input).includes("/cooldown")) {
        const expiresAt = Math.ceil(Date.now() / 1000) + 60
        return Response.json({
          success: true,
          data: { cooldownExpiresAt: expiresAt, cooldownRemainingSeconds: 60 },
        })
      }
      return new Response(
        JSON.stringify({
          success: true,
          data: {
            kind: "render",
            route: `/login/mfa?flow=${flowHandle}`,
            screen: { name: "mfa_email_otp_code", challengeIssued: true },
            csrfToken,
          },
        }),
        { status: 202, headers: { "Content-Type": "application/json" } },
      )
    })

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
    await new Promise((resolve) => setTimeout(resolve, 0))
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

  test("starts in stage 'enroll' when enrollment is authorized and resets back to it", async () => {
    const state = mfaEmailOtpStateCreate({
      apiOrigin: () => apiOrigin,
      flowHandle: () => flowHandle,
      csrfToken: () => csrfToken,
      csrfTokenSet: () => {},
      busy: () => false,
      busySet: () => {},
      errorClear: () => {},
      failureSet: () => {},
      fallbackContinue: () => {},
      statusContinue: () => {},
      showRootChooser: () => {},
      isEnrollment: true,
    })

    expect(state.stage()).toBe("enroll")
    state.reset()
    expect(state.stage()).toBe("enroll")
  })

  test("enroll advances to the enrollment-aware code stage without a duplicate challenge", async () => {
    let busyState = false
    let updatedCsrf = ""
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      if (String(input).includes("/cooldown")) {
        const expiresAt = Math.ceil(Date.now() / 1000) + 60
        return Response.json({
          success: true,
          data: { cooldownExpiresAt: expiresAt, cooldownRemainingSeconds: 60 },
        })
      }
      return Response.json(
        {
          success: true,
          data: {
            transition: {
              kind: "render",
              route: `/login/mfa?flow=${flowHandle}`,
              screen: { name: "mfa_email_otp_code", challengeIssued: true },
              csrfToken: "D".repeat(43),
            },
          },
        },
        { status: 201 },
      )
    })

    const state = mfaEmailOtpStateCreate({
      apiOrigin: () => apiOrigin,
      flowHandle: () => flowHandle,
      csrfToken: () => csrfToken,
      csrfTokenSet: (token) => {
        updatedCsrf = token
      },
      busy: () => busyState,
      busySet: (val) => {
        busyState = val
      },
      errorClear: () => {},
      failureSet: () => {},
      fallbackContinue: () => {},
      statusContinue: () => {},
      showRootChooser: () => {},
      fetchFn: fetchMock as unknown as typeof fetch,
      isEnrollment: true,
    })

    await state.enroll()

    await new Promise((resolve) => setTimeout(resolve, 0))
    expect(fetchMock).toHaveBeenCalledTimes(2)
    expect(String(fetchMock.mock.calls[0]?.[0])).toContain("/api/v2/mfa/email-otp/enroll")
    expect(state.stage()).toBe("code")
    expect(updatedCsrf).toBe("D".repeat(43))
    expect(state.countdown()).toBeGreaterThan(0)
  })

  test("enroll ignores duplicate invocations while a request is in flight", async () => {
    let busyState = false
    let release: (() => void) | undefined
    const pending = new Promise<void>((resolve) => {
      release = resolve
    })
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      if (String(input).includes("/cooldown")) {
        return Response.json({ success: true, data: { cooldownExpiresAt: 0, cooldownRemainingSeconds: 0 } })
      }
      await pending
      return Response.json(
        {
          success: true,
          data: {
            transition: {
              kind: "render",
              route: `/login/mfa?flow=${flowHandle}`,
              screen: { name: "mfa", factors: ["email_otp"] },
              csrfToken: "D".repeat(43),
            },
          },
        },
        { status: 201 },
      )
    })

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
      fetchFn: fetchMock as unknown as typeof fetch,
      isEnrollment: true,
    })

    const first = state.enroll()
    const second = state.enroll()
    release?.()
    await Promise.all([first, second])

    expect(fetchMock.mock.calls.filter(([input]) => !String(input).includes("/cooldown"))).toHaveLength(1)
    expect(state.stage()).toBe("code")
  })

  test("enroll routes fallback and complete transitions without entering the code stage", async () => {
    const transitionStateCreate = (
      data: unknown,
      handlers: { fallback?: (p?: string) => void; complete?: (p: string) => void },
    ) =>
      mfaEmailOtpStateCreate({
        apiOrigin: () => apiOrigin,
        flowHandle: () => flowHandle,
        csrfToken: () => csrfToken,
        csrfTokenSet: () => {},
        busy: () => false,
        busySet: () => {},
        errorClear: () => {},
        failureSet: () => {},
        fallbackContinue: handlers.fallback ?? (() => {}),
        statusContinue: handlers.complete ?? (() => {}),
        showRootChooser: () => {},
        fetchFn: (async () => Response.json(data, { status: 201 })) as unknown as typeof fetch,
        isEnrollment: true,
      })

    let fallbackPath: string | undefined = ""
    const fallbackState = transitionStateCreate(
      { success: true, data: { transition: { kind: "fallback", path: `/api/v2/flow/fallback?flow=${flowHandle}` } } },
      { fallback: (p) => (fallbackPath = p) },
    )
    await fallbackState.enroll()
    expect(fallbackPath).toBe(`/api/v2/flow/fallback?flow=${flowHandle}`)
    expect(fallbackState.stage()).toBe("enroll")

    let completePath = ""
    const completeState = transitionStateCreate(
      { success: true, data: { transition: { kind: "complete", path: `/api/v2/flow/continue?flow=${flowHandle}` } } },
      { complete: (p) => (completePath = p) },
    )
    await completeState.enroll()
    expect(completePath).toBe(`/api/v2/flow/continue?flow=${flowHandle}`)
    expect(completeState.stage()).toBe("enroll")
  })

  test("enroll surfaces failures and stays on the enrollment stage for a retry", async () => {
    let failure = ""
    const fetchMock = vi.fn(async () =>
      Response.json({ success: false, op: "mfaEmailOtpEnrollment", errorMessage: "flow_replayed" }, { status: 409 }),
    )
    const state = mfaEmailOtpStateCreate({
      apiOrigin: () => apiOrigin,
      flowHandle: () => flowHandle,
      csrfToken: () => csrfToken,
      csrfTokenSet: () => {},
      busy: () => false,
      busySet: () => {},
      errorClear: () => {},
      failureSet: (msg) => {
        failure = msg
      },
      fallbackContinue: () => {},
      statusContinue: () => {},
      showRootChooser: () => {},
      fetchFn: fetchMock as unknown as typeof fetch,
      isEnrollment: true,
    })

    await state.enroll()

    expect(failure).toBe("The sign-in request was already completed.")
    expect(state.stage()).toBe("enroll")
  })
})
