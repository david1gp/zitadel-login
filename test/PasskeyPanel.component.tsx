import { cleanup, fireEvent, render, screen } from "@solidjs/testing-library"
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest"

import { App } from "../client/src/app/ui/App"
import { passkeyStateCreate } from "../client/src/passkey/ui/passkeyStateCreate"

const originalFetch = globalThis.fetch
const validCsrf = "C".repeat(43)
const validFlow = "A".repeat(22)

const mockPublicKeyOptions = {
  publicKey: {
    challenge: "GAOHYz2jE69kJMYo6Laij8yWw9-dKKgbViNhfuy0StA",
    rpId: "login.example",
    timeout: 300000,
    userVerification: "required" as const,
    allowCredentials: [
      {
        id: "ATmqBg-99qyOZk2zloPdJQyS2R7IkFT7v9Hoos_B_nM",
        type: "public-key" as const,
      },
    ],
  },
}

const bootstrap = {
  capabilities: { passwordRecovery: false },
  branding: {
    dark: {
      colors: { background: "#111111", font: "#ffffff", primary: "#ddeeff", warn: "#ff0000" },
      logoUrl: "https://identity.example/dark.png",
    },
    disableWatermark: true,
    fontUrl: "https://identity.example/font.woff2",
    light: {
      colors: { background: "#ffffff", font: "#111111", primary: "#112233", warn: "#aa0000" },
      logoUrl: "https://identity.example/light.png",
    },
    themeMode: "system" as const,
  },
  identityProviders: [],
  organization: { id: "org-1", name: "Contentoren" },
  primaryMethods: ["passkey", "password"] as Array<"email_otp" | "password" | "passkey" | "identity_provider">,
  updatedAt: 1,
}

function textToBuffer(text: string): Uint8Array {
  return new TextEncoder().encode(text)
}

function fakePublicKeyCredential(): PublicKeyCredential {
  return {
    id: "ATmqBg-99qyOZk2zloPdJQyS2R7IkFT7v9Hoos_B_nM",
    rawId: textToBuffer("credential-raw-id"),
    type: "public-key",
    response: {
      clientDataJSON: textToBuffer('{"type":"webauthn.get","challenge":"GAOHYz2jE69kJMYo6Laij8yWw9-dKKgbViNhfuy0StA"}'),
      authenticatorData: textToBuffer("auth-data"),
      signature: textToBuffer("signature"),
      userHandle: textToBuffer("user-1"),
    },
  } as unknown as PublicKeyCredential
}

