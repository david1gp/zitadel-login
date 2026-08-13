import { cleanup, render, screen } from "@solidjs/testing-library"
import { afterEach, describe, expect, test } from "vitest"

import { DemoApp } from "../client/src/demo/ui/DemoApp"

afterEach(() => {
  cleanup()
  history.replaceState(null, "", "/demo")
})

describe("DemoApp scenario metadata", () => {
  test("keeps scenario metadata on the directory listing", () => {
    history.replaceState(null, "", "/demo")

    render(() => <DemoApp />)

    expect(screen.getByText("Directory · All screens", { selector: "p" })).toBeTruthy()
  })

  test("does not render account-not-found metadata above the login screen", () => {
    history.replaceState(null, "", "/demo/idp/account-not-found")

    render(() => <DemoApp />)

    expect(screen.getByRole("heading", { name: "No account linked" })).toBeTruthy()
    expect(screen.getByRole("status").textContent).toContain("No ZITADEL account is linked")
    expect(screen.queryByText("Identity provider · Account not found", { selector: "p" })).toBeNull()
  })
})
