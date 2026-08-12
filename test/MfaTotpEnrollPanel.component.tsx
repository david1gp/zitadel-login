import { cleanup, fireEvent, render, screen } from "@solidjs/testing-library"
import { afterEach, describe, expect, test, vi } from "vitest"

import { MfaTotpEnrollPanel } from "../client/src/mfa/ui/MfaTotpEnrollPanel"

afterEach(cleanup)

const apiOrigin = "https://worker.example"
const flowHandle = "flow-123"
const csrfToken = "B".repeat(43)
const nextCsrfToken = "D".repeat(43)
const provisioningUri = "otpauth://totp/Contentoren:user@example.com?secret=JBSWY3DPEHPK3PXP&issuer=Contentoren"
const secret = "JBSWY3DPEHPK3PXP"

type PanelOverrides = {
  fetchFn?: typeof fetch
  busy?: () => boolean
  busySet?: (value: boolean) => void
  csrfTokenSet?: (token: string) => void
  failureSet?: (message: string) => void
  fallbackContinue?: (path?: string) => void
  statusContinue?: (url: string) => void
  optionsReload?: () => Promise<void>
  showChooser?: () => void
  showRootChooser?: () => void
}

function panelRender(overrides: PanelOverrides = {}) {
  return render(() => (
    <MfaTotpEnrollPanel
      apiOrigin={() => apiOrigin}
      flowHandle={() => flowHandle}
      csrfToken={() => csrfToken}
      csrfTokenSet={overrides.csrfTokenSet ?? (() => undefined)}
      busy={overrides.busy ?? (() => false)}
      busySet={overrides.busySet ?? (() => undefined)}
      headingRegister={() => undefined}
      errorClear={() => undefined}
      failureSet={overrides.failureSet ?? (() => undefined)}
      fallbackContinue={overrides.fallbackContinue ?? (() => undefined)}
      statusContinue={overrides.statusContinue ?? (() => undefined)}
      optionsReload={overrides.optionsReload}
      showChooser={overrides.showChooser}
      showRootChooser={overrides.showRootChooser ?? (() => undefined)}
      fetchFn={overrides.fetchFn}
    />
  ))
}

function startResponseCreate() {
  return Response.json(
    {
      success: true,
      data: {
        provisioningUri,
        secret,
        transition: {
          kind: "render",
          route: `/login/mfa?flow=${flowHandle}`,
          screen: { name: "mfa_totp_setup" },
          csrfToken: nextCsrfToken,
        },
      },
    },
    { status: 201 },
  )
}

