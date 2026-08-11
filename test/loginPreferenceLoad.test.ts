import { describe, expect, test } from "bun:test"

import { browserStorageGet } from "../client/src/preferences/model/browserStorageGet"
import { loginPreferenceLoad } from "../client/src/preferences/model/loginPreferenceLoad"
import { loginPreferenceSave } from "../client/src/preferences/model/loginPreferenceSave"
import { themePreferenceLoad } from "../client/src/preferences/model/themePreferenceLoad"
import { themePreferenceSave } from "../client/src/preferences/model/themePreferenceSave"

function storageCreate(initial: Record<string, string> = {}): Storage {
  const values = new Map(Object.entries(initial))
  return {
    get length() {
      return values.size
    },
    clear: () => values.clear(),
    getItem: (key) => values.get(key) ?? null,
    key: (index) => [...values.keys()][index] ?? null,
    removeItem: (key) => values.delete(key),
    setItem: (key, value) => values.set(key, value),
  }
}

describe("validated browser preferences", () => {
  test("stores only the bounded login preference projection", () => {
    const storage = storageCreate()
    const preference = {
      version: 1 as const,
      selectedMethod: "password" as const,
      rememberIdentifier: true,
      identifier: "person@example.com",
      updatedAt: Date.now(),
    }
    expect(loginPreferenceSave(storage, "org-1", preference).success).toBe(true)
    expect(loginPreferenceLoad(storage, "org-1")).toEqual({ success: true, data: preference })
    expect(storage.getItem("zitadel-login:preference:v1:org-1")).not.toContain('password":')
  })

  test("removes malformed theme state", () => {
    const storage = storageCreate({ "zitadel-login:theme:v1": JSON.stringify({ value: "midnight", token: "x" }) })
    expect(themePreferenceLoad(storage).success).toBe(false)
    expect(storage.getItem("zitadel-login:theme:v1")).toBeNull()
  })

  test("retains method consent while expiring only the remembered identifier", () => {
    const key = "zitadel-login:preference:v1:org-1"
    const storage = storageCreate({
      [key]: JSON.stringify({
        version: 1,
        selectedMethod: "email_otp",
        rememberIdentifier: true,
        identifier: "person@example.com",
        updatedAt: Date.now() - 181 * 24 * 60 * 60 * 1000,
      }),
    })

    const loaded = loginPreferenceLoad(storage, "org-1")
    expect(loaded.success).toBe(true)
    if (!loaded.success) return
    expect(loaded.data).toEqual(expect.objectContaining({ selectedMethod: "email_otp", rememberIdentifier: true }))
    expect(loaded.data).not.toHaveProperty("identifier")
    expect(storage.getItem(key)).not.toContain("person@example.com")
  })

  test("rejects unrelated provider state and tolerates denied storage", () => {
    const invalid = storageCreate({
      "zitadel-login:preference:v1:org-1": JSON.stringify({
        version: 1,
        selectedMethod: "password",
        identityProviderId: "github-1",
        rememberIdentifier: false,
        updatedAt: Date.now(),
      }),
    })
    const denied = storageCreate()
    denied.getItem = () => {
      throw new DOMException("denied")
    }
    denied.setItem = () => {
      throw new DOMException("denied")
    }

    expect(loginPreferenceLoad(invalid, "org-1").success).toBe(false)
    expect(loginPreferenceLoad(denied, "org-1").success).toBe(false)
    expect(themePreferenceSave(denied, { value: "system", updatedAt: 1 }).success).toBe(false)
  })

  test("round-trips every explicit theme preference", () => {
    const storage = storageCreate()
    for (const value of ["light", "dark", "system"] as const) {
      expect(themePreferenceSave(storage, { value, updatedAt: 1 }).success).toBe(true)
      expect(themePreferenceLoad(storage)).toEqual({ success: true, data: { value, updatedAt: 1 } })
    }
  })

  test("treats a denied localStorage getter as unavailable", () => {
    const browserWindow = Object.create(null, {
      localStorage: {
        get: () => {
          throw new DOMException("denied")
        },
      },
    }) as Window
    expect(browserStorageGet(browserWindow).success).toBe(false)
  })
})