describe("PasskeyPanel component and state", () => {
  beforeEach(() => {
    localStorage.clear()
    globalThis.fetch = originalFetch
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
  })

  test("renders unsupported browser panel when WebAuthn is not supported", async () => {
    globalThis.fetch = vi.fn(async (input: RequestInfo) => {
      const url = String(input)
      if (url.includes("/api/v2/bootstrap")) return Response.json({ success: true, data: bootstrap })
      if (url.includes("/api/v2/flow/initialize") || url.includes("/api/v2/flow/resume")) {
        return Response.json({
          success: true,
          data: {
            kind: "render",
            route: `/login/passkey?flow=${validFlow}`,
            screen: { name: "passkey" },
            csrfToken: validCsrf,
          },
        })
      }
      throw new Error(`Unexpected request: ${url}`)
    })

    history.replaceState(null, "", "/login/passkey?authRequest=request-1")

    // App rendered with unsupported navigator
    const origNav = window.navigator
    Object.defineProperty(window, "navigator", {
      configurable: true,
      value: { credentials: undefined },
    })

    render(() => <App apiOrigin="https://worker.example" />)

    expect(await screen.findByRole("heading", { name: "Passkey not supported" })).toBeTruthy()
    expect(screen.getByText(/Passkey authentication is not supported in this browser/)).toBeTruthy()

    Object.defineProperty(window, "navigator", { configurable: true, value: origNav })
  })

  test("completes passkey sign-in ceremony end to end with deterministic fake credential", async () => {
    const requests: string[] = []
    globalThis.fetch = vi.fn(async (input: RequestInfo, init?: RequestInit) => {
      const url = String(input)
      requests.push(`${init?.method ?? "GET"} ${url}`)
      if (url.includes("/api/v2/bootstrap")) return Response.json({ success: true, data: bootstrap })
      if (url.includes("/api/v2/flow/initialize") || url.includes("/api/v2/flow/resume")) {
        return Response.json({
          success: true,
          data: {
            kind: "render",
            route: `/login/passkey?flow=${validFlow}`,
            screen: { name: "passkey", options: mockPublicKeyOptions },
            csrfToken: validCsrf,
          },
        })
      }
      if (url.includes("/api/v2/passkey/verify")) {
        return Response.json({
          success: true,
          data: { kind: "complete", path: `/api/v2/flow/continue?flow=${validFlow}` },
        })
      }
      throw new Error(`Unexpected request: ${url}`)
    })

    const fakeCredentialsGet = vi.fn(async () => fakePublicKeyCredential())

    history.replaceState(null, "", `/login/passkey?flow=${validFlow}`)

    // Create custom state and component test
    const busy = { get: () => false, set: () => {} }
    const csrfToken = { get: () => validCsrf, set: () => {} }
    const flowHandle = { get: () => validFlow, set: () => {} }
    const notice = { get: () => "", set: () => {} }

    const state = passkeyStateCreate({
      apiOrigin: () => "https://worker.example",
      busy,
      csrfToken,
      flowHandle,
      errorClear: () => {},
      failureSet: () => {},
      fallbackContinue: () => {},
      notice,
      preferenceSave: () => {},
      statusContinue: (url) => {
        expect(url).toContain("/api/v2/flow/continue")
      },
      credentialsGet: fakeCredentialsGet,
      isSupported: true,
    })

    state.optionsSet(mockPublicKeyOptions)
    await state.submit()

    expect(fakeCredentialsGet).toHaveBeenCalledOnce()
    expect(requests.some((r) => r.includes("/api/v2/passkey/verify"))).toBe(true)
  })

  test("handles ceremony cancellation and allows retry", async () => {
    let failureMsg = ""
    const fakeCredentialsGet = vi
      .fn()
      .mockRejectedValueOnce(new DOMException("The user canceled the operation.", "NotAllowedError"))
      .mockResolvedValueOnce(fakePublicKeyCredential())

    globalThis.fetch = vi.fn(async (input: RequestInfo) => {
      const url = String(input)
      if (url.includes("/api/v2/passkey/verify")) {
        return Response.json({
          success: true,
          data: { kind: "complete", path: `/api/v2/flow/continue?flow=${validFlow}` },
        })
      }
      throw new Error(`Unexpected request: ${url}`)
    })

    const busy = { get: () => false, set: () => {} }
    const csrfToken = { get: () => validCsrf, set: () => {} }
    const flowHandle = { get: () => validFlow, set: () => {} }
    const notice = { get: () => "", set: () => {} }

    const state = passkeyStateCreate({
      apiOrigin: () => "https://worker.example",
      busy,
      csrfToken,
      flowHandle,
      errorClear: () => {},
      failureSet: (msg) => {
        failureMsg = msg
      },
      fallbackContinue: () => {},
      notice,
      preferenceSave: () => {},
      statusContinue: () => {},
      credentialsGet: fakeCredentialsGet,
      isSupported: true,
    })

    state.optionsSet(mockPublicKeyOptions)

    // First attempt -> user cancels
    await state.submit()
    expect(failureMsg).toBe("Passkey sign-in was canceled or timed out.")

    // Second attempt -> user retries and succeeds
    await state.submit()
    expect(fakeCredentialsGet).toHaveBeenCalledTimes(2)
  })

  test("renders MFA-required transition when verification returns screen mfa", async () => {
    const fakeCredentialsGet = vi.fn(async () => fakePublicKeyCredential())

    globalThis.fetch = vi.fn(async (input: RequestInfo) => {
      const url = String(input)
      if (url.includes("/api/v2/passkey/verify")) {
        return Response.json({
          success: true,
          data: {
            kind: "render",
            route: `/login/mfa?flow=${validFlow}`,
            screen: { name: "mfa", factors: ["AUTHENTICATION_METHOD_TYPE_TOTP"] },
            csrfToken: validCsrf,
          },
        })
      }
      throw new Error(`Unexpected request: ${url}`)
    })

    const busy = { get: () => false, set: () => {} }
    const csrfToken = { get: () => validCsrf, set: () => {} }
    const flowHandle = { get: () => validFlow, set: () => {} }
    const notice = { get: () => "", set: () => {} }

    const state = passkeyStateCreate({
      apiOrigin: () => "https://worker.example",
      busy,
      csrfToken,
      flowHandle,
      errorClear: () => {},
      failureSet: () => {},
      fallbackContinue: () => {},
      notice,
      preferenceSave: () => {},
      statusContinue: () => {},
      credentialsGet: fakeCredentialsGet,
      isSupported: true,
    })

    state.optionsSet(mockPublicKeyOptions)
    await state.submit()

    expect(state.mfaRequired()).toBe(true)
  })
})
