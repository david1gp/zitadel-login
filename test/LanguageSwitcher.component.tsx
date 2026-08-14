import { cleanup, render, screen } from "@solidjs/testing-library"
import { afterEach, beforeEach, expect, test, vi } from "vitest"

import { i18nStore } from "../client/src/i18n/model/i18nStore"
import { languageApply } from "../client/src/i18n/model/languageApply"
import { languagePreferenceKey } from "../client/src/i18n/model/languagePreferenceKey"
import { ttc } from "../client/src/i18n/model/ttc"
import { LanguageSwitcher } from "../client/src/i18n/ui/LanguageSwitcher"

const originalFetch = globalThis.fetch
const germanCsv = "english,de\nLanguage,Sprache\nSign in,Anmelden\n"

beforeEach(() => {
  localStorage.clear()
  globalThis.fetch = vi.fn(async (input: RequestInfo | URL) => {
    if (String(input).endsWith("/i18n/de.csv")) return new Response(germanCsv, { status: 200 })
    return new Response("", { status: 404 })
  }) as typeof fetch
})

afterEach(async () => {
  cleanup()
  globalThis.fetch = originalFetch
  await languageApply("en")
})

test("switches to German reactively, persists the choice and updates the document language", async () => {
  render(() => <LanguageSwitcher />)
  expect(screen.getByText("English")).toBeTruthy()

  screen.getByTestId("language-switcher").querySelector("summary")?.click()
  const german = await screen.findByText("Deutsch")
  german.click()

  await vi.waitFor(() => expect(i18nStore.language.get()).toBe("de"))
  expect(i18nStore.dictionary.get()["Sign in"]).toBe("Anmelden")
  expect(localStorage.getItem(languagePreferenceKey)).toBe("de")
  expect(document.documentElement.lang).toBe("de")
  expect(document.documentElement.dir).toBe("ltr")
  expect(screen.getByTestId("language-switcher").textContent).toContain("Deutsch")
})

test("falls back to English text when the dictionary cannot be loaded", async () => {
  globalThis.fetch = vi.fn(async () => new Response("", { status: 500 })) as typeof fetch
  await languageApply("it")
  expect(i18nStore.language.get()).toBe("it")
  render(() => <LanguageSwitcher />)
  expect(screen.getByTestId("language-switcher").getAttribute("data-testid")).toBe("language-switcher")
  expect(screen.getByLabelText("Language")).toBeTruthy()
})

test("falls back to English text for a malformed dictionary", async () => {
  globalThis.fetch = vi.fn(async () => new Response('english,it\n"Language,lingua\n', { status: 200 })) as typeof fetch
  await languageApply("it")

  expect(i18nStore.dictionary.get()).toEqual({})
  expect(ttc("Sign in")).toBe("Sign in")
})

test("ignores a stale translation response after a newer language request", async () => {
  let germanResponseResolve: ((response: Response) => void) | undefined
  const fetchMock = vi.fn((input: RequestInfo | URL) => {
    if (String(input).endsWith("/i18n/de.csv")) {
      return new Promise<Response>((resolve) => {
        germanResponseResolve = resolve
      })
    }
    return Promise.resolve(new Response("", { status: 404 }))
  })
  globalThis.fetch = fetchMock as typeof fetch

  const germanApply = languageApply("de")
  await vi.waitFor(() => expect(fetchMock).toHaveBeenCalled())
  await languageApply("it")
  germanResponseResolve?.(new Response(germanCsv, { status: 200 }))
  await germanApply

  expect(i18nStore.language.get()).toBe("it")
  expect(i18nStore.dictionary.get()).toEqual({})
  expect(document.documentElement.lang).toBe("it")
})

test("ignores an older response when the same language is requested again", async () => {
  let firstResponseResolve: ((response: Response) => void) | undefined
  let secondResponseResolve: ((response: Response) => void) | undefined
  const fetchMock = vi.fn(() => {
    if (fetchMock.mock.calls.length === 1) {
      return new Promise<Response>((resolve) => {
        firstResponseResolve = resolve
      })
    }
    return new Promise<Response>((resolve) => {
      secondResponseResolve = resolve
    })
  })
  globalThis.fetch = fetchMock as typeof fetch

  const firstApply = languageApply("de")
  await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1))
  const secondApply = languageApply("de")
  await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2))

  secondResponseResolve?.(new Response("english,de\nLanguage,Zweite\n", { status: 200 }))
  await secondApply
  firstResponseResolve?.(new Response("english,de\nLanguage,Erste\n", { status: 200 }))
  await firstApply

  expect(i18nStore.dictionary.get()).toEqual({ Language: "Zweite" })
})

test("closes the switcher with Escape and outside clicks", () => {
  render(() => <LanguageSwitcher />)
  const details = screen.getByTestId("language-switcher") as HTMLDetailsElement
  details.querySelector("summary")?.dispatchEvent(new MouseEvent("click", { bubbles: true }))
  expect(details.open).toBe(true)

  document.dispatchEvent(new KeyboardEvent("keydown", { bubbles: true, key: "Escape" }))
  expect(details.open).toBe(false)

  details.querySelector("summary")?.dispatchEvent(new MouseEvent("click", { bubbles: true }))
  expect(details.open).toBe(true)
  document.body.dispatchEvent(new MouseEvent("click", { bubbles: true }))
  expect(details.open).toBe(false)
})
