import { describe, expect, test, vi } from "vitest"

import { mfaU2fStateCreate } from "../client/src/mfa/ui/mfaU2fStateCreate"

const apiOrigin = "https://worker.example"
const flowHandle = "flow-handle-123"
const csrfToken = "B".repeat(43)

const mockOptionsResponse = {
  success: true,
  data: {
    kind: "render",
    route: `/login/mfa?flow=${flowHandle}`,
    screen: {
      name: "mfa",
      factors: ["u2f"],
      options: {
        publicKey: {
          challenge: "GAOHYz2jE69kJMYo6Laij8yWw9-dKKgbViNhfuy0StA",
          rpId: "login.example",
          timeout: 300000,
          allowCredentials: [
            {
              id: "ATmqBg-99qyOZk2zloPdJQyS2R7IkFT7v9Hoos_B_nM",
              type: "public-key",
            },
          ],
        },
      },
    },
    csrfToken: "C".repeat(43),
  },
}

const mockCompleteResponse = {
  success: true,
  data: {
    kind: "complete",
    path: `/api/v2/flow/continue?flow=${flowHandle}`,
  },
}

describe("mfaU2fStateCreate", () => {
  test("detects unsupported browser", () => {
    const failureMessages: string[] = []
    const state = mfaU2fStateCreate({
      apiOrigin: () => apiOrigin,
      flowHandle: () => flowHandle,
      factorType: () => "u2f",
      csrfToken: () => csrfToken,
      csrfTokenSet: () => undefined,
      busy: () => false,
      busySet: () => undefined,
      errorClear: () => undefined,
      failureSet: (msg) => failureMessages.push(msg),
      fallbackContinue: () => undefined,
      statusContinue: () => undefined,
      showRootChooser: () => undefined,
      isSupported: false,
    })

    expect(state.isSupported()).toBe(false)
  })

  test("fetches challenge and executes ceremony successfully", async () => {
    let busyState = false
    let csrfTokenState = csrfToken
    let completedUrl = ""

    const fetchMock = vi.fn(async (url: string) => {
      if (url.includes("/challenge")) return Response.json(mockOptionsResponse)
      if (url.includes("/verify")) return Response.json(mockCompleteResponse)
      return Response.error()
    })

    const credentialsGetMock = vi.fn(async () => ({
      id: "cred-1",
      rawId: new Uint8Array([1, 2, 3]).buffer,
      type: "public-key",
      response: {
        clientDataJSON: new Uint8Array([4, 5, 6]).buffer,
        authenticatorData: new Uint8Array([7, 8, 9]).buffer,
        signature: new Uint8Array([10, 11, 12]).buffer,
        userHandle: null,
      },
    })) as unknown as (options: CredentialRequestOptions) => Promise<Credential | null>

    const state = mfaU2fStateCreate({
      apiOrigin: () => apiOrigin,
      flowHandle: () => flowHandle,
      factorType: () => "u2f",
      csrfToken: () => csrfTokenState,
      csrfTokenSet: (token) => {
        csrfTokenState = token
      },
      busy: () => busyState,
      busySet: (val) => {
        busyState = val
      },
      errorClear: () => undefined,
      failureSet: () => undefined,
      fallbackContinue: () => undefined,
      statusContinue: (url) => {
        completedUrl = url
      },
      showRootChooser: () => undefined,
      credentialsGet: credentialsGetMock,
      isSupported: true,
      fetchFn: fetchMock as unknown as typeof fetch,
    })

    await state.submit()

    expect(credentialsGetMock).toHaveBeenCalledTimes(1)
    expect(completedUrl).toBe(`/api/v2/flow/continue?flow=${flowHandle}`)
  })

  test("handles cancellation or NotAllowedError gracefully", async () => {
    const failureMessages: string[] = []
    const fetchMock = vi.fn(async () => Response.json(mockOptionsResponse))

    const credentialsGetMock = vi.fn(async () => {
      throw new DOMException("The operation was canceled", "NotAllowedError")
    }) as unknown as (options: CredentialRequestOptions) => Promise<Credential | null>

    const state = mfaU2fStateCreate({
      apiOrigin: () => apiOrigin,
      flowHandle: () => flowHandle,
      factorType: () => "u2f",
      csrfToken: () => csrfToken,
      csrfTokenSet: () => undefined,
      busy: () => false,
      busySet: () => undefined,
      errorClear: () => undefined,
      failureSet: (msg) => failureMessages.push(msg),
      fallbackContinue: () => undefined,
      statusContinue: () => undefined,
      showRootChooser: () => undefined,
      credentialsGet: credentialsGetMock,
      isSupported: true,
      fetchFn: fetchMock as unknown as typeof fetch,
    })

    await state.submit()

    expect(failureMessages).toEqual(["Passkey sign-in was canceled or timed out."])
  })
})
