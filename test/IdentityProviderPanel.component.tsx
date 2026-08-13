import { cleanup, fireEvent, render, screen } from "@solidjs/testing-library"
import { afterEach, describe, expect, test } from "vitest"

import { IdentityProviderPanel } from "../client/src/identity-provider/ui/IdentityProviderPanel"

afterEach(cleanup)

describe("IdentityProviderPanel view component", () => {
  test("renders provider icon with explicit continue button", () => {
    let submitted = false

    render(() => (
      <IdentityProviderPanel
        providerName={() => "Google"}
        providerType={() => "google"}
        subroute={() => undefined}
        busy={() => false}
        headingRegister={() => undefined}
        submit={(e) => {
          e.preventDefault()
          submitted = true
        }}
        showChooser={() => undefined}
      />
    ))

    expect(screen.getByRole("heading", { name: "Sign in with Google" })).toBeTruthy()
    expect(screen.queryByText("Google", { exact: true })).toBeNull()

    const submitBtn = screen.getByRole("button", { name: "Continue with Google" })
    expect(submitBtn).toBeTruthy()

    fireEvent.click(submitBtn)
    expect(submitted).toBe(true)
  })

  test("renders failure state with retry message and button", () => {
    let submitted = false

    render(() => (
      <IdentityProviderPanel
        providerName={() => "GitHub"}
        providerType={() => "github"}
        subroute={() => "failure"}
        busy={() => false}
        headingRegister={() => undefined}
        submit={(e) => {
          e.preventDefault()
          submitted = true
        }}
        showChooser={() => undefined}
      />
    ))

    expect(screen.getByRole("heading", { name: "Sign in with GitHub" })).toBeTruthy()
    expect(screen.getByText(/Sign in with GitHub was not completed. Please try again./i)).toBeTruthy()

    const retryBtn = screen.getByRole("button", { name: "Try again" })
    expect(retryBtn).toBeTruthy()

    fireEvent.click(retryBtn)
    expect(submitted).toBe(true)
  })

  test("renders unlinked account placeholder state", () => {
    let chooserClicked = false

    render(() => (
      <IdentityProviderPanel
        providerName={() => "Google"}
        providerType={() => "google"}
        subroute={() => "account-not-found"}
        busy={() => false}
        headingRegister={() => undefined}
        submit={(e) => e.preventDefault()}
        showChooser={() => {
          chooserClicked = true
        }}
      />
    ))

    expect(screen.getByRole("heading", { name: "No account linked" })).toBeTruthy()
    expect(screen.getByText(/No ZITADEL account is linked to this Google account/i)).toBeTruthy()
    expect(screen.queryByRole("button", { name: "Continue with Google" })).toBeNull()

    const backBtn = screen.getByRole("button", { name: "Back to methods" })
    expect(backBtn).toBeTruthy()

    fireEvent.click(backBtn)
    expect(chooserClicked).toBe(true)
  })
})
