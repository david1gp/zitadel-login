import { cleanup, fireEvent, render, screen } from "@solidjs/testing-library"
import { afterEach, describe, expect, test, vi } from "vitest"

import { MfaTotpPanel } from "../client/src/mfa/ui/MfaTotpPanel"

afterEach(cleanup)

const apiOrigin = "https://worker.example"
const flowHandle = "flow-123"
const csrfToken = "B".repeat(43)

describe("MfaTotpPanel component", () => {
  test("renders 6-digit authenticator-code form with correct accessibility and input attributes", () => {
    render(() => (
      <MfaTotpPanel
        apiOrigin={() => apiOrigin}
        flowHandle={() => flowHandle}
        csrfToken={() => csrfToken}
        csrfTokenSet={() => undefined}
        busy={() => false}
        busySet={() => undefined}
        headingRegister={() => undefined}
        errorClear={() => undefined}
        failureSet={() => undefined}
        fallbackContinue={() => undefined}
        statusContinue={() => undefined}
        showRootChooser={() => undefined}
      />
    ))

    expect(screen.getByRole("heading", { name: "Authenticator code" })).toBeTruthy()

    const input = screen.getByRole("textbox", { name: "Authenticator code" }) as HTMLInputElement
    expect(input).toBeTruthy()
    expect(input.getAttribute("autocomplete")).toBe("one-time-code")
    expect(input.getAttribute("inputmode")).toBe("numeric")
    expect(input.getAttribute("pattern")).toBe("[0-9]{6}")
    expect(input.getAttribute("maxlength")).toBe("6")
    expect(input.required).toBe(true)

    const submitBtn = screen.getByRole("button", { name: "Verify" }) as HTMLButtonElement
    expect(submitBtn.disabled).toBe(true)
  })

  test("sanitizes paste input to digits only up to 6 characters", () => {
    render(() => (
      <MfaTotpPanel
        apiOrigin={() => apiOrigin}
        flowHandle={() => flowHandle}
        csrfToken={() => csrfToken}
        csrfTokenSet={() => undefined}
        busy={() => false}
        busySet={() => undefined}
        headingRegister={() => undefined}
        errorClear={() => undefined}
        failureSet={() => undefined}
        fallbackContinue={() => undefined}
        statusContinue={() => undefined}
        showRootChooser={() => undefined}
      />
    ))

    const input = screen.getByRole("textbox", { name: "Authenticator code" }) as HTMLInputElement
    fireEvent.input(input, { target: { value: " 12-34 56 78 " } })

    expect(input.value).toBe("123456")

    const submitBtn = screen.getByRole("button", { name: "Verify" }) as HTMLButtonElement
    expect(submitBtn.disabled).toBe(false)
  })

  test("submits 6-digit code, clears input, and calls statusContinue on complete transition", async () => {
    let continuedUrl = ""
    let busyState = false
    const fetchMock = vi.fn(async () =>
      Response.json({
        success: true,
        data: {
          kind: "complete",
          path: `/api/v2/flow/continue?flow=${flowHandle}`,
        },
      }),
    )

    render(() => (
      <MfaTotpPanel
        apiOrigin={() => apiOrigin}
        flowHandle={() => flowHandle}
        csrfToken={() => csrfToken}
        csrfTokenSet={() => undefined}
        busy={() => busyState}
        busySet={(b) => {
          busyState = b
        }}
        headingRegister={() => undefined}
        errorClear={() => undefined}
        failureSet={() => undefined}
        fallbackContinue={() => undefined}
        statusContinue={(url) => {
          continuedUrl = url
        }}
        showRootChooser={() => undefined}
        fetchFn={fetchMock as unknown as typeof fetch}
      />
    ))

    const input = screen.getByRole("textbox", { name: "Authenticator code" }) as HTMLInputElement
    fireEvent.input(input, { target: { value: "123456" } })

    const submitBtn = screen.getByRole("button", { name: "Verify" })
    fireEvent.click(submitBtn)

    expect(input.value).toBe("")
    await vi.waitFor(() => {
      expect(continuedUrl).toBe(`/api/v2/flow/continue?flow=${flowHandle}`)
    })
  })

  test("displays error and re-focuses code input on verification failure", async () => {
    let failureMsg = ""
    const fetchMock = vi.fn(async () =>
      Response.json(
        {
          success: false,
          op: "mfaOtpVerify",
          errorMessage: "code_invalid",
        },
        { status: 401 },
      ),
    )

    render(() => (
      <MfaTotpPanel
        apiOrigin={() => apiOrigin}
        flowHandle={() => flowHandle}
        csrfToken={() => csrfToken}
        csrfTokenSet={() => undefined}
        busy={() => false}
        busySet={() => undefined}
        headingRegister={() => undefined}
        errorClear={() => undefined}
        failureSet={(msg) => {
          failureMsg = msg
        }}
        fallbackContinue={() => undefined}
        statusContinue={() => undefined}
        showRootChooser={() => undefined}
        fetchFn={fetchMock as unknown as typeof fetch}
      />
    ))

    const input = screen.getByRole("textbox", { name: "Authenticator code" }) as HTMLInputElement
    fireEvent.input(input, { target: { value: "000000" } })

    const submitBtn = screen.getByRole("button", { name: "Verify" })
    fireEvent.click(submitBtn)

    await vi.waitFor(() => {
      expect(failureMsg).toBe("The code is invalid or expired.")
    })
  })

  test("handles render transition for additional factor", async () => {
    let updatedCsrf = ""
    let reloaded = false
    const validNextCsrf = "D".repeat(43)
    const fetchMock = vi.fn(async () =>
      Response.json({
        success: true,
        data: {
          kind: "render",
          route: `/login/mfa?flow=${flowHandle}`,
          screen: { name: "mfa", factors: ["u2f"] },
          csrfToken: validNextCsrf,
        },
      }),
    )

    render(() => (
      <MfaTotpPanel
        apiOrigin={() => apiOrigin}
        flowHandle={() => flowHandle}
        csrfToken={() => csrfToken}
        csrfTokenSet={(tok) => {
          updatedCsrf = tok
        }}
        busy={() => false}
        busySet={() => undefined}
        headingRegister={() => undefined}
        errorClear={() => undefined}
        failureSet={() => undefined}
        fallbackContinue={() => undefined}
        statusContinue={() => undefined}
        optionsReload={async () => {
          reloaded = true
        }}
        showRootChooser={() => undefined}
        fetchFn={fetchMock as unknown as typeof fetch}
      />
    ))

    const input = screen.getByRole("textbox", { name: "Authenticator code" }) as HTMLInputElement
    fireEvent.input(input, { target: { value: "654321" } })

    const submitBtn = screen.getByRole("button", { name: "Verify" })
    fireEvent.click(submitBtn)

    await vi.waitFor(() => {
      expect(updatedCsrf).toBe(validNextCsrf)
      expect(reloaded).toBe(true)
    })
  })

  test("supports back navigation buttons", () => {
    let showChooserCalled = false
    let showRootCalled = false

    render(() => (
      <MfaTotpPanel
        apiOrigin={() => apiOrigin}
        flowHandle={() => flowHandle}
        csrfToken={() => csrfToken}
        csrfTokenSet={() => undefined}
        busy={() => false}
        busySet={() => undefined}
        headingRegister={() => undefined}
        errorClear={() => undefined}
        failureSet={() => undefined}
        fallbackContinue={() => undefined}
        statusContinue={() => undefined}
        showChooser={() => {
          showChooserCalled = true
        }}
        showRootChooser={() => {
          showRootCalled = true
        }}
      />
    ))

    fireEvent.click(screen.getByRole("button", { name: "Back to 2-step choices" }))
    expect(showChooserCalled).toBe(true)

    fireEvent.click(screen.getByRole("button", { name: "Back to methods" }))
    expect(showRootCalled).toBe(true)
  })
})
