import { cleanup, fireEvent, render, screen } from "@solidjs/testing-library"
import { afterEach, describe, expect, test, vi } from "vitest"

import { MfaWebAuthnEnrollPanel } from "../client/src/mfa/ui/MfaWebAuthnEnrollPanel"

afterEach(cleanup)

const apiOrigin = "https://worker.example"
const flowHandle = "flow-123"
const csrfToken = "B".repeat(43)
const nextCsrfToken = "D".repeat(43)
const challenge = "GAOHYz2jE69kJMYo6Laij8yWw9-dKKgbViNhfuy0StA"

const creationOptions = {
  publicKey: {
    attestation: "none",
    authenticatorSelection: { userVerification: "discouraged" },
    challenge,
    pubKeyCredParams: [{ alg: -7, type: "public-key" }],
    rp: { id: "login.example", name: "Contentoren" },
    timeout: 300000,
    user: { displayName: "User", id: "dXNlci1pZA", name: "user@example.com" },
    excludeCredentials: [{ id: "ZXhpc3Rpbmc", type: "public-key" }],
  },
}

function startResponseCreate() {
  return Response.json(
    {
      success: true,
      data: {
        options: creationOptions,
        transition: {
          kind: "render",
          route: `/login/mfa?flow=${flowHandle}`,
          screen: { name: "mfa_webauthn_setup", method: "u2f" },
          csrfToken: nextCsrfToken,
        },
      },
    },
    { status: 201 },
  )
}

function assertionTransitionResponseCreate() {
  return Response.json({
    success: true,
    data: {
      transition: {
        kind: "render",
        route: `/login/mfa?flow=${flowHandle}`,
        screen: {
          name: "mfa",
          factors: ["AUTHENTICATION_METHOD_TYPE_U2F"],
          options: { publicKey: { challenge, rpId: "login.example", userVerification: "discouraged" } },
        },
        csrfToken: nextCsrfToken,
      },
    },
  })
}

const credentialCreate = () =>
  ({
    id: "cred-1",
    rawId: new Uint8Array([1, 2, 3]).buffer,
    type: "public-key",
    response: {
      attestationObject: new Uint8Array([4, 5, 6]).buffer,
      clientDataJSON: new Uint8Array([7, 8, 9]).buffer,
    },
  }) as unknown as Credential

type PanelOverrides = {
  method?: "u2f" | "passkey"
  fetchFn?: typeof fetch
  busy?: () => boolean
  busySet?: (value: boolean) => void
  csrfTokenSet?: (token: string) => void
  failureSet?: (message: string) => void
  fallbackContinue?: (path?: string) => void
  statusContinue?: (url: string) => void
  assertionStart?: (options: unknown) => void
  optionsReload?: () => Promise<void>
  credentialsCreate?: (options: CredentialCreationOptions) => Promise<Credential | null>
  isSupported?: boolean
  setupUnavailable?: boolean
}

function panelRender(overrides: PanelOverrides = {}) {
  return render(() => (
    <MfaWebAuthnEnrollPanel
      apiOrigin={() => apiOrigin}
      flowHandle={() => flowHandle}
      method={() => overrides.method ?? "u2f"}
      csrfToken={() => csrfToken}
      csrfTokenSet={overrides.csrfTokenSet ?? (() => undefined)}
      busy={overrides.busy ?? (() => false)}
      busySet={overrides.busySet ?? (() => undefined)}
      headingRegister={() => undefined}
      errorClear={() => undefined}
      failureSet={overrides.failureSet ?? (() => undefined)}
      fallbackContinue={overrides.fallbackContinue ?? (() => undefined)}
      statusContinue={overrides.statusContinue ?? (() => undefined)}
      assertionStart={overrides.assertionStart as never}
      optionsReload={overrides.optionsReload}
      showRootChooser={() => undefined}
      credentialsCreate={overrides.credentialsCreate ?? ((async () => credentialCreate()) as never)}
      isSupported={overrides.isSupported ?? true}
      fetchFn={overrides.fetchFn}
      setupUnavailable={overrides.setupUnavailable}
    />
  ))
}

