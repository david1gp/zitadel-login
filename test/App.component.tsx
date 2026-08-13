import { cleanup, fireEvent, render, screen } from "@solidjs/testing-library"
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest"

import { App } from "../client/src/app/ui/App"

const originalFetch = globalThis.fetch
const validCsrf = "C".repeat(43)
const validFlow = "A".repeat(22)

const bootstrap = {
  capabilities: { passwordRecovery: false },
  branding: {
    dark: {
      colors: { background: "#111111", font: "#fefefe", primary: "#ddeeff", warn: "#ff0000" },
      logoUrl: "https://identity.example/assets/logo-dark",
    },
    disableWatermark: true,
    fontUrl: "https://identity.example/assets/font.woff2",
    light: {
      colors: { background: "#fefefe", font: "#101010", primary: "#112233", warn: "#aa0000" },
      logoUrl: "https://identity.example/assets/logo-light",
    },
    themeMode: "system",
  },
  identityProviders: [{ id: "github-1", name: "GitHub", type: "github" }],
  organization: { id: "org-1", name: "Contentoren" },
  primaryMethods: ["email_otp", "password", "passkey", "identity_provider"],
  updatedAt: 1,
}

function apiMockCreate(requests: string[]) {
  return vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input)
    requests.push(`${init?.method ?? "GET"} ${url}`)
    if (url.includes("/api/v2/bootstrap")) return Response.json({ success: true, data: bootstrap })
    if (url.includes("/api/v2/flow/initialize")) {
      const isMfa = location.pathname.startsWith("/login/mfa")
      return Response.json({
        success: true,
        data: {
          kind: "render",
          route: isMfa ? `/login/mfa?flow=${validFlow}` : `/login/email-otp?flow=${validFlow}`,
          screen: isMfa ? { name: "mfa" } : { name: "email_otp_start", loginHint: "hint@example.com" },
          csrfToken: validCsrf,
        },
      })
    }
    if (url.includes("/api/v2/flow/resume")) {
      return Response.json({
        success: true,
        data: {
          kind: "render",
          route: `/login/email-otp?flow=${validFlow}`,
          screen: { name: "email_otp_start", loginHint: "hint@example.com" },
          csrfToken: validCsrf,
        },
      })
    }
    if (url.includes("/api/v2/password/verify")) {
      return Response.json({
        success: true,
        data: { kind: "complete", path: `/api/v2/flow/continue?flow=${validFlow}` },
      })
    }
    if (url.includes("/api/v2/session/continue")) {
      return Response.json({
        success: true,
        data: { kind: "complete", path: `/api/v2/flow/continue?flow=${validFlow}` },
      })
    }
    if (url.includes("/api/v2/mfa/options")) {
      const isTotp = location.pathname === "/login/mfa/totp"
      return Response.json({
        success: true,
        data: isTotp ? { mode: "check", method: { type: "totp" } } : { mode: "fallback", reason: "unsupported_branch" },
      })
    }
    if (url.includes("/api/v2/mfa/totp/verify") || url.includes("/api/v2/mfa/otp/verify")) {
      return Response.json({
        success: true,
        data: { kind: "complete", path: `/api/v2/flow/continue?flow=${validFlow}` },
      })
    }
    if (url.includes("/api/v2/identity-provider/start")) {
      return Response.json({
        success: true,
        data: { redirectUrl: "https://github.com/login/oauth/authorize?client_id=github" },
      })
    }
    throw new Error(`Unexpected request: ${url}`)
  })
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
  document.getElementById("zitadel-brand-font")?.remove()
  document.documentElement.removeAttribute("style")
  document.documentElement.removeAttribute("data-theme")
})

