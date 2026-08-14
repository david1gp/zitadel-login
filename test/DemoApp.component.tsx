import { cleanup, render, screen } from "@solidjs/testing-library"
import { afterEach, describe, expect, test, vi } from "vitest"

import { DemoApp } from "../client/src/demo/ui/DemoApp"

afterEach(() => {
  cleanup()
  localStorage.clear()
  vi.useRealTimers()
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

  test("runs the primary resend cooldown from persisted demo state", () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date("2026-08-14T12:00:00Z"))
    const expiry = Math.ceil(Date.now() / 1000) + 42
    localStorage.setItem("zitadel-login.email-otp.cooldown-expires-at", String(expiry))
    history.replaceState(null, "", "/demo/email-otp/code")

    render(() => <DemoApp />)

    const resend = screen.getByRole("button", { name: "Send a new code" }) as HTMLButtonElement
    const countdown = screen.getByText("Another code can be sent in 42 seconds.")
    expect(resend.disabled).toBe(true)
    expect(resend.getAttribute("aria-describedby")).toBe("email-otp-resend-countdown")
    expect(countdown.id).toBe("email-otp-resend-countdown")
    expect(countdown.getAttribute("aria-live")).toBe("polite")
    expect(countdown.getAttribute("aria-atomic")).toBe("true")
    expect(localStorage.getItem("zitadel-login.email-otp.cooldown-expires-at")).toBe(String(expiry))

    vi.advanceTimersByTime(1_000)
    expect(screen.getByText("Another code can be sent in 41 seconds.")).toBeTruthy()
  })
})
