import { cleanup, fireEvent, render, screen } from "@solidjs/testing-library"
import { afterEach, describe, expect, test, vi } from "vitest"

import { PasswordPanel } from "../client/src/password/ui/PasswordPanel"

afterEach(cleanup)

describe("PasswordPanel view component", () => {
  test("renders identifier and password input fields only when MFA is not required", () => {
    let identifier = "alice@example.com"
    let password = "mysecretpassword"
    let showPassword = false

    render(() => (
      <PasswordPanel
        identifier={() => identifier}
        password={() => password}
        showPassword={() => showPassword}
        mfaRequired={() => false}
        busy={() => false}
        valid={() => true}
        rememberIdentifier={() => true}
        headingRegister={() => undefined}
        identifierInputRegister={() => undefined}
        passwordInputRegister={() => undefined}
        identifierInput={(val) => (identifier = val)}
        passwordInput={(val) => (password = val)}
        toggleShowPassword={() => (showPassword = !showPassword)}
        rememberIdentifierChange={() => undefined}
        submit={(e) => e.preventDefault()}
        showChooser={() => undefined}
        passwordRecoveryAvailable={() => false}
        passwordRecoveryStart={() => undefined}
      />
    ))

    expect(screen.getByRole("heading", { name: "Sign in with password" })).toBeTruthy()
    const identifierInput = screen.getByRole("textbox", { name: "Username or email" }) as HTMLInputElement
    expect(identifierInput.value).toBe("alice@example.com")
    expect(identifierInput.getAttribute("autocomplete")).toBe("username")

    const passwordInput = screen.getByLabelText("Password") as HTMLInputElement
    expect(passwordInput.type).toBe("password")
    expect(passwordInput.value).toBe("mysecretpassword")
    expect(passwordInput.getAttribute("autocomplete")).toBe("current-password")

    expect(screen.getByRole("button", { name: "Sign in" })).toBeTruthy()
  })

  test("toggles show/hide password state", () => {
    let showPassword = false

    const view = render(() => (
      <PasswordPanel
        identifier={() => "alice"}
        password={() => "secret"}
        showPassword={() => showPassword}
        mfaRequired={() => false}
        busy={() => false}
        valid={() => true}
        rememberIdentifier={() => false}
        headingRegister={() => undefined}
        identifierInputRegister={() => undefined}
        passwordInputRegister={() => undefined}
        identifierInput={() => undefined}
        passwordInput={() => undefined}
        toggleShowPassword={() => (showPassword = !showPassword)}
        rememberIdentifierChange={() => undefined}
        submit={(e) => e.preventDefault()}
        showChooser={() => undefined}
        passwordRecoveryAvailable={() => false}
        passwordRecoveryStart={() => undefined}
      />
    ))

    const revealBtn = screen.getByRole("button", { name: "Show password" })
    expect((view.container.querySelector("#password") as HTMLInputElement).type).toBe("password")

    fireEvent.click(revealBtn)
    expect(showPassword).toBe(true)
  })

  test("renders MFA-required placeholder explicitly without pretending completion", () => {
    let chooserClicked = false

    render(() => (
      <PasswordPanel
        identifier={() => "alice"}
        password={() => ""}
        showPassword={() => false}
        mfaRequired={() => true}
        busy={() => false}
        valid={() => false}
        rememberIdentifier={() => false}
        headingRegister={() => undefined}
        identifierInputRegister={() => undefined}
        passwordInputRegister={() => undefined}
        identifierInput={() => undefined}
        passwordInput={() => undefined}
        toggleShowPassword={() => undefined}
        rememberIdentifierChange={() => undefined}
        submit={(e) => e.preventDefault()}
        showChooser={() => (chooserClicked = true)}
        passwordRecoveryAvailable={() => false}
        passwordRecoveryStart={() => undefined}
      />
    ))

    expect(screen.getByRole("heading", { name: "2-Step Verification Required" })).toBeTruthy()
    expect(screen.getByText(/Multi-factor authentication \(MFA\) is required/i)).toBeTruthy()
    expect(screen.queryByLabelText("Password")).toBeNull()

    fireEvent.click(screen.getByRole("button", { name: "Back to methods" }))
    expect(chooserClicked).toBe(true)
  })
})

describe("PasswordPanel password recovery entry", () => {
  test("hides the recovery action when the capability is not permitted", () => {
    render(() => (
      <PasswordPanel
        identifier={() => "alice"}
        password={() => ""}
        showPassword={() => false}
        mfaRequired={() => false}
        busy={() => false}
        valid={() => false}
        rememberIdentifier={() => false}
        headingRegister={() => undefined}
        identifierInputRegister={() => undefined}
        passwordInputRegister={() => undefined}
        identifierInput={() => undefined}
        passwordInput={() => undefined}
        toggleShowPassword={() => undefined}
        rememberIdentifierChange={() => undefined}
        submit={(e) => e.preventDefault()}
        showChooser={() => undefined}
        passwordRecoveryAvailable={() => false}
        passwordRecoveryStart={() => undefined}
      />
    ))

    expect(screen.queryByRole("button", { name: "Forgot password?" })).toBeNull()
  })

  test("shows the recovery action only when permitted and starts standalone recovery", () => {
    let started = 0

    render(() => (
      <PasswordPanel
        identifier={() => "alice"}
        password={() => ""}
        showPassword={() => false}
        mfaRequired={() => false}
        busy={() => false}
        valid={() => false}
        rememberIdentifier={() => false}
        headingRegister={() => undefined}
        identifierInputRegister={() => undefined}
        passwordInputRegister={() => undefined}
        identifierInput={() => undefined}
        passwordInput={() => undefined}
        toggleShowPassword={() => undefined}
        rememberIdentifierChange={() => undefined}
        submit={(e) => e.preventDefault()}
        showChooser={() => undefined}
        passwordRecoveryAvailable={() => true}
        passwordRecoveryStart={() => (started += 1)}
      />
    ))

    fireEvent.click(screen.getByRole("button", { name: "Forgot password?" }))
    expect(started).toBe(1)
  })
})