describe("application shell", () => {
  test("initializes a bookmarked method without replacing it with the chooser", async () => {
    const requests: string[] = []
    globalThis.fetch = apiMockCreate(requests)
    history.replaceState(null, "", "/login/idp/github-1?authRequest=request-1")

    render(() => <App apiOrigin="https://worker.example" />)

    expect(await screen.findByRole("heading", { name: "Sign in with GitHub" })).toBeTruthy()
    expect(location.pathname).toBe("/login/idp/github-1")
    expect(location.search).toBe(`?flow=${validFlow}`)
    expect(requests).toHaveLength(2)
  })

  test("shows only live policy methods for a fresh sign-in despite a stored preference", async () => {
    const requests: string[] = []
    const baseMock = apiMockCreate(requests)
    globalThis.fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      if (String(input).includes("/api/v2/bootstrap")) {
        return Response.json({
          success: true,
          data: { ...bootstrap, primaryMethods: ["email_otp", "password"], identityProviders: [] },
        })
      }
      return baseMock(input, init)
    }) as unknown as typeof fetch
    localStorage.setItem(
      "zitadel-login:preference:v1:org-1",
      JSON.stringify({
        version: 1,
        selectedMethod: "email_otp",
        rememberIdentifier: true,
        identifier: "person@example.com",
        updatedAt: Date.now(),
      }),
    )
    history.replaceState(null, "", "/login?authRequest=request-1")

    render(() => <App apiOrigin="https://worker.example" />)

    expect(await screen.findByRole("heading", { name: "Choose a method" })).toBeTruthy()
    expect(screen.getByRole("button", { name: /Email code/ })).toBeTruthy()
    expect(screen.getByRole("button", { name: /^Password/ })).toBeTruthy()
    expect(screen.queryByRole("button", { name: /Passkey/ })).toBeNull()
    expect(screen.queryByRole("button", { name: /GitHub/ })).toBeNull()
    expect(screen.queryByRole("textbox", { name: "Email address" })).toBeNull()
    expect(location.pathname).toBe("/login")
    expect(location.search).toBe(`?flow=${validFlow}`)
  })

  test("resumes the server canonical method from the chooser route", async () => {
    const requests: string[] = []
    const baseMock = apiMockCreate(requests)
    globalThis.fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      if (String(input).includes("/api/v2/flow/resume")) {
        return Response.json({
          success: true,
          data: {
            kind: "render",
            route: `/login/password?flow=${validFlow}`,
            screen: { name: "email_otp_start", loginHint: "hint@example.com" },
            csrfToken: validCsrf,
          },
        })
      }
      return baseMock(input, init)
    }) as unknown as typeof fetch
    history.replaceState(null, "", `/login?flow=${validFlow}`)

    render(() => <App apiOrigin="https://worker.example" />)

    expect(await screen.findByRole("heading", { name: "Sign in with password" })).toBeTruthy()
    expect(screen.queryByRole("heading", { name: "Choose a method" })).toBeNull()
    expect(location.pathname).toBe("/login/password")
    expect(location.search).toBe(`?flow=${validFlow}`)
  })

  test("falls back for unowned methods before rendering or submitting credentials", async () => {
    const requests: string[] = []
    globalThis.fetch = apiMockCreate(requests)
    history.replaceState(null, "", "/login/mfa?authRequest=request-1")

    const view = render(() => <App apiOrigin="https://worker.example" />)
    const continueButton = await screen.findByRole("button", { name: "Continue in ZITADEL" })

    expect(view.container.querySelector("input")).toBeNull()
    fireEvent.click(continueButton)
    expect(requests).toHaveLength(3)
    expect(requests.some((r) => r.includes("/api/v2/mfa/options"))).toBe(true)
  })

  test("starts external provider intent only on explicit user action", async () => {
    const requests: string[] = []
    globalThis.fetch = apiMockCreate(requests)
    history.replaceState(null, "", "/login/idp/github-1?authRequest=request-1")

    render(() => <App apiOrigin="https://worker.example" />)

    const continueButton = await screen.findByRole("button", { name: "Continue with GitHub" })
    expect(continueButton).toBeTruthy()

    fireEvent.click(continueButton)
    expect(requests.some((r) => r.includes("/api/v2/identity-provider/start"))).toBe(true)
  })

  test("applies validated branding and persists all visible theme choices", async () => {
    const requests: string[] = []
    globalThis.fetch = apiMockCreate(requests)
    localStorage.setItem("zitadel-login:theme:v1", JSON.stringify({ value: "dark", updatedAt: 1 }))
    history.replaceState(null, "", "/login?authRequest=request-1")

    render(() => <App apiOrigin="https://worker.example" />)
    await screen.findByRole("heading", { name: "Choose a method" })

    expect(document.documentElement.dataset.theme).toBe("dark")
    expect(document.documentElement.style.getPropertyValue("--brand-background")).toBe("#111111")
    expect(screen.getByRole("img", { name: "Contentoren" }).getAttribute("src")).toContain("logo-dark")
    expect(screen.getByText("Contentoren", { selector: "p" })).toBeTruthy()
    expect(document.getElementById("zitadel-brand-font")?.textContent).toContain("font.woff2")

    fireEvent.click(screen.getByRole("button", { name: "Light theme" }))
    expect(document.documentElement.dataset.theme).toBe("light")
    expect(JSON.parse(localStorage.getItem("zitadel-login:theme:v1") ?? "null").value).toBe("light")
    fireEvent.click(screen.getByRole("button", { name: "System theme" }))
    expect(JSON.parse(localStorage.getItem("zitadel-login:theme:v1") ?? "null").value).toBe("system")
  })

  test("shows the local Contentoren mark when live branding has no logo", async () => {
    history.replaceState(null, "", "/login")
    render(() => <App apiOrigin="https://worker.example" />)

    const logo = await screen.findByRole("img", { name: "Contentoren" })
    expect(logo.tagName).toBe("svg")
    expect(logo.classList.contains("sm:max-w-[210px]")).toBe(true)
    expect(logo.querySelector("img")).toBeNull()
  })

  test("restores only an opted-in normalized identifier", async () => {
    const requests: string[] = []
    globalThis.fetch = apiMockCreate(requests)
    localStorage.setItem(
      "zitadel-login:preference:v1:org-1",
      JSON.stringify({
        version: 1,
        selectedMethod: "email_otp",
        rememberIdentifier: true,
        identifier: "person@example.com",
        updatedAt: Date.now(),
      }),
    )
    history.replaceState(null, "", "/login/email-otp?authRequest=request-1")

    render(() => <App apiOrigin="https://worker.example" />)

    const email = await screen.findByRole("textbox", { name: "Email address" })
    expect((email as HTMLInputElement).value).toBe("person@example.com")
    expect((screen.getByRole("checkbox", { name: "Remember this email" }) as HTMLInputElement).checked).toBe(true)
  })

  test("updates canonical paths for every chooser selection", async () => {
    const requests: string[] = []
    globalThis.fetch = apiMockCreate(requests)
    history.replaceState(null, "", "/login?authRequest=request-1")

    render(() => <App apiOrigin="https://worker.example" />)
    await screen.findByRole("heading", { name: "Choose a method" })
    fireEvent.click(screen.getByRole("button", { name: /Email code/ }))
    expect(location.pathname).toBe("/login/email-otp")
    expect(location.search).toBe(`?flow=${validFlow}`)
    fireEvent.click(screen.getByRole("button", { name: "Back to methods" }))
    fireEvent.click(screen.getByRole("button", { name: /^Password/ }))
    expect(location.pathname).toBe("/login/password")
    expect(location.search).toBe(`?flow=${validFlow}`)
  })

  test("never persists flow, auth, OTP, or CSRF data in localStorage", async () => {
    const requests: string[] = []
    globalThis.fetch = apiMockCreate(requests)
    history.replaceState(null, "", "/login/email-otp?authRequest=request-1")

    render(() => <App apiOrigin="https://worker.example" />)
    await screen.findByRole("textbox", { name: "Email address" })

    for (let index = 0; index < localStorage.length; index += 1) {
      const key = localStorage.key(index)
      const val = localStorage.getItem(key ?? "") ?? ""
      expect(val).not.toContain(validFlow)
      expect(val).not.toContain(validCsrf)
      expect(val).not.toContain("request-1")
    }
  })

  test("submits TOTP authenticator code and clears code input on submission", async () => {
    const requests: string[] = []
    globalThis.fetch = apiMockCreate(requests)
    history.replaceState(null, "", "/login/mfa/totp?authRequest=request-1")

    render(() => <App apiOrigin="https://worker.example" />)
    const codeInput = (await screen.findByRole("textbox", { name: "Authenticator code" })) as HTMLInputElement

    fireEvent.input(codeInput, { target: { value: "123456" } })

    const submitBtn = screen.getByRole("button", { name: "Verify" })
    fireEvent.click(submitBtn)

    expect(codeInput.value).toBe("")
    expect(requests.some((r) => r.includes("/api/v2/mfa/totp/verify"))).toBe(true)

    for (let index = 0; index < localStorage.length; index += 1) {
      const key = localStorage.key(index)
      const val = localStorage.getItem(key ?? "") ?? ""
      expect(val).not.toContain("123456")
    }
  })

  test("submits password credentials and clears password input on submission", async () => {
    const requests: string[] = []
    globalThis.fetch = apiMockCreate(requests)
    history.replaceState(null, "", "/login/password?authRequest=request-1")

    render(() => <App apiOrigin="https://worker.example" />)
    const identifierInput = (await screen.findByRole("textbox", { name: "Username or email" })) as HTMLInputElement
    const passwordInput = screen.getByLabelText("Password") as HTMLInputElement

    fireEvent.input(identifierInput, { target: { value: "user@example.com" } })
    fireEvent.input(passwordInput, { target: { value: "secret123" } })

    const submitBtn = screen.getByRole("button", { name: "Sign in" })
    fireEvent.click(submitBtn)

    expect(passwordInput.value).toBe("")
    expect(requests.some((r) => r.includes("/api/v2/password/verify"))).toBe(true)

    for (let index = 0; index < localStorage.length; index += 1) {
      const key = localStorage.key(index)
      const val = localStorage.getItem(key ?? "") ?? ""
      expect(val).not.toContain("secret123")
    }
  })

  test("shows recent accounts on chooser and handles selection", async () => {
    const requests: string[] = []
    const fetchMock = apiMockCreate(requests)
    globalThis.fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input)
      if (url.includes("/api/v2/flow/initialize")) {
        requests.push(`${init?.method ?? "GET"} ${url}`)
        return Response.json({
          success: true,
          data: {
            kind: "render",
            route: `/login?flow=${validFlow}`,
            screen: {
              name: "email_otp_start",
              recentAccounts: [
                {
                  id: "acc_alice123",
                  label: "Alice Smith",
                  lastUsedAt: 1000,
                  reauthenticationRequired: false,
                },
              ],
            },
            csrfToken: validCsrf,
          },
        })
      }
      return fetchMock(input, init)
    })
    history.replaceState(null, "", "/login?authRequest=request-1")

    render(() => <App apiOrigin="https://worker.example" />)

    expect(await screen.findByRole("heading", { name: "Choose an account or method" })).toBeTruthy()
    const accountBtn = screen.getByRole("button", { name: /Alice Smith/ })
    expect(accountBtn).toBeTruthy()

    fireEvent.click(accountBtn)

    expect(requests.some((r) => r.includes("/api/v2/session/continue"))).toBe(true)
  })

  test("removes stale account and displays generic error on 401 account_invalid", async () => {
    const requests: string[] = []
    const fetchMock = apiMockCreate(requests)
    globalThis.fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input)
      if (url.includes("/api/v2/flow/initialize")) {
        requests.push(`${init?.method ?? "GET"} ${url}`)
        return Response.json({
          success: true,
          data: {
            kind: "render",
            route: `/login?flow=${validFlow}`,
            screen: {
              name: "email_otp_start",
              recentAccounts: [
                {
                  id: "acc_stale999",
                  label: "Stale User",
                  lastUsedAt: 1000,
                  reauthenticationRequired: false,
                },
              ],
            },
            csrfToken: validCsrf,
          },
        })
      }
      if (url.includes("/api/v2/session/continue")) {
        requests.push(`${init?.method ?? "POST"} ${url}`)
        return Response.json(
          { success: false, op: "sessionContinue", errorMessage: "account_invalid" },
          { status: 401 },
        )
      }
      return fetchMock(input, init)
    })
    history.replaceState(null, "", "/login?authRequest=request-1")

    render(() => <App apiOrigin="https://worker.example" />)

    const accountBtn = await screen.findByRole("button", { name: /Stale User/ })
    fireEvent.click(accountBtn)

    expect(await screen.findByRole("alert")).toBeTruthy()
    expect(screen.getByRole("alert").textContent).toBe("The selected account is no longer valid.")
    expect(screen.queryByRole("button", { name: /Stale User/ })).toBeNull()
  })
})

