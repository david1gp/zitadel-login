import { cleanup, fireEvent, render, screen } from "@solidjs/testing-library"
import { afterEach, describe, expect, test, vi } from "vitest"
import type { LoginMethodSelection } from "../client/src/flow/model/loginMethodSelectionSchema"
import { MfaPanel } from "../client/src/mfa/ui/MfaPanel"

afterEach(cleanup)

describe("MfaPanel component", () => {
  test("resumed TOTP setup offers only safe fallback without replaying enrollment or loading options", async () => {
    const fetchMock = vi.fn(async () => {
      throw new Error("No request expected")
    })
    let fallbackCalled = false

    render(() => (
      <MfaPanel
        apiOrigin={() => "https://worker.example"}
        flowHandle={() => "flow-123"}
        selection={() => ({ method: "mfa", factor: "totp" })}
        busy={() => false}
        headingRegister={() => undefined}
        errorClear={() => undefined}
        failureSet={() => undefined}
        fallbackContinue={() => {
          fallbackCalled = true
        }}
        routeSet={() => undefined}
        fetchFn={fetchMock as unknown as typeof fetch}
        totpSetupUnavailable={() => true}
      />
    ))

    expect(screen.getByRole("heading", { name: "Set up authenticator app" })).toBeTruthy()
    expect(screen.getByText(/setup details cannot be restored after a reload/i)).toBeTruthy()
    expect(screen.queryByRole("button", { name: "Start setup" })).toBeNull()
    expect(screen.queryByRole("button", { name: "Back to methods" })).toBeNull()
    expect(fetchMock).not.toHaveBeenCalled()

    fireEvent.click(screen.getByRole("button", { name: "Continue in ZITADEL" }))
    expect(fallbackCalled).toBe(true)
  })

  test("renders select mode chooser with enrolled factors and supports factor selection", async () => {
    let selectedNext: LoginMethodSelection | undefined
    const fetchMock = vi.fn(async () =>
      Response.json({
        success: true,
        data: {
          mode: "select",
          methods: [{ type: "totp" }, { type: "email_otp" }],
        },
      }),
    )

    render(() => (
      <MfaPanel
        apiOrigin={() => "https://worker.example"}
        flowHandle={() => "flow-123"}
        selection={() => ({ method: "mfa" })}
        busy={() => false}
        headingRegister={() => undefined}
        errorClear={() => undefined}
        failureSet={() => undefined}
        fallbackContinue={() => undefined}
        routeSet={(next) => {
          selectedNext = next
        }}
        fetchFn={fetchMock as unknown as typeof fetch}
      />
    ))

    expect(await screen.findByRole("heading", { name: "Choose 2-step verification method" })).toBeTruthy()
    expect(screen.getByRole("button", { name: /Authenticator app/ })).toBeTruthy()
    expect(screen.getByRole("button", { name: /Email code/ })).toBeTruthy()

    fireEvent.click(screen.getByRole("button", { name: /Authenticator app/ }))
    expect(selectedNext).toEqual({ method: "mfa", factor: "totp" })
  })

  test("auto-selects unambiguous method when mode is check", async () => {
    let replacedRoute: LoginMethodSelection | undefined
    let replacedFlag = false
    const fetchMock = vi.fn(async () =>
      Response.json({
        success: true,
        data: {
          mode: "check",
          method: { type: "totp" },
        },
      }),
    )

    render(() => (
      <MfaPanel
        apiOrigin={() => "https://worker.example"}
        flowHandle={() => "flow-123"}
        selection={() => ({ method: "mfa" })}
        busy={() => false}
        headingRegister={() => undefined}
        errorClear={() => undefined}
        failureSet={() => undefined}
        fallbackContinue={() => undefined}
        routeSet={(next, replace) => {
          replacedRoute = next
          replacedFlag = replace ?? false
        }}
        fetchFn={fetchMock as unknown as typeof fetch}
      />
    ))

    expect(await screen.findByRole("heading", { name: "Authenticator code" })).toBeTruthy()
    expect(screen.getByRole("textbox", { name: "Authenticator code" })).toBeTruthy()
    expect(replacedRoute).toEqual({ method: "mfa", factor: "totp" })
    expect(replacedFlag).toBe(true)
  })

  test("renders factor route panel as TOTP form when TOTP is selected", async () => {
    let backCalled = false
    const fetchMock = vi.fn(async () =>
      Response.json({
        success: true,
        data: {
          mode: "select",
          methods: [{ type: "totp" }, { type: "email_otp" }],
        },
      }),
    )

    render(() => (
      <MfaPanel
        apiOrigin={() => "https://worker.example"}
        flowHandle={() => "flow-123"}
        selection={() => ({ method: "mfa", factor: "totp" })}
        busy={() => false}
        headingRegister={() => undefined}
        errorClear={() => undefined}
        failureSet={() => undefined}
        fallbackContinue={() => undefined}
        routeSet={() => {
          backCalled = true
        }}
        fetchFn={fetchMock as unknown as typeof fetch}
      />
    ))

    expect(await screen.findByRole("heading", { name: "Authenticator code" })).toBeTruthy()
    expect(screen.getByRole("textbox", { name: "Authenticator code" })).toBeTruthy()

    fireEvent.click(screen.getByRole("button", { name: "Back to 2-step choices" }))
    expect(backCalled).toBe(true)
  })

  test("renders factor route panel as Email OTP panel when email_otp is selected", async () => {
    let backCalled = false
    const fetchMock = vi.fn(async () =>
      Response.json({
        success: true,
        data: {
          mode: "select",
          methods: [{ type: "totp" }, { type: "email_otp" }],
        },
      }),
    )

    render(() => (
      <MfaPanel
        apiOrigin={() => "https://worker.example"}
        flowHandle={() => "flow-123"}
        selection={() => ({ method: "mfa", factor: "email_otp" })}
        busy={() => false}
        headingRegister={() => undefined}
        errorClear={() => undefined}
        failureSet={() => undefined}
        fallbackContinue={() => undefined}
        routeSet={() => {
          backCalled = true
        }}
        fetchFn={fetchMock as unknown as typeof fetch}
      />
    ))

    expect(await screen.findByRole("heading", { name: "Email code" })).toBeTruthy()
    expect(screen.getByRole("button", { name: "Send code" })).toBeTruthy()

    fireEvent.click(screen.getByRole("button", { name: "Back to 2-step choices" }))
    expect(backCalled).toBe(true)
  })

  test("renders factor route panel as SMS OTP panel when sms_otp is selected", async () => {
    let backCalled = false
    const fetchMock = vi.fn(async () =>
      Response.json({
        success: true,
        data: {
          mode: "select",
          methods: [{ type: "totp" }, { type: "sms_otp" }],
        },
      }),
    )

    render(() => (
      <MfaPanel
        apiOrigin={() => "https://worker.example"}
        flowHandle={() => "flow-123"}
        selection={() => ({ method: "mfa", factor: "sms_otp" })}
        busy={() => false}
        headingRegister={() => undefined}
        errorClear={() => undefined}
        failureSet={() => undefined}
        fallbackContinue={() => undefined}
        routeSet={() => {
          backCalled = true
        }}
        fetchFn={fetchMock as unknown as typeof fetch}
      />
    ))

    expect(await screen.findByRole("heading", { name: "SMS code" })).toBeTruthy()
    expect(screen.getByRole("button", { name: "Send code" })).toBeTruthy()

    fireEvent.click(screen.getByRole("button", { name: "Back to 2-step choices" }))
    expect(backCalled).toBe(true)
  })

  test("renders factor route panel as U2F panel when u2f is selected", async () => {
    let backCalled = false
    const fetchMock = vi.fn(async (url: string) => {
      if (url.includes("/challenge")) {
        return Response.json({
          success: true,
          data: {
            kind: "render",
            route: "/login/mfa?flow=flow-123",
            screen: {
              name: "mfa",
              factors: ["u2f"],
              options: {
                publicKey: {
                  challenge: "GAOHYz2jE69kJMYo6Laij8yWw9-dKKgbViNhfuy0StA",
                  rpId: "login.example",
                },
              },
            },
            csrfToken: "C".repeat(43),
          },
        })
      }
      return Response.json({
        success: true,
        data: {
          mode: "select",
          methods: [{ type: "u2f" }, { type: "email_otp" }],
        },
      })
    })

    render(() => (
      <MfaPanel
        apiOrigin={() => "https://worker.example"}
        flowHandle={() => "flow-123"}
        selection={() => ({ method: "mfa", factor: "u2f" })}
        busy={() => false}
        headingRegister={() => undefined}
        errorClear={() => undefined}
        failureSet={() => undefined}
        fallbackContinue={() => undefined}
        routeSet={() => {
          backCalled = true
        }}
        isSupported={true}
        fetchFn={fetchMock as unknown as typeof fetch}
      />
    ))

    expect(await screen.findByRole("heading", { name: "Security key" })).toBeTruthy()
    expect(screen.getByRole("button", { name: "Verify with Security key" })).toBeTruthy()

    fireEvent.click(screen.getByRole("button", { name: "Back to 2-step choices" }))
    expect(backCalled).toBe(true)
  })

  test("resumed WebAuthn setup offers only safe fallback without loading options or replaying registration", () => {
    const fetchMock = vi.fn(async () => {
      throw new Error("No request expected")
    })
    const createMock = vi.fn(async () => null)
    let fallbackCalled = false

    render(() => (
      <MfaPanel
        apiOrigin={() => "https://worker.example"}
        flowHandle={() => "flow-123"}
        selection={() => ({ method: "mfa", factor: "u2f" })}
        busy={() => false}
        headingRegister={() => undefined}
        errorClear={() => undefined}
        failureSet={() => undefined}
        fallbackContinue={() => {
          fallbackCalled = true
        }}
        routeSet={() => undefined}
        fetchFn={fetchMock as unknown as typeof fetch}
        credentialsCreate={createMock as never}
        registrationIsSupported={true}
        webAuthnSetupUnavailable={() => "u2f"}
      />
    ))

    expect(screen.getByRole("heading", { name: "Set up a security key" })).toBeTruthy()
    expect(screen.queryByRole("button", { name: "Register security key" })).toBeNull()
    expect(fetchMock).not.toHaveBeenCalled()
    expect(createMock).not.toHaveBeenCalled()

    fireEvent.click(screen.getByRole("button", { name: "Continue in ZITADEL" }))
    expect(fallbackCalled).toBe(true)
  })

  test("distinguishes U2F enrollment from an existing-factor check and orders registration before assertion", async () => {
    const requests: string[] = []
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input)
      requests.push(url)
      if (url.includes("/enroll/verify")) {
        return Response.json({
          success: true,
          data: {
            transition: {
              kind: "render",
              route: "/login/mfa?flow=flow-123",
              screen: {
                name: "mfa",
                factors: ["AUTHENTICATION_METHOD_TYPE_U2F"],
                options: {
                  publicKey: { challenge: "GAOHYz2jE69kJMYo6Laij8yWw9-dKKgbViNhfuy0StA", rpId: "login.example" },
                },
              },
              csrfToken: "C".repeat(43),
            },
          },
        })
      }
      if (url.includes("/enroll")) {
        return Response.json(
          {
            success: true,
            data: {
              options: {
                publicKey: {
                  attestation: "none",
                  authenticatorSelection: { userVerification: "discouraged" },
                  challenge: "GAOHYz2jE69kJMYo6Laij8yWw9-dKKgbViNhfuy0StA",
                  pubKeyCredParams: [{ alg: -7, type: "public-key" }],
                  rp: { id: "login.example", name: "Contentoren" },
                  timeout: 300000,
                  user: { displayName: "User", id: "dXNlci1pZA", name: "user@example.com" },
                },
              },
              transition: {
                kind: "render",
                route: "/login/mfa?flow=flow-123",
                screen: { name: "mfa_webauthn_setup", method: "u2f" },
                csrfToken: "C".repeat(43),
              },
            },
          },
          { status: 201 },
        )
      }
      return Response.json({ success: true, data: { mode: "enroll", methods: [{ type: "u2f" }] } })
    })

    render(() => (
      <MfaPanel
        apiOrigin={() => "https://worker.example"}
        flowHandle={() => "flow-123"}
        csrfToken={() => "B".repeat(43)}
        selection={() => ({ method: "mfa", factor: "u2f" })}
        busy={() => false}
        headingRegister={() => undefined}
        errorClear={() => undefined}
        failureSet={() => undefined}
        fallbackContinue={() => undefined}
        routeSet={() => undefined}
        fetchFn={fetchMock as unknown as typeof fetch}
        registrationIsSupported={true}
        isSupported={true}
        credentialsCreate={
          (async () => ({
            id: "cred-1",
            rawId: new Uint8Array([1, 2, 3]).buffer,
            type: "public-key",
            response: {
              attestationObject: new Uint8Array([4, 5, 6]).buffer,
              clientDataJSON: new Uint8Array([7, 8, 9]).buffer,
            },
          })) as never
        }
        credentialsGet={(async () => null) as never}
      />
    ))

    expect(await screen.findByRole("heading", { name: "Set up a security key" })).toBeTruthy()
    fireEvent.click(screen.getByRole("button", { name: "Register security key" }))

    expect(await screen.findByRole("button", { name: "Verify with Security key" })).toBeTruthy()
    const enrollIndex = requests.findIndex((url) => url.includes("/u2f/enroll?"))
    const verifyIndex = requests.findIndex((url) => url.includes("/u2f/enroll/verify"))
    expect(enrollIndex).toBeGreaterThanOrEqual(0)
    expect(verifyIndex).toBeGreaterThan(enrollIndex)
    expect(requests.some((url) => url.includes("/u2f/challenge"))).toBe(false)
  })

  test("renders unhandled factor route panel as explicit non-mutating placeholder with fallback button", async () => {
    let fallbackCalled = false
    let backCalled = false
    const fetchMock = vi.fn(async () =>
      Response.json({
        success: true,
        data: {
          mode: "select",
          methods: [{ type: "totp" }, { type: "email_otp" }],
        },
      }),
    )

    render(() => (
      <MfaPanel
        apiOrigin={() => "https://worker.example"}
        flowHandle={() => "flow-123"}
        selection={() => ({ method: "mfa", factor: "other_factor" as any })}
        busy={() => false}
        headingRegister={() => undefined}
        errorClear={() => undefined}
        failureSet={() => undefined}
        fallbackContinue={() => {
          fallbackCalled = true
        }}
        routeSet={() => {
          backCalled = true
        }}
        fetchFn={fetchMock as unknown as typeof fetch}
      />
    ))

    expect(await screen.findByRole("heading", { name: "2-Step Verification" })).toBeTruthy()
    expect(screen.getByText("Verification with 2-Step Verification will be completed in the next update.")).toBeTruthy()

    fireEvent.click(screen.getByRole("button", { name: "Continue in ZITADEL" }))
    expect(fallbackCalled).toBe(true)

    fireEvent.click(screen.getByRole("button", { name: "Back to 2-step choices" }))
    expect(backCalled).toBe(true)
  })

  test("renders enroll mode options", async () => {
    const fetchMock = vi.fn(async () =>
      Response.json({
        success: true,
        data: {
          mode: "enroll",
          methods: [{ type: "u2f" }],
        },
      }),
    )

    render(() => (
      <MfaPanel
        apiOrigin={() => "https://worker.example"}
        flowHandle={() => "flow-123"}
        selection={() => ({ method: "mfa" })}
        busy={() => false}
        headingRegister={() => undefined}
        errorClear={() => undefined}
        failureSet={() => undefined}
        fallbackContinue={() => undefined}
        routeSet={() => undefined}
        fetchFn={fetchMock as unknown as typeof fetch}
      />
    ))

    expect(await screen.findByRole("heading", { name: "Set up 2-step verification" })).toBeTruthy()
    expect(screen.getByRole("button", { name: /Set up Security key/ })).toBeTruthy()
    expect(screen.queryByRole("button", { name: /Set up SMS code/ })).toBeNull()
  })

  test("renders skip mode options and posts to v2 skip endpoint on submit", async () => {
    let skipped = false
    const csrfToken = "C".repeat(43)
    const skipRequests: Array<{
      method: string
      url: string
      credentials: RequestCredentials | undefined
      headers: HeadersInit | undefined
      body: unknown
    }> = []
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input)
      if (url.includes("/api/v2/mfa/skip")) {
        skipRequests.push({
          method: init?.method ?? "GET",
          url,
          credentials: init?.credentials,
          headers: init?.headers,
          body: init?.body ? JSON.parse(String(init.body)) : undefined,
        })
        return Response.json({
          success: true,
          data: {
            kind: "complete",
            path: "/api/v2/flow/continue?flow=flow-123",
          },
        })
      }
      return Response.json({
        success: true,
        data: {
          mode: "skip",
          reason: "optional_setup",
          methods: [{ type: "totp" }],
        },
      })
    })

    render(() => (
      <MfaPanel
        apiOrigin={() => "https://worker.example"}
        flowHandle={() => "flow-123"}
        csrfToken={() => csrfToken}
        selection={() => ({ method: "mfa" })}
        busy={() => false}
        headingRegister={() => undefined}
        errorClear={() => undefined}
        failureSet={() => undefined}
        fallbackContinue={() => {
          skipped = true
        }}
        routeSet={() => undefined}
        fetchFn={fetchMock as unknown as typeof fetch}
      />
    ))

    expect(await screen.findByRole("heading", { name: "Optional 2-step verification" })).toBeTruthy()
    expect(screen.getByRole("button", { name: /Set up Authenticator app/ })).toBeTruthy()

    fireEvent.click(screen.getByRole("button", { name: "Skip for now" }))
    await vi.waitFor(() => {
      expect(skipped).toBe(true)
    })
    expect(skipRequests).toEqual([
      {
        method: "POST",
        url: "https://worker.example/api/v2/mfa/skip?flow=flow-123",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: { csrfToken },
      },
    ])
  })

  test("renders fallback mode", async () => {
    let continued = false
    const fetchMock = vi.fn(async () =>
      Response.json({
        success: true,
        data: {
          mode: "fallback",
          reason: "recovery_code",
        },
      }),
    )

    render(() => (
      <MfaPanel
        apiOrigin={() => "https://worker.example"}
        flowHandle={() => "flow-123"}
        selection={() => ({ method: "mfa" })}
        busy={() => false}
        headingRegister={() => undefined}
        errorClear={() => undefined}
        failureSet={() => undefined}
        fallbackContinue={() => {
          continued = true
        }}
        routeSet={() => undefined}
        fetchFn={fetchMock as unknown as typeof fetch}
      />
    ))

    expect(await screen.findByRole("heading", { name: "2-Step verification required" })).toBeTruthy()
    expect(screen.getByText("Recovery code verification requires native ZITADEL sign-in.")).toBeTruthy()

    fireEvent.click(screen.getByRole("button", { name: "Continue in ZITADEL" }))
    expect(continued).toBe(true)
  })
})
