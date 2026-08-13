import { cleanup, render, screen } from "@solidjs/testing-library"
import { afterEach, describe, expect, test } from "vitest"

import { DemoApp } from "../client/src/demo/ui/DemoApp"

afterEach(() => {
  cleanup()
  history.replaceState(null, "", "/demo")
})

describe("DemoApp scenario metadata", () => {
  test("renders demo legal defaults below the shared login card", () => {
    history.replaceState(null, "", "/demo/chooser")

    const view = render(() => <DemoApp />)

    const card = view.container.querySelector("section[aria-busy]")
    const frame = card?.parentElement
    const theme = view.container.querySelector("div.justify-end")
    const legal = Array.from(view.container.querySelectorAll("p")).find((element) =>
      element.textContent?.includes("By continuing"),
    )
    expect(screen.getByRole("link", { name: "Terms of Service" }).getAttribute("href")).toBe(
      "https://example.com/terms",
    )
    expect(screen.getByRole("link", { name: "Privacy Policy" }).getAttribute("href")).toBe(
      "https://example.com/privacy",
    )
    expect(card).toBeTruthy()
    expect(frame?.firstElementChild).toBe(theme)
    expect(theme?.nextElementSibling).toBe(card)
    expect(card?.nextElementSibling).toBe(legal)
  })

  test("keeps scenario metadata on the directory listing", () => {
    history.replaceState(null, "", "/demo")

    render(() => <DemoApp />)

    expect(screen.getByText("Directory · All screens", { selector: "p" })).toBeTruthy()
    expect(screen.queryByLabelText("Filter screens")).toBeNull()
    expect(screen.queryByPlaceholderText("Search screens")).toBeNull()
    const github = screen.getByRole("link", { name: "GitHub project" })
    expect(github.getAttribute("href")).toBe("https://github.com/david1gp/zitadel-login")
  })

  test("does not render account-not-found metadata above the login screen", () => {
    history.replaceState(null, "", "/demo/idp/account-not-found")

    render(() => <DemoApp />)

    expect(screen.getByRole("heading", { name: "No account linked" })).toBeTruthy()
    expect(screen.getByRole("status").textContent).toContain("No ZITADEL account is linked")
    expect(screen.queryByText("Identity provider · Account not found", { selector: "p" })).toBeNull()
  })
})