describe("App standalone password recovery routing", () => {
  test("renders the standalone request panel before any login ingress work", async () => {
    const requests: string[] = []
    globalThis.fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input)
      requests.push(`${init?.method ?? "GET"} ${url}`)
      if (url.includes("/api/v2/bootstrap")) {
        return Response.json({ success: true, data: { ...bootstrap, capabilities: { passwordRecovery: true } } })
      }
      return Response.json({ success: true, data: { status: "ready", csrfToken: validCsrf, expiresAt: 1000 } })
    }) as unknown as typeof fetch
    history.replaceState(null, "", "/password/forgot?authRequest=request-1")

    render(() => <App apiOrigin="https://worker.example" />)

    expect(await screen.findByRole("heading", { name: "Reset your password" })).toBeTruthy()
    expect(requests.some((request) => request.includes("/api/v2/flow/initialize"))).toBe(false)
    expect(requests.some((request) => request.includes("/api/v2/flow/resume"))).toBe(false)
    expect(location.pathname).toBe("/password/forgot")
  })

  test("renders the canonical reset panel on /password/reset without OIDC flow state", async () => {
    const requests: string[] = []
    globalThis.fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input)
      requests.push(`${init?.method ?? "GET"} ${url}`)
      if (url.includes("/api/v2/bootstrap")) return Response.json({ success: true, data: bootstrap })
      return Response.json({
        success: true,
        data: { status: "ready", screen: "password_reset", csrfToken: validCsrf, expiresAt: 1000 },
      })
    }) as unknown as typeof fetch
    history.replaceState(null, "", "/password/reset")

    render(() => <App apiOrigin="https://worker.example" />)

    expect(await screen.findByLabelText("New password")).toBeTruthy()
    expect(requests.some((request) => request.includes("/api/v2/password/reset/set-bootstrap"))).toBe(true)
    expect(requests.some((request) => request.includes("/api/v2/flow/"))).toBe(false)
  })

  test("offers password recovery from password sign-in only when the capability permits it", async () => {
    const requests: string[] = []
    globalThis.fetch = apiMockCreate(requests) as unknown as typeof fetch
    history.replaceState(null, "", "/login/password?authRequest=request-1")

    render(() => <App apiOrigin="https://worker.example" />)

    expect(await screen.findByRole("heading", { name: "Sign in with password" })).toBeTruthy()
    expect(screen.queryByRole("button", { name: "Forgot password?" })).toBeNull()
  })

  test("shows the recovery entry when the bootstrap capability permits it", async () => {
    const requests: string[] = []
    const baseMock = apiMockCreate(requests)
    globalThis.fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      if (String(input).includes("/api/v2/bootstrap")) {
        return Response.json({ success: true, data: { ...bootstrap, capabilities: { passwordRecovery: true } } })
      }
      return baseMock(input, init)
    }) as unknown as typeof fetch
    history.replaceState(null, "", "/login/password?authRequest=request-1")

    render(() => <App apiOrigin="https://worker.example" />)

    expect(await screen.findByRole("button", { name: "Forgot password?" })).toBeTruthy()
  })

  test("renders required password change after password verification without a chooser bypass", async () => {
    const requests: string[] = []
    const baseMock = apiMockCreate(requests)
    globalThis.fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      if (String(input).includes("/api/v2/password/verify")) {
        requests.push(`POST ${String(input)}`)
        return Response.json({
          success: true,
          data: {
            kind: "render",
            route: `/login/password?flow=${validFlow}`,
            screen: { name: "password_change_required", expired: false },
            csrfToken: validCsrf,
          },
        })
      }
      return baseMock(input, init)
    }) as unknown as typeof fetch
    history.replaceState(null, "", "/login/password?authRequest=request-1")

    render(() => <App apiOrigin="https://worker.example" />)
    const identifierInput = (await screen.findByRole("textbox", { name: "Username or email" })) as HTMLInputElement
    fireEvent.input(identifierInput, { target: { value: "user@example.com" } })
    fireEvent.input(screen.getByLabelText("Password"), { target: { value: "secret123" } })
    fireEvent.click(screen.getByRole("button", { name: "Sign in" }))

    expect(await screen.findByRole("heading", { name: "Change your password" })).toBeTruthy()
    expect(screen.getByLabelText("Current password")).toBeTruthy()
    expect(screen.queryByRole("button", { name: "Back to methods" })).toBeNull()
    expect(screen.queryByRole("button", { name: "Forgot password?" })).toBeNull()
  })

  test("resumes required password change after reload with blank fields", async () => {
    const requests: string[] = []
    const baseMock = apiMockCreate(requests)
    globalThis.fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      if (String(input).includes("/api/v2/flow/resume")) {
        requests.push(`POST ${String(input)}`)
        return Response.json({
          success: true,
          data: {
            kind: "render",
            route: `/login/password?flow=${validFlow}`,
            screen: { name: "password_change_required", expired: true },
            csrfToken: validCsrf,
          },
        })
      }
      return baseMock(input, init)
    }) as unknown as typeof fetch
    history.replaceState(null, "", `/login/password?flow=${validFlow}`)

    render(() => <App apiOrigin="https://worker.example" />)

    expect(await screen.findByRole("heading", { name: "Change your password" })).toBeTruthy()
    expect(screen.getByText("Your password has expired. Set a new password to continue.")).toBeTruthy()
    expect((screen.getByLabelText("Current password") as HTMLInputElement).value).toBe("")
    expect((screen.getByLabelText("New password") as HTMLInputElement).value).toBe("")
    expect((screen.getByLabelText("Confirm new password") as HTMLInputElement).value).toBe("")
  })

  test("keeps the required-change screen after browser back navigation", async () => {
    const requests: string[] = []
    const baseMock = apiMockCreate(requests)
    globalThis.fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      if (String(input).includes("/api/v2/flow/resume")) {
        return Response.json({
          success: true,
          data: {
            kind: "render",
            route: `/login/password?flow=${validFlow}`,
            screen: { name: "password_change_required", expired: false },
            csrfToken: validCsrf,
          },
        })
      }
      return baseMock(input, init)
    }) as unknown as typeof fetch
    history.replaceState(null, "", `/login/password?flow=${validFlow}`)

    render(() => <App apiOrigin="https://worker.example" />)
    await screen.findByRole("heading", { name: "Change your password" })

    history.replaceState(null, "", "/login")
    window.dispatchEvent(new PopStateEvent("popstate"))

    expect(await screen.findByRole("heading", { name: "Change your password" })).toBeTruthy()
    expect(location.pathname).toBe("/login/password")
  })
})
