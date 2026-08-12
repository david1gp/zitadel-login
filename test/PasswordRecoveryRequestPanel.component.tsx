import { cleanup, fireEvent, render, screen, waitFor } from "@solidjs/testing-library"
import { afterEach, describe, expect, test, vi } from "vitest"

import { PasswordRecoveryRequestPanel } from "../client/src/password-recovery/ui/PasswordRecoveryRequestPanel"

const csrfToken = "B".repeat(43)

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

function panelRender(failureSet: (message: string) => void = () => undefined) {
  return render(() => (
    <PasswordRecoveryRequestPanel
      apiOrigin={() => "https://login.example"}
      errorClear={() => undefined}
      failureSet={failureSet}
      focusHeading={() => undefined}
      headingRegister={() => undefined}
      showLogin={() => undefined}
    />
  ))
}

describe("PasswordRecoveryRequestPanel", () => {
  test("bootstraps and renders an accessible email field", async () => {
    const fetchMock = vi.fn(async () =>
      Response.json({ success: true, data: { status: "ready", csrfToken, expiresAt: 1000 } }),
    )
    vi.stubGlobal("fetch", fetchMock)

    panelRender()

    const input = (await screen.findByLabelText("Email address")) as HTMLInputElement
    expect(input.type).toBe("email")
    expect(input.getAttribute("autocomplete")).toBe("username")
    expect(screen.getByRole("heading", { name: "Reset your password" })).toBeTruthy()
    expect(fetchMock.mock.calls[0]?.[0]?.toString()).toBe("https://login.example/api/v2/password/reset/bootstrap")
  })

  test("submits the normalized email with the bootstrap CSRF and shows identical confirmation copy", async () => {
    const requests: Array<{ url: string; body: string }> = []
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input)
      requests.push({ url, body: String(init?.body ?? "") })
      if (url.endsWith("/bootstrap")) {
        return Response.json({ success: true, data: { status: "ready", csrfToken, expiresAt: 1000 } })
      }
      return Response.json({ success: true, data: { status: "accepted" } }, { status: 202 })
    })
    vi.stubGlobal("fetch", fetchMock)

    panelRender()

    const input = (await screen.findByLabelText("Email address")) as HTMLInputElement
    fireEvent.input(input, { target: { value: " User@Example.COM " } })
    fireEvent.click(screen.getByRole("button", { name: "Send reset link" }))

    await waitFor(() => expect(requests).toHaveLength(2))
    expect(JSON.parse(requests[1]?.body ?? "{}")).toEqual({ email: "user@example.com", csrfToken })
    await screen.findByRole("heading", { name: "Check your email" })
    expect(screen.getByText(/If an account matches that email address/)).toBeTruthy()
    expect(screen.queryByLabelText("Email address")).toBeNull()
  })

  test("ignores duplicate submissions while a request is pending", async () => {
    let resolveRequest: ((value: Response) => void) | undefined
    const requests: string[] = []
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input)
      requests.push(url)
      if (url.endsWith("/bootstrap")) {
        return Response.json({ success: true, data: { status: "ready", csrfToken, expiresAt: 1000 } })
      }
      return new Promise<Response>((resolve) => {
        resolveRequest = resolve
      })
    })
    vi.stubGlobal("fetch", fetchMock)

    panelRender()

    const input = (await screen.findByLabelText("Email address")) as HTMLInputElement
    fireEvent.input(input, { target: { value: "user@example.com" } })
    const submit = screen.getByRole("button", { name: "Send reset link" })
    fireEvent.click(submit)
    await waitFor(() => expect(requests).toHaveLength(2))
    fireEvent.click(submit)
    fireEvent.click(submit)

    expect(requests.filter((url) => url.endsWith("/request"))).toHaveLength(1)
    resolveRequest?.(Response.json({ success: true, data: { status: "accepted" } }, { status: 202 }))
  })

  test("ignores a late request response after unmount", async () => {
    let resolveRequest: ((value: Response) => void) | undefined
    const failures: string[] = []
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) => {
        if (String(input).endsWith("/bootstrap")) {
          return Response.json({ success: true, data: { status: "ready", csrfToken, expiresAt: 1000 } })
        }
        return new Promise<Response>((resolve) => {
          resolveRequest = resolve
        })
      }),
    )

    const panel = panelRender((message) => failures.push(message))
    fireEvent.input(await screen.findByLabelText("Email address"), { target: { value: "user@example.com" } })
    fireEvent.click(screen.getByRole("button", { name: "Send reset link" }))
    await waitFor(() => expect(resolveRequest).toBeTypeOf("function"))
    panel.unmount()
    resolveRequest?.(
      Response.json(
        { success: false, op: "passwordResetRequest", errorMessage: "service_unavailable" },
        { status: 503 },
      ),
    )
    await Promise.resolve()

    expect(failures).toEqual([])
  })

  test("shows a terminal recovery screen when bootstrap is unavailable", async () => {
    const failures: string[] = []
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        Response.json(
          { success: false, op: "passwordRecoveryBootstrap", errorMessage: "capability_disabled" },
          { status: 404 },
        ),
      ),
    )

    panelRender((message) => failures.push(message))

    await screen.findByRole("heading", { name: "Password recovery unavailable" })
    expect(failures).toEqual(["Password recovery is not available."])
    expect(screen.queryByLabelText("Email address")).toBeNull()
  })
})
