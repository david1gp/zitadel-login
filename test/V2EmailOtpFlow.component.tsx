import { cleanup, fireEvent, render, screen } from "@solidjs/testing-library"
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest"

import { App } from "../client/src/app/ui/App"

const originalFetch = globalThis.fetch
const originalAssign = window.location.assign

const validCsrf = "C".repeat(43)
const validFlow = "A".repeat(22)

const bootstrap = {
  capabilities: { passwordRecovery: false },
  branding: {
    dark: { colors: { background: "#111111", font: "#fefefe", primary: "#ddeeff", warn: "#ff0000" } },
    disableWatermark: true,
    light: { colors: { background: "#fefefe", font: "#101010", primary: "#112233", warn: "#aa0000" } },
    themeMode: "system",
  },
  identityProviders: [],
  organization: { id: "org-1", name: "Contentoren" },
  primaryMethods: ["email_otp", "password"],
  updatedAt: 1,
}

beforeEach(() => {
  localStorage.clear()
  Object.defineProperty(window, "matchMedia", {
    configurable: true,
    value: vi.fn(() => ({
      matches: false,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    })),
  })
})

afterEach(() => {
  cleanup()
  globalThis.fetch = originalFetch
  window.location.assign = originalAssign
})

describe("v2 email OTP flow component & URL scrubbing", () => {
  test("consumes authRequest, scrubs address bar to canonical flow URL, and runs start, resend, and verify", async () => {
    let assignedUrl = ""
    window.location.assign = vi.fn((url: string) => {
      assignedUrl = url
    })

    const requests: Array<{ method: string; url: string; body?: unknown }> = []
    globalThis.fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input)
      const method = init?.method ?? "GET"
      const body = init?.body ? JSON.parse(String(init.body)) : undefined
      requests.push({ method, url, body })

      if (url.includes("/api/v2/bootstrap")) return Response.json({ success: true, data: bootstrap })
      if (url.includes("/api/v2/flow/initialize")) {
        return Response.json({
          success: true,
          data: {
            kind: "render",
            route: `/login/email-otp?flow=${validFlow}`,
            screen: { name: "email_otp_start", loginHint: "user@example.com" },
            csrfToken: validCsrf,
          },
        })
      }
      if (url.includes("/api/v2/email-otp/start")) {
        return Response.json({
          success: true,
          data: {
            kind: "render",
            route: `/login/email-otp?flow=${validFlow}`,
            screen: { name: "email_otp_code" },
            csrfToken: validCsrf,
          },
        })
      }
      if (url.includes("/api/v2/email-otp/cooldown")) {
        return Response.json({ success: true, data: { cooldownExpiresAt: 0, cooldownRemainingSeconds: 0 } })
      }
      if (url.includes("/api/v2/email-otp/resend")) {
        return Response.json({
          success: true,
          data: {
            kind: "render",
            route: `/login/email-otp?flow=${validFlow}`,
            screen: { name: "email_otp_code" },
            csrfToken: validCsrf,
          },
        })
      }
      if (url.includes("/api/v2/email-otp/verify")) {
        return Response.json({
          success: true,
          data: { kind: "complete", path: `/api/v2/flow/continue?flow=${validFlow}` },
        })
      }
      throw new Error(`Unexpected request: ${url}`)
    })

    history.replaceState(null, "", "/login/email-otp?authRequest=request-1")
    render(() => <App apiOrigin="https://worker.example" />)

    const emailInput = await screen.findByRole("textbox", { name: "Email address" })
    expect((emailInput as HTMLInputElement).value).toBe("user@example.com")
    expect(location.pathname).toBe("/login/email-otp")
    expect(location.search).toBe(`?flow=${validFlow}`)

    fireEvent.submit(screen.getByRole("button", { name: "Send code" }).closest("form")!)

    const codeInput = await screen.findByRole("textbox", { name: "Verification code" })
    expect(codeInput).toBeTruthy()

    const resendButton = screen.getByRole("button", { name: "Send a new code" }) as HTMLButtonElement
    await vi.waitFor(() => expect(resendButton.disabled).toBe(false))
    fireEvent.click(resendButton)
    expect(await screen.findByText("A new code has been sent.")).toBeTruthy()

    fireEvent.input(codeInput, { target: { value: "654321" } })
    fireEvent.submit(screen.getByRole("button", { name: "Continue" }).closest("form")!)

    await vi.waitFor(() => expect(assignedUrl).toContain(`/api/v2/flow/continue?flow=${validFlow}`))

    for (let index = 0; index < localStorage.length; index += 1) {
      const key = localStorage.key(index)
      const val = localStorage.getItem(key ?? "") ?? ""
      expect(val).not.toContain(validFlow)
      expect(val).not.toContain(validCsrf)
      expect(val).not.toContain("654321")
      expect(val).not.toContain("request-1")
    }
  })

  test("resumes from flow parameter on page reload", async () => {
    globalThis.fetch = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input)
      if (url.includes("/api/v2/bootstrap")) return Response.json({ success: true, data: bootstrap })
      if (url.includes("/api/v2/flow/resume")) {
        return Response.json({
          success: true,
          data: {
            kind: "render",
            route: `/login/email-otp?flow=${validFlow}`,
            screen: { name: "email_otp_code" },
            csrfToken: validCsrf,
          },
        })
      }
      if (url.includes("/api/v2/email-otp/cooldown")) {
        return Response.json({ success: true, data: { cooldownExpiresAt: 0, cooldownRemainingSeconds: 0 } })
      }
      throw new Error(`Unexpected request: ${url}`)
    })

    history.replaceState(null, "", `/login/email-otp?flow=${validFlow}`)
    render(() => <App apiOrigin="https://worker.example" />)

    expect(await screen.findByRole("textbox", { name: "Verification code" })).toBeTruthy()
    expect(location.pathname).toBe("/login/email-otp")
    expect(location.search).toBe(`?flow=${validFlow}`)
  })

  test("reconciles and persists only an active server cooldown on reload", async () => {
    const cooldownExpiresAt = Math.ceil(Date.now() / 1000) + 60
    localStorage.setItem("zitadel-login.email-otp.cooldown-expires-at", "0")
    globalThis.fetch = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input)
      if (url.includes("/api/v2/bootstrap")) return Response.json({ success: true, data: bootstrap })
      if (url.includes("/api/v2/flow/resume")) {
        return Response.json({
          success: true,
          data: {
            kind: "render",
            route: `/login/email-otp?flow=${validFlow}`,
            screen: { name: "email_otp_code" },
            csrfToken: validCsrf,
          },
        })
      }
      if (url.includes("/api/v2/email-otp/cooldown")) {
        return Response.json({
          success: true,
          data: { cooldownExpiresAt, cooldownRemainingSeconds: 60 },
        })
      }
      throw new Error(`Unexpected request: ${url}`)
    })

    history.replaceState(null, "", `/login/email-otp?flow=${validFlow}`)
    render(() => <App apiOrigin="https://worker.example" />)

    const resendButton = (await screen.findByRole("button", { name: "Send a new code" })) as HTMLButtonElement
    const countdown = await screen.findByText(/Another code can be sent in \d+ seconds\./)
    expect(resendButton.disabled).toBe(true)
    expect(resendButton.getAttribute("aria-describedby")).toBe("email-otp-resend-countdown")
    expect(countdown.id).toBe("email-otp-resend-countdown")
    expect(localStorage.getItem("zitadel-login.email-otp.cooldown-expires-at")).toBe(String(cooldownExpiresAt))
    expect(localStorage.getItem("zitadel-login.email-otp.cooldown-expires-at")).not.toContain(validFlow)
  })

  test("renders fatal error on expired or invalid flow handle", async () => {
    globalThis.fetch = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input)
      if (url.includes("/api/v2/flow/resume")) {
        return Response.json({ success: false, op: "flowResume", errorMessage: "flow_expired" }, { status: 409 })
      }
      throw new Error(`Unexpected request: ${url}`)
    })

    history.replaceState(null, "", `/login/email-otp?flow=${validFlow}`)
    render(() => <App apiOrigin="https://worker.example" />)

    expect(await screen.findByRole("heading", { name: "Start sign-in again" })).toBeTruthy()
    expect(screen.getByRole("alert").textContent).toBe("The sign-in session is invalid or has expired.")
    expect(location.pathname).toBe("/login")
    expect(location.search).toBe("")
  })

  test("handles back/forward popstate browser history navigation safely", async () => {
    globalThis.fetch = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input)
      if (url.includes("/api/v2/bootstrap")) return Response.json({ success: true, data: bootstrap })
      if (url.includes("/api/v2/flow/resume")) {
        return Response.json({
          success: true,
          data: {
            kind: "render",
            route: `/login/email-otp?flow=${validFlow}`,
            screen: { name: "email_otp_start" },
            csrfToken: validCsrf,
          },
        })
      }
      throw new Error(`Unexpected request: ${url}`)
    })

    history.replaceState(null, "", `/login/email-otp?flow=${validFlow}`)
    render(() => <App apiOrigin="https://worker.example" />)

    await screen.findByRole("textbox", { name: "Email address" })

    history.pushState(null, "", `/login?flow=${validFlow}`)
    window.dispatchEvent(new PopStateEvent("popstate"))

    expect(await screen.findByRole("heading", { name: "Choose a method" })).toBeTruthy()
  })

  test("re-enters the code panel through browser history only after server reconciliation", async () => {
    let cooldownRequests = 0
    const cooldownExpiresAt = Math.ceil(Date.now() / 1000) + 60
    globalThis.fetch = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input)
      if (url.includes("/api/v2/bootstrap")) return Response.json({ success: true, data: bootstrap })
      if (url.includes("/api/v2/flow/resume")) {
        return Response.json({
          success: true,
          data: {
            kind: "render",
            route: `/login/email-otp?flow=${validFlow}`,
            screen: { name: "email_otp_code" },
            csrfToken: validCsrf,
          },
        })
      }
      if (url.includes("/api/v2/email-otp/cooldown")) {
        cooldownRequests += 1
        return Response.json({
          success: true,
          data: { cooldownExpiresAt, cooldownRemainingSeconds: 60 },
        })
      }
      throw new Error(`Unexpected request: ${url}`)
    })

    history.replaceState(null, "", `/login/email-otp?flow=${validFlow}`)
    render(() => <App apiOrigin="https://worker.example" />)
    await screen.findByRole("textbox", { name: "Verification code" })
    await vi.waitFor(() => expect(cooldownRequests).toBe(1))
    await vi.waitFor(() => {
      expect(localStorage.getItem("zitadel-login.email-otp.cooldown-expires-at")).toBe(String(cooldownExpiresAt))
    })

    history.pushState(null, "", `/login?flow=${validFlow}`)
    window.dispatchEvent(new PopStateEvent("popstate"))
    await screen.findByRole("heading", { name: "Choose a method" })

    history.pushState(null, "", `/login/email-otp?flow=${validFlow}`)
    window.dispatchEvent(new PopStateEvent("popstate"))
    await screen.findByRole("textbox", { name: "Verification code" })
    await vi.waitFor(() => expect(cooldownRequests).toBe(2))
    await vi.waitFor(() => {
      expect(localStorage.getItem("zitadel-login.email-otp.cooldown-expires-at")).toBe(String(cooldownExpiresAt))
    })
  })

  test("keeps primary resend disabled when cooldown reconciliation fails", async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input)
      if (url.includes("/api/v2/bootstrap")) return Response.json({ success: true, data: bootstrap })
      if (url.includes("/api/v2/flow/resume")) {
        return Response.json({
          success: true,
          data: {
            kind: "render",
            route: `/login/email-otp?flow=${validFlow}`,
            screen: { name: "email_otp_code" },
            csrfToken: validCsrf,
          },
        })
      }
      if (url.includes("/api/v2/email-otp/cooldown")) {
        return Response.json(
          { success: false, op: "emailOtpCooldown", errorMessage: "service_unavailable" },
          { status: 503 },
        )
      }
      throw new Error(`Unexpected request: ${url}`)
    })
    globalThis.fetch = fetchMock

    history.replaceState(null, "", `/login/email-otp?flow=${validFlow}`)
    render(() => <App apiOrigin="https://worker.example" />)

    const resendButton = (await screen.findByRole("button", { name: "Send a new code" })) as HTMLButtonElement
    await vi.waitFor(() => {
      expect(
        fetchMock.mock.calls.some(
          ([input]) => String(input) === `https://worker.example/api/v2/email-otp/cooldown?flow=${validFlow}`,
        ),
      ).toBe(true)
    })
    expect(resendButton.disabled).toBe(true)
  })
})
