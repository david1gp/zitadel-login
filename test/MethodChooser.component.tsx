import { cleanup, fireEvent, render, screen } from "@solidjs/testing-library"
import { afterEach, describe, expect, test } from "vitest"

import { MethodChooser } from "../client/src/flow/ui/MethodChooser"
import { classesMethodButtonLastUsed } from "../client/src/ui/classes/classesMethodButtonLastUsed"
import { classesMethodLastUsedBadge } from "../client/src/ui/classes/classesMethodLastUsedBadge"

afterEach(cleanup)

describe("method chooser view", () => {
  test("renders enabled methods without credential inputs and supports selection", () => {
    let selected = ""
    const view = render(() => (
      <MethodChooser
        methods={() => [
          { selection: { method: "email_otp" }, label: "Email code", detail: "Receive a one-time code" },
          {
            selection: { method: "identity_provider", identityProviderId: "github-1" },
            label: "GitHub",
          },
        ]}
        select={(selection) => (selected = selection.method)}
        headingRegister={() => undefined}
      />
    ))

    expect(screen.getByRole("heading", { name: "Choose a method" })).toBeTruthy()
    expect(screen.getAllByRole("heading", { level: 1 })).toHaveLength(1)
    expect(screen.queryByText("Sign in")).toBeNull()
    expect(screen.getByText("Receive a one-time code")).toBeTruthy()
    expect(view.container.querySelector("input")).toBeNull()
    const providerButton = screen.getByRole("button", { name: "GitHub" })
    expect(providerButton.querySelector("small")).toBeNull()
    fireEvent.click(providerButton)
    expect(selected).toBe("identity_provider")
  })

  test("highlights only the exact remembered identity provider", () => {
    render(() => (
      <MethodChooser
        methods={() => [
          { selection: { method: "identity_provider", identityProviderId: "github-1" }, label: "GitHub" },
          { selection: { method: "identity_provider", identityProviderId: "google-1" }, label: "Google" },
        ]}
        lastUsedPrimary={() => ({ method: "identity_provider", identityProviderId: "google-1" })}
        select={() => undefined}
        headingRegister={() => undefined}
      />
    ))

    const github = screen.getByRole("button", { name: "GitHub" })
    const google = screen.getByRole("button", { name: "Google Last used" })
    expect(github.className).not.toContain(classesMethodButtonLastUsed)
    expect(google.className).toContain(classesMethodButtonLastUsed)
    expect(screen.getByText("Last used").className).toBe(classesMethodLastUsedBadge)
  })

  test("highlights a matching non-provider primary method", () => {
    render(() => (
      <MethodChooser
        methods={() => [
          { selection: { method: "email_otp" }, label: "Email code" },
          { selection: { method: "password" }, label: "Password" },
        ]}
        lastUsedPrimary={() => ({ method: "password" })}
        select={() => undefined}
        headingRegister={() => undefined}
      />
    ))

    expect(screen.getByRole("button", { name: "Email code" }).className).not.toContain(classesMethodButtonLastUsed)
    expect(screen.getByRole("button", { name: "Password Last used" }).className).toContain(classesMethodButtonLastUsed)
  })

  test("does not highlight a remembered method that is unavailable", () => {
    render(() => (
      <MethodChooser
        methods={() => [{ selection: { method: "email_otp" }, label: "Email code" }]}
        lastUsedPrimary={() => ({ method: "password" })}
        select={() => undefined}
        headingRegister={() => undefined}
      />
    ))

    expect(screen.queryByText("Last used")).toBeNull()
    expect(screen.getByRole("button", { name: "Email code" }).className).not.toContain(classesMethodButtonLastUsed)
  })
})
