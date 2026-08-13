import { cleanup, fireEvent, render, screen } from "@solidjs/testing-library"
import { afterEach, describe, expect, test, vi } from "vitest"

import { MfaSmsOtpPanel } from "../client/src/mfa/ui/MfaSmsOtpPanel"

afterEach(cleanup)

const apiOrigin = "https://worker.example"
const flowHandle = "flow-123"
const csrfToken = "B".repeat(43)

describe("MfaSmsOtpPanel component", () => {
  test("renders Stage 1 send code button and transitions to Stage 2 on click", async () => {
    let busyState = false
    const fetchMock = vi.fn(
      async () =>
        new Response(
          JSON.stringify({
            success: true,
            data: {
              kind: "render",
              route: `/login/mfa?flow=${flowHandle}`,
              screen: { name: "mfa", factors: ["sms_otp"] },
              csrfToken,
            },
          }),
          { status: 202, headers: { "Content-Type": "application/json" } },
        ),
    )

    render(() => (
      <MfaSmsOtpPanel
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
        statusContinue={() => undefined}
        showRootChooser={() => undefined}
        fetchFn={fetchMock as unknown as typeof fetch}
      />
    ))

    expect(screen.getByRole("heading", { name: "SMS code" })).toBeTruthy()
    expect(screen.getAllByRole("heading", { level: 1 })).toHaveLength(1)
    expect(screen.queryByText("2-Step Verification")).toBeNull()

    const sendBtn = screen.getByRole("button", { name: "Send code" })
    fireEvent.click(sendBtn)

    await vi.waitFor(() => {
      expect(screen.getByRole("heading", { name: "SMS verification code" })).toBeTruthy()
    })

    const input = screen.getByRole("textbox", { name: "Verification code" }) as HTMLInputElement
    expect(input.getAttribute("autocomplete")).toBe("one-time-code")
    expect(input.getAttribute("inputmode")).toBe("numeric")
    expect(input.getAttribute("maxlength")).toBe("20")
    expect(input.getAttribute("pattern")).toBe("[A-Za-z0-9-]{6,20}")
  })

  test("submits 8-digit deployed code and calls statusContinue on completion", async () => {
    let continuedUrl = ""
    let busyState = false
    const fetchMock = vi.fn(async (url: RequestInfo | URL) => {
      const urlStr = String(url)
      if (urlStr.includes("/challenge")) {
        return new Response(
          JSON.stringify({
            success: true,
            data: {
              kind: "render",
              route: `/login/mfa?flow=${flowHandle}`,
              screen: { name: "mfa", factors: ["sms_otp"] },
              csrfToken,
            },
          }),
          { status: 202, headers: { "Content-Type": "application/json" } },
        )
      }
      return Response.json({
        success: true,
        data: {
          kind: "complete",
          path: `/api/v2/flow/continue?flow=${flowHandle}`,
        },
      })
    })

    render(() => (
      <MfaSmsOtpPanel
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

    fireEvent.click(screen.getByRole("button", { name: "Send code" }))

    await vi.waitFor(() => {
      expect(screen.getByRole("textbox", { name: "Verification code" })).toBeTruthy()
    })

    const input = screen.getByRole("textbox", { name: "Verification code" }) as HTMLInputElement
    fireEvent.input(input, { target: { value: "12345678" } })

    const verifyBtn = screen.getByRole("button", { name: "Verify" })
    fireEvent.click(verifyBtn)

    await vi.waitFor(() => {
      expect(continuedUrl).toBe(`/api/v2/flow/continue?flow=${flowHandle}`)
    })
  })

  test("sanitizes code input on paste", async () => {
    const fetchMock = vi.fn(
      async () =>
        new Response(
          JSON.stringify({
            success: true,
            data: {
              kind: "render",
              route: `/login/mfa?flow=${flowHandle}`,
              screen: { name: "mfa", factors: ["sms_otp"] },
              csrfToken,
            },
          }),
          { status: 202, headers: { "Content-Type": "application/json" } },
        ),
    )

    render(() => (
      <MfaSmsOtpPanel
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
        fetchFn={fetchMock as unknown as typeof fetch}
      />
    ))

    fireEvent.click(screen.getByRole("button", { name: "Send code" }))

    await vi.waitFor(() => {
      expect(screen.getByRole("textbox", { name: "Verification code" })).toBeTruthy()
    })

    const input = screen.getByRole("textbox", { name: "Verification code" }) as HTMLInputElement
    fireEvent.input(input, { target: { value: " 1234-5678 " } })

    expect(input.value).toBe("1234-5678")
  })
})
