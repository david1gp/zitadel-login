import { cleanup, fireEvent, render, screen } from "@solidjs/testing-library"
import { afterEach, describe, expect, test, vi } from "vitest"

import { RecentAccountChooser } from "../client/src/session/ui/RecentAccountChooser"

afterEach(() => {
  cleanup()
})

describe("RecentAccountChooser component tests", () => {
  test("renders recent accounts with avatars and fallback initials", () => {
    const selectAccount = vi.fn()
    const accounts = [
      {
        id: "acc_1",
        label: "Alice Smith",
        avatarUrl: "https://example.com/avatar.png",
        lastUsedAt: 1000,
        reauthenticationRequired: false,
      },
      {
        id: "acc_2",
        label: "Bob Jones",
        lastUsedAt: 2000,
        reauthenticationRequired: true,
      },
    ]

    const view = render(() => (
      <RecentAccountChooser accounts={() => accounts} selectAccount={selectAccount} busy={() => false} />
    ))

    expect(screen.getByText("Recent accounts")).toBeTruthy()
    expect(screen.getByText("Alice Smith")).toBeTruthy()
    expect(screen.getByText("Bob Jones")).toBeTruthy()
    expect(screen.getByText("Reauthentication required")).toBeTruthy()

    const img = view.container.querySelector("img")
    expect(img?.getAttribute("src")).toBe("https://example.com/avatar.png")

    expect(screen.getByText("BJ")).toBeTruthy()
  })

  test("falls back to initials when avatar image fails to load", async () => {
    const selectAccount = vi.fn()
    const accounts = [
      {
        id: "acc_1",
        label: "Alice Smith",
        avatarUrl: "https://example.com/broken.png",
        lastUsedAt: 1000,
        reauthenticationRequired: false,
      },
    ]

    const view = render(() => (
      <RecentAccountChooser accounts={() => accounts} selectAccount={selectAccount} busy={() => false} />
    ))

    const img = view.container.querySelector("img")
    expect(img).toBeTruthy()
    if (img) fireEvent.error(img)

    expect(screen.getByText("AS")).toBeTruthy()
  })

  test("invokes selectAccount on button click", () => {
    const selectAccount = vi.fn()
    const accounts = [
      {
        id: "acc_1",
        label: "Alice Smith",
        lastUsedAt: 1000,
        reauthenticationRequired: false,
      },
    ]

    render(() => <RecentAccountChooser accounts={() => accounts} selectAccount={selectAccount} busy={() => false} />)

    fireEvent.click(screen.getByRole("button", { name: /Alice Smith/ }))
    expect(selectAccount).toHaveBeenCalledWith("acc_1")
  })
})
