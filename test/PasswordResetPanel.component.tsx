import { cleanup, fireEvent, render, screen, waitFor } from "@solidjs/testing-library"
import { afterEach, describe, expect, test, vi } from "vitest"

import { PasswordResetPanel } from "../client/src/password-recovery/ui/PasswordResetPanel"

const csrfToken = "B".repeat(43)
const rotatedCsrfToken = "C".repeat(43)

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

function panelRender(options?: { failureSet?: (message: string) => void; showLogin?: () => void }) {
  return render(() => (
    <PasswordResetPanel
      apiOrigin={() => "https://login.example"}
      errorClear={() => undefined}
      failureSet={options?.failureSet ?? (() => undefined)}
      focusHeading={() => undefined}
      headingRegister={() => undefined}
      showLogin={options?.showLogin ?? (() => undefined)}
    />
  ))
}

function bootstrapResponse() {
  return Response.json({
    success: true,
    data: { status: "ready", screen: "password_reset", csrfToken, expiresAt: 1000 },
  })
}

describe("PasswordResetPanel", () => {
  test("calls set-bootstrap on mount and renders accessible new-password fields", async () => {
    const fetchMock = vi.fn(async () => bootstrapResponse())
    vi.stubGlobal("fetch", fetchMock)

    panelRender()

    const password = (await screen.findByLabelText("New password")) as HTMLInputElement
    const confirmation = screen.getByLabelText("Confirm new password") as HTMLInputElement
    expect(password.type).toBe("password")
    expect(password.getAttribute("autocomplete")).toBe("new-password")
    expect(confirmation.getAttribute("autocomplete")).toBe("new-password")
    expect(fetchMock.mock.calls[0]?.[0]?.toString()).toBe("https://login.example/api/v2/password/reset/set-bootstrap")
  })

  test("renders the invalid-link state without any account detail", async () => {
    const failures: string[] = []
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        Response.json(
          { success: false, op: "passwordResetSetBootstrap", errorMessage: "invalid_link" },
          { status: 409 },
        ),
      ),
    )

    panelRender({ failureSet: (message) => failures.push(message) })

    await screen.findByRole("heading", { name: "This reset link is no longer valid" })
    expect(failures).toEqual(["This password reset link is invalid or has expired."])
    expect(screen.queryByLabelText("New password")).toBeNull()
  })

  test("checks the confirmation locally and sends no request on mismatch", async () => {
    const requests: string[] = []
    const failures: string[] = []
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) => {
        requests.push(String(input))
        return bootstrapResponse()
      }),
    )

    panelRender({ failureSet: (message) => failures.push(message) })

    const password = (await screen.findByLabelText("New password")) as HTMLInputElement
    fireEvent.input(password, { target: { value: "new-password" } })
    fireEvent.input(screen.getByLabelText("Confirm new password"), { target: { value: "other-password" } })
    fireEvent.click(screen.getByRole("button", { name: "Set new password" }))

    await waitFor(() => expect(failures).toEqual(["The passwords do not match."]))
    expect(requests.filter((url) => url.endsWith("/set"))).toHaveLength(0)
  })

  test("sends only password and CSRF and clears fields on success", async () => {
    const bodies: string[] = []
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        if (String(input).endsWith("/set-bootstrap")) return bootstrapResponse()
        bodies.push(String(init?.body ?? ""))
        return Response.json({ success: true, data: { status: "complete" } })
      }),
    )

    panelRender()

    const password = (await screen.findByLabelText("New password")) as HTMLInputElement
    fireEvent.input(password, { target: { value: "new-password" } })
    fireEvent.input(screen.getByLabelText("Confirm new password"), { target: { value: "new-password" } })
    fireEvent.click(screen.getByRole("button", { name: "Set new password" }))

    await screen.findByRole("heading", { name: "Your password was changed" })
    expect(JSON.parse(bodies[0] ?? "{}")).toEqual({ password: "new-password", csrfToken })
    expect(screen.queryByLabelText("New password")).toBeNull()
    expect(screen.getByRole("button", { name: "Back to sign-in" })).toBeTruthy()
  })

  test("retries policy failures with the rotated CSRF token and cleared fields", async () => {
    const bodies: string[] = []
    const failures: string[] = []
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        if (String(input).endsWith("/set-bootstrap")) return bootstrapResponse()
        bodies.push(String(init?.body ?? ""))
        if (bodies.length === 1) {
          return Response.json(
            {
              success: false,
              op: "passwordResetSet",
              errorMessage: "password_policy_invalid",
              csrfToken: rotatedCsrfToken,
              expiresAt: 2000,
            },
            { status: 400 },
          )
        }
        return Response.json({ success: true, data: { status: "complete" } })
      }),
    )

    panelRender({ failureSet: (message) => failures.push(message) })

    const password = (await screen.findByLabelText("New password")) as HTMLInputElement
    const confirmation = screen.getByLabelText("Confirm new password") as HTMLInputElement
    fireEvent.input(password, { target: { value: "weak" } })
    fireEvent.input(confirmation, { target: { value: "weak" } })
    fireEvent.click(screen.getByRole("button", { name: "Set new password" }))

    await waitFor(() => expect(failures).toEqual(["This password does not meet the password policy."]))
    expect((screen.getByLabelText("New password") as HTMLInputElement).value).toBe("")

    fireEvent.input(screen.getByLabelText("New password"), { target: { value: "Str0ng-password!" } })
    fireEvent.input(screen.getByLabelText("Confirm new password"), { target: { value: "Str0ng-password!" } })
    fireEvent.click(screen.getByRole("button", { name: "Set new password" }))

    await screen.findByRole("heading", { name: "Your password was changed" })
    expect(JSON.parse(bodies[1] ?? "{}")).toEqual({ password: "Str0ng-password!", csrfToken: rotatedCsrfToken })
  })

  test("clears fields and blocks further submissions on a terminal outcome", async () => {
    const bodies: string[] = []
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        if (String(input).endsWith("/set-bootstrap")) return bootstrapResponse()
        bodies.push(String(init?.body ?? ""))
        return Response.json({ success: false, op: "passwordResetSet", errorMessage: "invalid_link" }, { status: 409 })
      }),
    )

    panelRender()

    fireEvent.input(await screen.findByLabelText("New password"), { target: { value: "new-password" } })
    fireEvent.input(screen.getByLabelText("Confirm new password"), { target: { value: "new-password" } })
    fireEvent.click(screen.getByRole("button", { name: "Set new password" }))

    await screen.findByRole("heading", { name: "This reset link is no longer valid" })
    expect(bodies).toHaveLength(1)
    expect(screen.queryByLabelText("New password")).toBeNull()
  })

  test("ignores duplicate submissions and a late response after unmount", async () => {
    let resolveSet: ((value: Response) => void) | undefined
    const setRequests: string[] = []
    const failures: string[] = []
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        if (String(input).endsWith("/set-bootstrap")) return bootstrapResponse()
        setRequests.push(String(init?.body ?? ""))
        return new Promise<Response>((resolve) => {
          resolveSet = resolve
        })
      }),
    )

    const panel = panelRender({ failureSet: (message) => failures.push(message) })
    fireEvent.input(await screen.findByLabelText("New password"), { target: { value: "new-password" } })
    fireEvent.input(screen.getByLabelText("Confirm new password"), { target: { value: "new-password" } })
    const submit = screen.getByRole("button", { name: "Set new password" })
    fireEvent.click(submit)
    await waitFor(() => expect(setRequests).toHaveLength(1))
    fireEvent.click(submit)
    fireEvent.click(submit)
    expect(setRequests).toHaveLength(1)

    panel.unmount()
    resolveSet?.(
      Response.json({ success: false, op: "passwordResetSet", errorMessage: "service_unavailable" }, { status: 503 }),
    )
    await Promise.resolve()
    expect(failures).toEqual([])
  })

  test("returns to sign-in without auto-authentication", async () => {
    let returned = 0
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => bootstrapResponse()),
    )

    panelRender({ showLogin: () => (returned += 1) })

    await screen.findByLabelText("New password")
    fireEvent.click(screen.getByRole("button", { name: "Back to sign-in" }))
    expect(returned).toBe(1)
  })
})
