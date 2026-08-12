import { cleanup, fireEvent, render, screen } from "@solidjs/testing-library"
import { afterEach, describe, expect, test, vi } from "vitest"

import { MfaEmailOtpPanel } from "../client/src/mfa/ui/MfaEmailOtpPanel"

afterEach(cleanup)

const apiOrigin = "https://worker.example"
const flowHandle = "flow-123"
const csrfToken = "B".repeat(43)

describe("MfaEmailOtpPanel component", () => {
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
              screen: { name: "mfa", factors: ["email_otp"] },
              csrfToken,
            },
          }),
          { status: 202, headers: { "Content-Type": "application/json" } },
        ),
    )

    render(() => (
      <MfaEmailOtpPanel
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

    expect(screen.getByRole("heading", { name: "Email code" })).toBeTruthy()

    const sendBtn = screen.getByRole("button", { name: "Send code" })
    fireEvent.click(sendBtn)

    await vi.waitFor(() => {
      expect(screen.getByRole("heading", { name: "Email verification code" })).toBeTruthy()
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
              screen: { name: "mfa", factors: ["email_otp"] },
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
      <MfaEmailOtpPanel
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
              screen: { name: "mfa", factors: ["email_otp"] },
              csrfToken,
            },
          }),
          { status: 202, headers: { "Content-Type": "application/json" } },
        ),
    )

    render(() => (
      <MfaEmailOtpPanel
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

  test("requires explicit action to enroll and posts the exact credentialed contract", async () => {
    let capturedUrl = ""
    let capturedInit: RequestInit | undefined
    let updatedCsrf = ""
    const nextCsrfToken = "D".repeat(43)
    const fetchMock = vi.fn(async (url: RequestInfo | URL, init?: RequestInit) => {
      capturedUrl = String(url)
      capturedInit = init
      return Response.json(
        {
          success: true,
          data: {
            transition: {
              kind: "render",
              route: `/login/mfa?flow=${flowHandle}`,
              screen: { name: "mfa_email_otp_code", challengeIssued: true },
              csrfToken: nextCsrfToken,
            },
          },
        },
        { status: 201 },
      )
    })

    render(() => (
      <MfaEmailOtpPanel
        apiOrigin={() => apiOrigin}
        flowHandle={() => flowHandle}
        csrfToken={() => csrfToken}
        csrfTokenSet={(token) => {
          updatedCsrf = token
        }}
        busy={() => false}
        busySet={() => undefined}
        headingRegister={() => undefined}
        errorClear={() => undefined}
        failureSet={() => undefined}
        fallbackContinue={() => undefined}
        statusContinue={() => undefined}
        showRootChooser={() => undefined}
        fetchFn={fetchMock as unknown as typeof fetch}
        isEnrollment
      />
    ))

    expect(screen.getByRole("heading", { name: "Set up email codes" })).toBeTruthy()
    expect(screen.queryByRole("textbox", { name: "Verification code" })).toBeNull()
    expect(fetchMock).not.toHaveBeenCalled()

    fireEvent.click(screen.getByRole("button", { name: "Set up email codes" }))

    await vi.waitFor(() => {
      expect(screen.getByRole("heading", { name: "Email verification code" })).toBeTruthy()
    })
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(capturedUrl).toBe(`${apiOrigin}/api/v2/mfa/email-otp/enroll?flow=${flowHandle}`)
    expect(capturedInit?.method).toBe("POST")
    expect(capturedInit?.credentials).toBe("include")
    expect(JSON.parse(String(capturedInit?.body))).toEqual({ method: "email_otp", csrfToken })
    expect(updatedCsrf).toBe(nextCsrfToken)
    expect(screen.getByRole("status").textContent).toContain("Email codes are set up.")
  })

  test("does not issue a duplicate challenge after enrollment and keeps codes memory-only", async () => {
    const requestedUrls: Array<string> = []
    const fetchMock = vi.fn(async (url: RequestInfo | URL) => {
      const urlStr = String(url)
      requestedUrls.push(urlStr)
      if (urlStr.includes("/enroll")) {
        return Response.json(
          {
            success: true,
            data: {
              transition: {
                kind: "render",
                route: `/login/mfa?flow=${flowHandle}`,
                screen: { name: "mfa_email_otp_code", challengeIssued: true },
                csrfToken,
              },
            },
          },
          { status: 201 },
        )
      }
      return Response.json({
        success: true,
        data: { kind: "complete", path: `/api/v2/flow/continue?flow=${flowHandle}` },
      })
    })

    let continuedUrl = ""
    render(() => (
      <MfaEmailOtpPanel
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
        statusContinue={(url) => {
          continuedUrl = url
        }}
        showRootChooser={() => undefined}
        fetchFn={fetchMock as unknown as typeof fetch}
        isEnrollment
      />
    ))

    fireEvent.click(screen.getByRole("button", { name: "Set up email codes" }))
    const input = (await vi.waitFor(() =>
      screen.getByRole("textbox", { name: "Verification code" }),
    )) as HTMLInputElement

    expect(requestedUrls.filter((url) => url.includes("/challenge"))).toHaveLength(0)

    fireEvent.input(input, { target: { value: "12345678" } })
    fireEvent.click(screen.getByRole("button", { name: "Verify" }))

    await vi.waitFor(() => {
      expect(continuedUrl).toBe(`/api/v2/flow/continue?flow=${flowHandle}`)
    })
    expect(requestedUrls.filter((url) => url.includes("/challenge"))).toHaveLength(0)
    const stored = JSON.stringify(localStorage) + JSON.stringify(sessionStorage)
    expect(stored).not.toContain("12345678")
  })

  test("resumes authoritative code state without enrollment or challenge requests", () => {
    const fetchMock = vi.fn(async () => Response.json({ success: false }))

    render(() => (
      <MfaEmailOtpPanel
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
        codePending
      />
    ))

    expect(screen.getByRole("heading", { name: "Email verification code" })).toBeTruthy()
    expect(screen.getByRole("textbox", { name: "Verification code" })).toBeTruthy()
    expect(screen.queryByRole("button", { name: "Set up email codes" })).toBeNull()
    expect(screen.queryByRole("button", { name: "Send code" })).toBeNull()
    expect(fetchMock).not.toHaveBeenCalled()
  })

  test("allows immediate resend when enrollment activation succeeded but challenge issuance failed", async () => {
    const fetchMock = vi.fn(async () =>
      Response.json(
        {
          success: true,
          data: {
            transition: {
              kind: "render",
              route: `/login/mfa?flow=${flowHandle}`,
              screen: { name: "mfa_email_otp_code", challengeIssued: false },
              csrfToken,
            },
          },
        },
        { status: 201 },
      ),
    )

    render(() => (
      <MfaEmailOtpPanel
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
        isEnrollment
      />
    ))

    fireEvent.click(screen.getByRole("button", { name: "Set up email codes" }))
    await vi.waitFor(() => expect(screen.getByRole("button", { name: "Resend code" })).toBeTruthy())
    expect(screen.getByRole("status").textContent).toContain("Resend a code to continue.")
  })

  test("keeps the accessible enrollment retry available when enrollment fails", async () => {
    let failure = ""
    const fetchMock = vi.fn(async () =>
      Response.json({ success: false, op: "mfaEmailOtpEnrollment", errorMessage: "flow_expired" }, { status: 400 }),
    )

    render(() => (
      <MfaEmailOtpPanel
        apiOrigin={() => apiOrigin}
        flowHandle={() => flowHandle}
        csrfToken={() => csrfToken}
        csrfTokenSet={() => undefined}
        busy={() => false}
        busySet={() => undefined}
        headingRegister={() => undefined}
        errorClear={() => undefined}
        failureSet={(msg) => {
          failure = msg
        }}
        fallbackContinue={() => undefined}
        statusContinue={() => undefined}
        showRootChooser={() => undefined}
        fetchFn={fetchMock as unknown as typeof fetch}
        isEnrollment
      />
    ))

    fireEvent.click(screen.getByRole("button", { name: "Set up email codes" }))

    await vi.waitFor(() => {
      expect(failure).toBe("The sign-in session is invalid or has expired.")
    })
    expect(screen.getByRole("button", { name: "Set up email codes" })).toBeTruthy()
  })
})
