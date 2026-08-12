import { cleanup, fireEvent, render, screen, waitFor } from "@solidjs/testing-library"
import { createSignal } from "solid-js"
import { afterEach, describe, expect, test, vi } from "vitest"

import { PasswordChangeRequiredPanel } from "../client/src/password/ui/PasswordChangeRequiredPanel"

const csrfToken = "B".repeat(43)
const rotatedCsrfToken = "C".repeat(43)
const flow = "AAAAAAAAAAAAAAAAAAAAAA"

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

function panelRender(options?: {
  expired?: boolean
  failureSet?: (message: string) => void
  fallbackContinue?: (path?: string) => void
  statusContinue?: (url: string) => void
  transitionApply?: (route: string) => void
  csrfTokenSet?: (token: string) => void
}) {
  const [busy, busySet] = createSignal(false)
  let token = csrfToken
  return render(() => (
    <PasswordChangeRequiredPanel
      apiOrigin={() => "https://login.example"}
      flowHandle={() => flow}
      csrfToken={() => token}
      csrfTokenSet={(next) => {
        token = next
        options?.csrfTokenSet?.(next)
      }}
      expired={() => options?.expired ?? false}
      busy={busy}
      busySet={busySet}
      headingRegister={() => undefined}
      errorClear={() => undefined}
      failureSet={options?.failureSet ?? (() => undefined)}
      fallbackContinue={options?.fallbackContinue ?? (() => undefined)}
      statusContinue={options?.statusContinue ?? (() => undefined)}
      transitionApply={options?.transitionApply ?? (() => undefined)}
    />
  ))
}

async function formFill(values: { current: string; next: string; confirm: string }) {
  fireEvent.input(await screen.findByLabelText("Current password"), { target: { value: values.current } })
  fireEvent.input(screen.getByLabelText("New password"), { target: { value: values.next } })
  fireEvent.input(screen.getByLabelText("Confirm new password"), { target: { value: values.confirm } })
}

