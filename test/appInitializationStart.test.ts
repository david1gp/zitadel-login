import { afterEach, describe, expect, test, vi } from "vitest"

import { appInitializationStart } from "../client/src/app/model/appInitializationStart"

const originalFetch = globalThis.fetch
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
  primaryMethods: ["email_otp"],
  updatedAt: 1,
}

afterEach(() => {
  globalThis.fetch = originalFetch
})

describe("appInitializationStart", () => {
  test("returns fatal status if URL contains invalid ingress params", async () => {
    const currentUrl = new URL("https://login.example/login?invalid=1")
    const result = await appInitializationStart("https://worker.example", currentUrl, () => undefined)
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.status).toBe("fatal")
      if (result.data.status === "fatal") {
        expect(result.data.errorMessage).toBe("The sign-in link contains unsupported state.")
      }
    }
  })

  test("returns fatal status if authRequest and flow parameters are missing", async () => {
    const currentUrl = new URL("https://login.example/login")
    const result = await appInitializationStart("https://worker.example", currentUrl, () => undefined)
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.status).toBe("fatal")
      if (result.data.status === "fatal") {
        expect(result.data.errorMessage).toBe("Return to the application and start sign-in again.")
      }
    }
  })

  test("returns ready status with bootstrap and csrfToken when initialization succeeds", async () => {
    globalThis.fetch = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input)
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
      throw new Error(`Unexpected request: ${url}`)
    })

    const currentUrl = new URL("https://login.example/login/email-otp?authRequest=request-1")
    const result = await appInitializationStart("https://worker.example", currentUrl, () => undefined)

    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.status).toBe("ready")
      if (result.data.status === "ready") {
        expect(result.data.csrfToken).toBe(validCsrf)
        expect(result.data.flowHandle).toBe(validFlow)
        expect(result.data.loginHint).toBe("user@example.com")
        expect(result.data.routeSelection).toEqual({ method: "email_otp" })
      }
    }
  })

  test("uses the canonical email route when resuming at the chooser route", async () => {
    globalThis.fetch = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input)
      if (url.includes("/api/v2/flow/resume")) {
        return Response.json({
          success: true,
          data: {
            kind: "render",
            route: `/login/email-otp?flow=${validFlow}`,
            screen: { name: "email_otp_start", loginHint: "resumed@example.com" },
            csrfToken: validCsrf,
          },
        })
      }
      throw new Error(`Unexpected request: ${url}`)
    })

    const currentUrl = new URL(`https://login.example/login?flow=${validFlow}`)
    const result = await appInitializationStart("https://worker.example", currentUrl, () => undefined)

    expect(result.success).toBe(true)
    if (result.success && result.data.status === "ready") {
      expect(result.data.flowHandle).toBe(validFlow)
      expect(result.data.loginHint).toBe("resumed@example.com")
      expect(result.data.routeSelection).toEqual({ method: "email_otp" })
    }
  })

  test("falls back to native Login V2 when bootstrap fails for a fresh flow", async () => {
    globalThis.fetch = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input)
      if (url.includes("/api/v2/bootstrap"))
        return Response.json({ success: false, errorMessage: "unavailable" }, { status: 503 })
      if (url.includes("/api/v2/flow/initialize")) {
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

    const result = await appInitializationStart(
      "https://worker.example",
      new URL("https://login.example/login?authRequest=request-1"),
      () => undefined,
    )

    expect(result).toEqual({
      success: true,
      data: { status: "fallback", fallbackUrl: `/api/v2/flow/fallback?flow=${validFlow}` },
    })
  })

  test("keeps an authoritative continuation screen when bootstrap fails", async () => {
    globalThis.fetch = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input)
      if (url.includes("/api/v2/bootstrap"))
        return Response.json({ success: false, errorMessage: "unavailable" }, { status: 503 })
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
      throw new Error(`Unexpected request: ${url}`)
    })

    const result = await appInitializationStart(
      "https://worker.example",
      new URL(`https://login.example/login/email-otp?flow=${validFlow}`),
      () => undefined,
    )

    expect(result.success).toBe(true)
    if (result.success && result.data.status === "ready") {
      expect(result.data.bootstrap.primaryMethods).toEqual([])
      expect(result.data.emailStep).toBe("code")
      expect(result.data.routeSelection).toEqual({ method: "email_otp" })
    }
  })

  test("uses the canonical password route when resuming at the chooser route", async () => {
    globalThis.fetch = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input)
      if (url.includes("/api/v2/bootstrap"))
        return Response.json({ success: true, data: { ...bootstrap, primaryMethods: ["password"] } })
      if (url.includes("/api/v2/flow/resume")) {
        return Response.json({
          success: true,
          data: {
            kind: "render",
            route: `/login/password?flow=${validFlow}`,
            screen: { name: "email_otp_start" },
            csrfToken: validCsrf,
          },
        })
      }
      throw new Error(`Unexpected request: ${url}`)
    })

    const result = await appInitializationStart(
      "https://worker.example",
      new URL(`https://login.example/login?flow=${validFlow}`),
      () => undefined,
    )

    expect(result.success).toBe(true)
    if (result.success && result.data.status === "ready") {
      expect(result.data.routeSelection).toEqual({ method: "password" })
    }
  })

  test("marks resumed TOTP setup as unavailable without reconstructing setup material", async () => {
    globalThis.fetch = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input)
      if (url.includes("/api/v2/bootstrap")) return Response.json({ success: true, data: bootstrap })
      if (url.includes("/api/v2/flow/resume")) {
        return Response.json({
          success: true,
          data: {
            kind: "render",
            route: `/login/mfa?flow=${validFlow}`,
            screen: { name: "mfa_totp_setup" },
            csrfToken: validCsrf,
          },
        })
      }
      throw new Error(`Unexpected request: ${url}`)
    })

    const result = await appInitializationStart(
      "https://worker.example",
      new URL(`https://login.example/login/mfa/totp?flow=${validFlow}`),
      () => undefined,
    )

    expect(result.success).toBe(true)
    if (result.success && result.data.status === "ready") {
      expect(result.data.routeSelection).toEqual({ method: "mfa" })
      expect(result.data.totpSetupUnavailable).toBe(true)
      expect(result.data.webAuthnSetupUnavailable).toBeUndefined()
    }
  })

  test("marks resumed WebAuthn setup as unavailable and keeps the authoritative method", async () => {
    globalThis.fetch = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input)
      if (url.includes("/api/v2/bootstrap")) return Response.json({ success: true, data: bootstrap })
      if (url.includes("/api/v2/flow/resume")) {
        return Response.json({
          success: true,
          data: {
            kind: "render",
            route: `/login/mfa?flow=${validFlow}`,
            screen: { name: "mfa_webauthn_setup", method: "passkey" },
            csrfToken: validCsrf,
          },
        })
      }
      throw new Error(`Unexpected request: ${url}`)
    })

    const result = await appInitializationStart(
      "https://worker.example",
      new URL(`https://login.example/login/mfa/passkey?flow=${validFlow}`),
      () => undefined,
    )

    expect(result.success).toBe(true)
    if (result.success && result.data.status === "ready") {
      expect(result.data.webAuthnSetupUnavailable).toBe("passkey")
      expect(result.data.totpSetupUnavailable).toBe(false)
    }
  })

  test("keeps resumed WebAuthn enrollment assertion state authoritative", async () => {
    globalThis.fetch = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input)
      if (url.includes("/api/v2/bootstrap")) return Response.json({ success: true, data: bootstrap })
      if (url.includes("/api/v2/flow/resume")) {
        return Response.json({
          success: true,
          data: {
            kind: "render",
            route: `/login/mfa?flow=${validFlow}`,
            screen: { name: "mfa", factors: ["AUTHENTICATION_METHOD_TYPE_U2F"], enrollment: true },
            csrfToken: validCsrf,
          },
        })
      }
      throw new Error(`Unexpected request: ${url}`)
    })

    const result = await appInitializationStart(
      "https://worker.example",
      new URL(`https://login.example/login/mfa?flow=${validFlow}`),
      () => undefined,
    )

    expect(result.success).toBe(true)
    if (result.success && result.data.status === "ready") {
      expect(result.data.webAuthnEnrollmentPending).toBe(true)
    }
  })

  test("resumes authoritative email enrollment code state without returning to enrollment", async () => {
    globalThis.fetch = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input)
      if (url.includes("/api/v2/bootstrap")) return Response.json({ success: true, data: bootstrap })
      if (url.includes("/api/v2/flow/resume")) {
        return Response.json({
          success: true,
          data: {
            kind: "render",
            route: `/login/mfa?flow=${validFlow}`,
            screen: { name: "mfa_email_otp_code", challengeIssued: true, enrollment: true },
            csrfToken: validCsrf,
          },
        })
      }
      throw new Error(`Unexpected request: ${url}`)
    })

    const result = await appInitializationStart(
      "https://worker.example",
      new URL(`https://login.example/login/mfa?flow=${validFlow}`),
      () => undefined,
    )

    expect(result.success).toBe(true)
    if (result.success && result.data.status === "ready") {
      expect(result.data.emailOtpCodePending).toBe(true)
      expect(result.data.emailOtpEnrollmentPending).toBe(true)
      expect(result.data.totpSetupUnavailable).toBe(false)
      expect(result.data.webAuthnSetupUnavailable).toBeUndefined()
    }
  })
  test("projects a resumed password_change_required render for the required-change screen", async () => {
    globalThis.fetch = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input)
      if (url.includes("/api/v2/bootstrap")) return Response.json({ success: true, data: bootstrap })
      if (url.includes("/api/v2/flow/resume")) {
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
      throw new Error(`Unexpected request: ${url}`)
    })

    const result = await appInitializationStart(
      "https://worker.example",
      new URL(`https://login.example/login/password?flow=${validFlow}`),
      () => undefined,
    )

    expect(result.success).toBe(true)
    if (result.success && result.data.status === "ready") {
      expect(result.data.passwordChangeRequired).toEqual({ expired: true })
      expect(result.data.emailOtpCodePending).toBe(false)
      expect(result.data.totpSetupUnavailable).toBe(false)
    }
  })

  test("keeps resumed completion scope metadata for flow preference promotion", async () => {
    globalThis.fetch = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input)
      if (url.includes("/api/v2/bootstrap")) return Response.json({ success: true, data: bootstrap })
      if (url.includes("/api/v2/flow/resume")) {
        return Response.json({
          success: true,
          data: { kind: "complete", path: `/api/v2/flow/continue?flow=${validFlow}` },
        })
      }
      throw new Error(`Unexpected request: ${url}`)
    })

    const result = await appInitializationStart(
      "https://worker.example",
      new URL(`https://login.example/login/mfa?flow=${validFlow}`),
      () => undefined,
    )

    expect(result).toEqual({
      success: true,
      data: {
        status: "continue",
        continuationUrl: `/api/v2/flow/continue?flow=${validFlow}`,
        flowHandle: validFlow,
        organizationId: "org-1",
      },
    })
  })
})