describe("MfaTotpEnrollPanel component", () => {
  test("requires explicit start and does not request setup material on mount", () => {
    const fetchMock = vi.fn(async () => startResponseCreate())
    panelRender({ fetchFn: fetchMock as unknown as typeof fetch })

    expect(fetchMock).not.toHaveBeenCalled()
    expect(screen.getByRole("button", { name: "Start setup" })).toBeTruthy()
    expect(screen.queryByRole("img", { name: "QR code for authenticator app setup" })).toBeNull()
  })

  test("starts enrollment with the exact credentialed request contract", async () => {
    const fetchMock = vi.fn(async () => startResponseCreate())
    let updatedCsrf = ""
    panelRender({ fetchFn: fetchMock as unknown as typeof fetch, csrfTokenSet: (t) => (updatedCsrf = t) })

    fireEvent.click(screen.getByRole("button", { name: "Start setup" }))

    await vi.waitFor(() => {
      expect(fetchMock).toHaveBeenCalledTimes(1)
    })
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toBe(`${apiOrigin}/api/v2/mfa/otp/enroll?flow=${flowHandle}`)
    expect(init.method).toBe("POST")
    expect(init.credentials).toBe("include")
    expect(init.headers).toEqual({ "Content-Type": "application/json" })
    expect(JSON.parse(init.body as string)).toEqual({ method: "totp", csrfToken })
    await vi.waitFor(() => {
      expect(updatedCsrf).toBe(nextCsrfToken)
    })
  })

  test("renders the provisioning QR locally and reveals the secret only on request", async () => {
    const fetchMock = vi.fn(async () => startResponseCreate())
    panelRender({ fetchFn: fetchMock as unknown as typeof fetch })

    fireEvent.click(screen.getByRole("button", { name: "Start setup" }))

    const qr = (await vi.waitFor(() =>
      screen.getByRole("img", { name: "QR code for authenticator app setup" }),
    )) as unknown as SVGSVGElement
    expect(qr.tagName.toLowerCase()).toBe("svg")
    expect(qr.querySelector("path")?.getAttribute("d")).toBeTruthy()
    expect(document.body.textContent).not.toContain(secret)

    fireEvent.click(screen.getByRole("button", { name: "Show setup key" }))
    expect(document.body.textContent).toContain("JBSW")
    fireEvent.click(screen.getByRole("button", { name: "Hide setup key" }))
    expect(document.body.textContent).not.toContain("JBSW")
  })

  test("keeps setup material out of localStorage and sessionStorage", async () => {
    const fetchMock = vi.fn(async () => startResponseCreate())
    panelRender({ fetchFn: fetchMock as unknown as typeof fetch })

    fireEvent.click(screen.getByRole("button", { name: "Start setup" }))
    await vi.waitFor(() => screen.getByRole("img", { name: "QR code for authenticator app setup" }))

    const input = screen.getByRole("textbox", { name: "Authenticator code" }) as HTMLInputElement
    fireEvent.input(input, { target: { value: "123456" } })

    const stored = JSON.stringify(localStorage) + JSON.stringify(sessionStorage)
    expect(stored).not.toContain(secret)
    expect(stored).not.toContain("otpauth")
    expect(stored).not.toContain("123456")
  })

  test("normalizes the code to six digits and posts the exact verify contract", async () => {
    let verifyInit: RequestInit | undefined
    let verifyUrl = ""
    const fetchMock = vi.fn(async (url: string, init: RequestInit) => {
      if (url.endsWith(`/enroll/verify?flow=${flowHandle}`)) {
        verifyUrl = url
        verifyInit = init
        return Response.json({
          success: true,
          data: { transition: { kind: "complete", path: `/api/v2/flow/continue?flow=${flowHandle}` } },
        })
      }
      return startResponseCreate()
    })
    let continuedUrl = ""
    panelRender({
      fetchFn: fetchMock as unknown as typeof fetch,
      statusContinue: (url) => (continuedUrl = url),
    })

    fireEvent.click(screen.getByRole("button", { name: "Start setup" }))
    const input = (await vi.waitFor(() =>
      screen.getByRole("textbox", { name: "Authenticator code" }),
    )) as HTMLInputElement

    fireEvent.input(input, { target: { value: " 12-34 56 78 " } })
    expect(input.value).toBe("123456")

    fireEvent.click(screen.getByRole("button", { name: "Activate" }))

    await vi.waitFor(() => {
      expect(continuedUrl).toBe(`/api/v2/flow/continue?flow=${flowHandle}`)
    })
    expect(verifyUrl).toBe(`${apiOrigin}/api/v2/mfa/otp/enroll/verify?flow=${flowHandle}`)
    expect(verifyInit?.method).toBe("POST")
    expect(verifyInit?.credentials).toBe("include")
    expect(JSON.parse(verifyInit?.body as string)).toEqual({ code: "123456", csrfToken })
    expect(input.value).toBe("")
  })

  test("clears setup material and returns to start on a render transition", async () => {
    let reloaded = false
    const fetchMock = vi.fn(async (url: string) => {
      if (url.includes("/enroll/verify")) {
        return Response.json({
          success: true,
          data: {
            transition: {
              kind: "render",
              route: `/login/mfa?flow=${flowHandle}`,
              screen: { name: "mfa", factors: ["u2f"] },
              csrfToken: nextCsrfToken,
            },
          },
        })
      }
      return startResponseCreate()
    })
    panelRender({
      fetchFn: fetchMock as unknown as typeof fetch,
      optionsReload: async () => {
        reloaded = true
      },
    })

    fireEvent.click(screen.getByRole("button", { name: "Start setup" }))
    const input = (await vi.waitFor(() =>
      screen.getByRole("textbox", { name: "Authenticator code" }),
    )) as HTMLInputElement
    fireEvent.input(input, { target: { value: "123456" } })
    fireEvent.click(screen.getByRole("button", { name: "Activate" }))

    await vi.waitFor(() => {
      expect(reloaded).toBe(true)
      expect(screen.getByRole("button", { name: "Start setup" })).toBeTruthy()
    })
    expect(document.body.textContent).not.toContain("JBSW")
  })

  test("routes fallback transitions without exposing setup material", async () => {
    let fallbackPath: string | undefined = ""
    const fetchMock = vi.fn(async () =>
      Response.json({
        success: true,
        data: {
          provisioningUri,
          secret,
          transition: { kind: "fallback", path: `/api/v2/flow/fallback?flow=${flowHandle}` },
        },
      }),
    )
    panelRender({
      fetchFn: fetchMock as unknown as typeof fetch,
      fallbackContinue: (path) => (fallbackPath = path),
    })

    fireEvent.click(screen.getByRole("button", { name: "Start setup" }))

    await vi.waitFor(() => {
      expect(fallbackPath).toBe(`/api/v2/flow/fallback?flow=${flowHandle}`)
    })
    expect(document.body.textContent).not.toContain("JBSW")
  })

  test("offers safe fallback when setup material is unavailable", async () => {
    let failure = ""
    let fallbackCalled = false
    const fetchMock = vi.fn(async () =>
      Response.json({ success: false, op: "mfaTotpEnrollmentStart", errorMessage: "flow_expired" }, { status: 400 }),
    )
    panelRender({
      fetchFn: fetchMock as unknown as typeof fetch,
      failureSet: (message) => (failure = message),
      fallbackContinue: () => {
        fallbackCalled = true
      },
    })

    fireEvent.click(screen.getByRole("button", { name: "Start setup" }))

    const continueButton = (await vi.waitFor(() =>
      screen.getByRole("button", { name: "Continue in ZITADEL" }),
    )) as HTMLButtonElement
    expect(failure).toBe("The sign-in session is invalid or has expired.")

    fireEvent.click(continueButton)
    expect(fallbackCalled).toBe(true)
  })

  test("prevents duplicate start requests while a request is in flight", async () => {
    let resolveStart: (() => void) | undefined
    const pending = new Promise<void>((resolve) => {
      resolveStart = resolve
    })
    const fetchMock = vi.fn(async () => {
      await pending
      return startResponseCreate()
    })
    let busyState = false
    panelRender({
      fetchFn: fetchMock as unknown as typeof fetch,
      busy: () => busyState,
      busySet: (value) => {
        busyState = value
      },
    })

    const startButton = screen.getByRole("button", { name: "Start setup" })
    fireEvent.click(startButton)
    fireEvent.click(startButton)
    fireEvent.click(startButton)

    resolveStart?.()
    await vi.waitFor(() => screen.getByRole("img", { name: "QR code for authenticator app setup" }))
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  test("discards setup material returned after the panel is unmounted", async () => {
    let resolveStart: ((response: Response) => void) | undefined
    const fetchMock = vi.fn(
      async () =>
        new Promise<Response>((resolve) => {
          resolveStart = resolve
        }),
    )
    let updatedCsrf = ""
    let busyState = false
    const panel = panelRender({
      fetchFn: fetchMock as unknown as typeof fetch,
      csrfTokenSet: (token) => {
        updatedCsrf = token
      },
      busy: () => busyState,
      busySet: (value) => {
        busyState = value
      },
    })

    fireEvent.click(screen.getByRole("button", { name: "Start setup" }))
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1))
    panel.unmount()
    resolveStart?.(startResponseCreate())

    await vi.waitFor(() => expect(busyState).toBe(false))
    expect(updatedCsrf).toBe("")
    expect(document.body.textContent).not.toContain(secret)
  })
})