describe("PasswordChangeRequiredPanel", () => {
  test("renders mandatory fields with correct autocomplete and no chooser bypass", async () => {
    panelRender()

    const current = (await screen.findByLabelText("Current password")) as HTMLInputElement
    const next = screen.getByLabelText("New password") as HTMLInputElement
    const confirm = screen.getByLabelText("Confirm new password") as HTMLInputElement

    expect(current.getAttribute("autocomplete")).toBe("current-password")
    expect(next.getAttribute("autocomplete")).toBe("new-password")
    expect(confirm.getAttribute("autocomplete")).toBe("new-password")
    expect(current.required).toBe(true)
    expect(next.required).toBe(true)
    expect(confirm.required).toBe(true)
    expect(screen.queryByRole("button", { name: "Back to methods" })).toBeNull()
    expect(screen.queryByRole("button", { name: /Back/ })).toBeNull()
  })

  test("shows explicit versus expired copy", async () => {
    const explicit = panelRender()
    expect(await screen.findByText("Your password must be changed before you continue.")).toBeTruthy()
    explicit.unmount()

    panelRender({ expired: true })
    expect(await screen.findByText("Your password has expired. Set a new password to continue.")).toBeTruthy()
  })

  test("focuses the current password field on render", async () => {
    panelRender()
    const current = await screen.findByLabelText("Current password")
    await waitFor(() => expect(document.activeElement).toBe(current))
  })

  test("checks the confirmation locally and sends no request on mismatch", async () => {
    const requests: string[] = []
    const failures: string[] = []
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) => {
        requests.push(String(input))
        return Response.json({ success: true, data: { kind: "complete", path: "/x" } })
      }),
    )

    panelRender({ failureSet: (message) => failures.push(message) })
    await formFill({ current: "old", next: "Str0ng-password!", confirm: "Other!" })
    fireEvent.click(screen.getByRole("button", { name: "Change password" }))

    await waitFor(() => expect(failures).toEqual(["The passwords do not match."]))
    expect(requests).toEqual([])
  })

  test("sends exactly currentPassword, newPassword and CSRF then clears secrets", async () => {
    const bodies: string[] = []
    let completed = ""
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
        bodies.push(String(init?.body ?? ""))
        return Response.json({ success: true, data: { kind: "complete", path: `/api/v2/flow/continue?flow=${flow}` } })
      }),
    )

    panelRender({ statusContinue: (url) => (completed = url) })
    await formFill({ current: "old-password", next: "Str0ng-password!", confirm: "Str0ng-password!" })
    fireEvent.click(screen.getByRole("button", { name: "Change password" }))

    await waitFor(() => expect(completed).toBe(`/api/v2/flow/continue?flow=${flow}`))
    expect(JSON.parse(bodies[0] ?? "{}")).toEqual({
      currentPassword: "old-password",
      newPassword: "Str0ng-password!",
      csrfToken,
    })
    expect((screen.getByLabelText("Current password") as HTMLInputElement).value).toBe("")
    expect((screen.getByLabelText("New password") as HTMLInputElement).value).toBe("")
    expect((screen.getByLabelText("Confirm new password") as HTMLInputElement).value).toBe("")
  })

  test("retries wrong current password with a rotated CSRF token and focused generic error", async () => {
    const bodies: string[] = []
    const failures: string[] = []
    let rotated = ""
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
        bodies.push(String(init?.body ?? ""))
        if (bodies.length === 1) {
          return Response.json(
            {
              success: false,
              op: "passwordChangeRequired",
              errorMessage: "credentials_invalid",
              csrfToken: rotatedCsrfToken,
              expiresAt: 2000,
            },
            { status: 401 },
          )
        }
        return Response.json({ success: true, data: { kind: "complete", path: "/done" } })
      }),
    )

    panelRender({ failureSet: (message) => failures.push(message), csrfTokenSet: (t) => (rotated = t) })
    await formFill({ current: "wrong", next: "Str0ng-password!", confirm: "Str0ng-password!" })
    fireEvent.click(screen.getByRole("button", { name: "Change password" }))

    await waitFor(() => expect(failures).toEqual(["Your current password is incorrect."]))
    expect(rotated).toBe(rotatedCsrfToken)
    await waitFor(() => expect(document.activeElement).toBe(screen.getByLabelText("Current password")))

    await formFill({ current: "old-password", next: "Str0ng-password!", confirm: "Str0ng-password!" })
    fireEvent.click(screen.getByRole("button", { name: "Change password" }))
    await waitFor(() => expect(bodies).toHaveLength(2))
    expect(JSON.parse(bodies[1] ?? "{}").csrfToken).toBe(rotatedCsrfToken)
  })

  test("retries policy failures with a rotated CSRF token", async () => {
    const failures: string[] = []
    let rotated = ""
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        Response.json(
          {
            success: false,
            op: "passwordChangeRequired",
            errorMessage: "password_policy_invalid",
            csrfToken: rotatedCsrfToken,
            expiresAt: 2000,
          },
          { status: 400 },
        ),
      ),
    )

    panelRender({ failureSet: (message) => failures.push(message), csrfTokenSet: (t) => (rotated = t) })
    await formFill({ current: "old-password", next: "weak", confirm: "weak" })
    fireEvent.click(screen.getByRole("button", { name: "Change password" }))

    await waitFor(() => expect(failures).toEqual(["This password does not meet the password policy."]))
    expect(rotated).toBe(rotatedCsrfToken)
    expect(await screen.findByRole("heading", { name: "Change your password" })).toBeTruthy()
  })

  test("routes an MFA render transition onward", async () => {
    const routes: string[] = []
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        Response.json({
          success: true,
          data: {
            kind: "render",
            route: `/login/mfa?flow=${flow}`,
            screen: { name: "mfa", factors: ["AUTHENTICATION_METHOD_TYPE_TOTP"] },
            csrfToken: rotatedCsrfToken,
          },
        }),
      ),
    )

    panelRender({ transitionApply: (route) => routes.push(route) })
    await formFill({ current: "old-password", next: "Str0ng-password!", confirm: "Str0ng-password!" })
    fireEvent.click(screen.getByRole("button", { name: "Change password" }))

    await waitFor(() => expect(routes).toEqual([`/login/mfa?flow=${flow}`]))
  })

  test("offers only native fallback for a partial-success fallback transition", async () => {
    const fallbacks: (string | undefined)[] = []
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        Response.json({
          success: true,
          data: { kind: "fallback", path: `/api/v2/flow/fallback?flow=${flow}` },
        }),
      ),
    )

    panelRender({ fallbackContinue: (path) => fallbacks.push(path) })
    await formFill({ current: "old-password", next: "Str0ng-password!", confirm: "Str0ng-password!" })
    fireEvent.click(screen.getByRole("button", { name: "Change password" }))

    await waitFor(() => expect(fallbacks).toEqual([`/api/v2/flow/fallback?flow=${flow}`]))
  })

  test("blocks duplicate submissions and ignores a late response after unmount", async () => {
    const bodies: string[] = []
    const failures: string[] = []
    let resolveChange: ((value: Response) => void) | undefined
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
        bodies.push(String(init?.body ?? ""))
        return new Promise<Response>((resolve) => {
          resolveChange = resolve
        })
      }),
    )

    const panel = panelRender({ failureSet: (message) => failures.push(message) })
    await formFill({ current: "old-password", next: "Str0ng-password!", confirm: "Str0ng-password!" })
    const submit = screen.getByRole("button", { name: "Change password" })
    fireEvent.click(submit)
    await waitFor(() => expect(bodies).toHaveLength(1))
    fireEvent.click(submit)
    fireEvent.click(submit)
    expect(bodies).toHaveLength(1)

    panel.unmount()
    resolveChange?.(
      Response.json(
        { success: false, op: "passwordChangeRequired", errorMessage: "service_unavailable" },
        {
          status: 503,
        },
      ),
    )
    await Promise.resolve()
    expect(failures).toEqual([])
  })

  test("stores no secret in browser storage", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => Response.json({ success: true, data: { kind: "complete", path: "/done" } })),
    )

    panelRender()
    await formFill({ current: "old-password", next: "Str0ng-password!", confirm: "Str0ng-password!" })
    fireEvent.click(screen.getByRole("button", { name: "Change password" }))

    await waitFor(() => expect((screen.getByLabelText("New password") as HTMLInputElement).value).toBe(""))
    const stored = JSON.stringify({ ...localStorage, ...sessionStorage })
    expect(stored).not.toContain("old-password")
    expect(stored).not.toContain("Str0ng-password!")
  })
})