describe("MfaWebAuthnEnrollPanel component", () => {
  test("requires explicit action and does not start registration on mount", () => {
    const fetchMock = vi.fn(async () => startResponseCreate())
    const createMock = vi.fn(async () => credentialCreate())
    panelRender({ fetchFn: fetchMock as unknown as typeof fetch, credentialsCreate: createMock as never })

    expect(fetchMock).not.toHaveBeenCalled()
    expect(createMock).not.toHaveBeenCalled()
    expect(screen.getByRole("button", { name: "Register security key" })).toBeTruthy()
  })

  test("posts the exact enroll contract, preserves worker creation options, and hands off a fresh assertion", async () => {
    const calls: Array<[string, RequestInit]> = []
    const fetchMock = vi.fn(async (url: string, init: RequestInit) => {
      calls.push([url, init])
      if (url.includes("/enroll/verify")) return assertionTransitionResponseCreate()
      return startResponseCreate()
    })
    let created: CredentialCreationOptions | undefined
    let assertionOptions: unknown
    let reloaded = false
    panelRender({
      fetchFn: fetchMock as unknown as typeof fetch,
      credentialsCreate: (async (options: CredentialCreationOptions) => {
        created = options
        return credentialCreate()
      }) as never,
      assertionStart: (options) => {
        assertionOptions = options
      },
      optionsReload: async () => {
        reloaded = true
      },
    })

    fireEvent.input(screen.getByLabelText("Name (optional)"), { target: { value: "  Yubikey 5  " } })
    fireEvent.click(screen.getByRole("button", { name: "Register security key" }))

    await vi.waitFor(() => expect(assertionOptions).toBeTruthy())
    expect(calls[0]?.[0]).toBe(`${apiOrigin}/api/v2/mfa/u2f/enroll?flow=${flowHandle}`)
    expect(calls[0]?.[1].method).toBe("POST")
    expect(calls[0]?.[1].credentials).toBe("include")
    expect(JSON.parse(calls[0]?.[1].body as string)).toEqual({ method: "u2f", csrfToken })

    expect(created?.publicKey?.rp).toEqual({ id: "login.example", name: "Contentoren" })
    expect(created?.publicKey?.authenticatorSelection).toEqual({ userVerification: "discouraged" })
    expect(created?.publicKey?.attestation).toBe("none")
    expect(created?.publicKey?.timeout).toBe(300000)
    expect(created?.publicKey?.excludeCredentials?.length).toBe(1)

    expect(calls[1]?.[0]).toBe(`${apiOrigin}/api/v2/mfa/u2f/enroll/verify?flow=${flowHandle}`)
    const verifyBody = JSON.parse(calls[1]?.[1].body as string)
    expect(verifyBody.method).toBe("u2f")
    expect(verifyBody.displayName).toBe("Yubikey 5")
    expect(verifyBody.csrfToken).toBe(csrfToken)
    expect(Object.keys(verifyBody.credential).sort()).toEqual(["id", "rawId", "response", "type"])
    expect(Object.keys(verifyBody.credential.response).sort()).toEqual(["attestationObject", "clientDataJSON"])
    expect(reloaded).toBe(false)
    expect(assertionOptions).toEqual({
      publicKey: { challenge, rpId: "login.example", userVerification: "discouraged" },
    })
  })

  test("requires user verification options for verified passkeys", async () => {
    const fetchMock = vi.fn(async () =>
      Response.json(
        {
          success: true,
          data: {
            options: {
              publicKey: { ...creationOptions.publicKey, authenticatorSelection: { userVerification: "required" } },
            },
            transition: {
              kind: "render",
              route: `/login/mfa?flow=${flowHandle}`,
              screen: { name: "mfa_webauthn_setup", method: "passkey" },
              csrfToken: nextCsrfToken,
            },
          },
        },
        { status: 201 },
      ),
    )
    let created: CredentialCreationOptions | undefined
    panelRender({
      method: "passkey",
      fetchFn: fetchMock as unknown as typeof fetch,
      credentialsCreate: (async (options: CredentialCreationOptions) => {
        created = options
        return null
      }) as never,
    })

    fireEvent.click(screen.getByRole("button", { name: "Create passkey" }))
    await vi.waitFor(() => expect(created).toBeTruthy())
    expect(fetchMock.mock.calls[0]?.[0]).toBe(`${apiOrigin}/api/v2/mfa/passkey/enroll?flow=${flowHandle}`)
    expect(created?.publicKey?.authenticatorSelection).toEqual({ userVerification: "required" })
  })

  test("retries a canceled ceremony without requesting a duplicate registration challenge", async () => {
    const fetchMock = vi.fn(async (url: string) =>
      url.includes("/enroll/verify") ? assertionTransitionResponseCreate() : startResponseCreate(),
    )
    let createCalls = 0
    let failure = ""
    let assertionOptions: unknown
    panelRender({
      fetchFn: fetchMock as unknown as typeof fetch,
      credentialsCreate: (async () => {
        createCalls += 1
        if (createCalls === 1) throw { name: "NotAllowedError" }
        return credentialCreate()
      }) as never,
      failureSet: (message) => (failure = message),
      assertionStart: (options) => {
        assertionOptions = options
      },
    })

    fireEvent.click(screen.getByRole("button", { name: "Register security key" }))
    await vi.waitFor(() => expect(failure).toBe("Security key registration was canceled or timed out."))
    fireEvent.click(screen.getByRole("button", { name: "Register security key" }))

    await vi.waitFor(() => expect(assertionOptions).toBeTruthy())
    expect(createCalls).toBe(2)
    expect(fetchMock.mock.calls.filter(([url]) => !String(url).includes("/verify"))).toHaveLength(1)
    expect(fetchMock.mock.calls.filter(([url]) => String(url).includes("/verify"))).toHaveLength(1)
  })

  test("rejects malformed authenticator responses before any verify request", async () => {
    const fetchMock = vi.fn(async () => startResponseCreate())
    let failure = ""
    panelRender({
      fetchFn: fetchMock as unknown as typeof fetch,
      credentialsCreate: (async () => ({ id: "x", type: "public-key", response: {} })) as never,
      failureSet: (message) => (failure = message),
    })

    fireEvent.click(screen.getByRole("button", { name: "Register security key" }))
    await vi.waitFor(() => expect(failure).toBe("Failed to process the security key registration response."))
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  test("shows an unsupported notice without requesting registration", () => {
    const fetchMock = vi.fn(async () => startResponseCreate())
    panelRender({ fetchFn: fetchMock as unknown as typeof fetch, isSupported: false })

    expect(screen.queryByRole("button", { name: "Register security key" })).toBeNull()
    expect(document.body.textContent).toContain("not supported in this browser")
    expect(fetchMock).not.toHaveBeenCalled()
  })

  test("offers safe fallback for authoritative resumed setup without replaying registration", () => {
    const fetchMock = vi.fn(async () => startResponseCreate())
    const createMock = vi.fn(async () => credentialCreate())
    let fallbackCalled = false
    panelRender({
      fetchFn: fetchMock as unknown as typeof fetch,
      credentialsCreate: createMock as never,
      setupUnavailable: true,
      fallbackContinue: () => {
        fallbackCalled = true
      },
    })

    fireEvent.click(screen.getByRole("button", { name: "Continue in ZITADEL" }))
    expect(fallbackCalled).toBe(true)
    expect(fetchMock).not.toHaveBeenCalled()
    expect(createMock).not.toHaveBeenCalled()
  })

  test("prevents duplicate registration requests while one is in flight", async () => {
    let resolveStart: (() => void) | undefined
    const pending = new Promise<void>((resolve) => {
      resolveStart = resolve
    })
    const fetchMock = vi.fn(async (url: string) => {
      if (url.includes("/enroll/verify")) return assertionTransitionResponseCreate()
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

    const button = screen.getByRole("button", { name: "Register security key" })
    fireEvent.click(button)
    fireEvent.click(button)
    fireEvent.click(button)
    resolveStart?.()

    await vi.waitFor(() => expect(busyState).toBe(false))
    expect(fetchMock.mock.calls.filter(([url]) => !String(url).includes("/verify")).length).toBe(1)
  })

  test("keeps registration material out of browser storage and discards late responses after unmount", async () => {
    let resolveStart: ((response: Response) => void) | undefined
    const fetchMock = vi.fn(
      async () =>
        new Promise<Response>((resolve) => {
          resolveStart = resolve
        }),
    )
    const createMock = vi.fn(async () => credentialCreate())
    let updatedCsrf = ""
    let busyState = false
    const panel = panelRender({
      fetchFn: fetchMock as unknown as typeof fetch,
      credentialsCreate: createMock as never,
      csrfTokenSet: (token) => {
        updatedCsrf = token
      },
      busy: () => busyState,
      busySet: (value) => {
        busyState = value
      },
    })

    fireEvent.input(screen.getByLabelText("Name (optional)"), { target: { value: "Yubikey" } })
    fireEvent.click(screen.getByRole("button", { name: "Register security key" }))
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1))
    panel.unmount()
    resolveStart?.(startResponseCreate())

    await vi.waitFor(() => expect(busyState).toBe(false))
    expect(updatedCsrf).toBe("")
    expect(createMock).not.toHaveBeenCalled()
    const stored = JSON.stringify(localStorage) + JSON.stringify(sessionStorage)
    expect(stored).not.toContain(challenge)
    expect(stored).not.toContain("Yubikey")
  })
})
