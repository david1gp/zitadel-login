import { cleanup, fireEvent, render, screen } from "@solidjs/testing-library"
import { afterEach, describe, expect, test, vi } from "vitest"

import { MfaU2fPanel } from "../client/src/mfa/ui/MfaU2fPanel"

afterEach(cleanup)

const mockOptionsResponse = {
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
}

describe("MfaU2fPanel component", () => {
  test("renders U2F security key UI and submits verification on button click", async () => {
    let completedUrl = ""

    const fetchMock = vi.fn(async (url: string) => {
      if (url.includes("/challenge")) return Response.json(mockOptionsResponse)
      if (url.includes("/verify")) {
        return Response.json({
          success: true,
          data: {
            kind: "complete",
            path: "/api/v2/flow/continue?flow=flow-123",
          },
        })
      }
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

    render(() => (
      <MfaU2fPanel
        apiOrigin={() => "https://worker.example"}
        flowHandle={() => "flow-123"}
        factorType={() => "u2f"}
        csrfToken={() => "B".repeat(43)}
        csrfTokenSet={() => undefined}
        busy={() => false}
        busySet={() => undefined}
        headingRegister={() => undefined}
        errorClear={() => undefined}
        failureSet={() => undefined}
        fallbackContinue={() => undefined}
        statusContinue={(url) => {
          completedUrl = url
        }}
        showRootChooser={() => undefined}
        credentialsGet={credentialsGetMock}
        isSupported={true}
        fetchFn={fetchMock as unknown as typeof fetch}
      />
    ))

    expect(await screen.findByRole("heading", { name: "Security key" })).toBeTruthy()
    expect(screen.getAllByRole("heading", { level: 1 })).toHaveLength(1)
    expect(screen.queryByText("2-Step Verification")).toBeNull()
    const button = screen.getByRole("button", { name: "Verify with Security key" })
    expect(button).toBeTruthy()

    fireEvent.click(button)
    await vi.waitFor(() => expect(credentialsGetMock).toHaveBeenCalled())
    expect(completedUrl).toBe("/api/v2/flow/continue?flow=flow-123")
  })

  test("renders unsupported browser view when isSupported is false", async () => {
    let rootChooserCalled = false

    render(() => (
      <MfaU2fPanel
        apiOrigin={() => "https://worker.example"}
        flowHandle={() => "flow-123"}
        factorType={() => "passkey"}
        csrfToken={() => "B".repeat(43)}
        csrfTokenSet={() => undefined}
        busy={() => false}
        busySet={() => undefined}
        headingRegister={() => undefined}
        errorClear={() => undefined}
        failureSet={() => undefined}
        fallbackContinue={() => undefined}
        statusContinue={() => undefined}
        showRootChooser={() => {
          rootChooserCalled = true
        }}
        isSupported={false}
      />
    ))

    expect(await screen.findByRole("heading", { name: "Passkey not supported" })).toBeTruthy()
    expect(
      screen.getByText(
        "Passkey authentication is not supported in this browser. Please use another 2-step verification method.",
      ),
    ).toBeTruthy()

    fireEvent.click(screen.getByRole("button", { name: "Back to methods" }))
    expect(rootChooserCalled).toBe(true)
  })
})
