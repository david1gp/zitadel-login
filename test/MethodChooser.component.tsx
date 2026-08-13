import { cleanup, fireEvent, render, screen } from "@solidjs/testing-library"
import { afterEach, describe, expect, test } from "vitest"

import { MethodChooser } from "../client/src/flow/ui/MethodChooser"

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
})
