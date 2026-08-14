import { describe, expect, test } from "bun:test"

import { lastUsedLoginMethodCandidateKey } from "../client/src/preferences/model/lastUsedLoginMethodCandidateKey"
import { lastUsedLoginMethodCandidateLoad } from "../client/src/preferences/model/lastUsedLoginMethodCandidateLoad"
import { lastUsedLoginMethodCandidateSave } from "../client/src/preferences/model/lastUsedLoginMethodCandidateSave"
import { lastUsedLoginMethodLoad } from "../client/src/preferences/model/lastUsedLoginMethodLoad"
import { lastUsedLoginMethodPromote } from "../client/src/preferences/model/lastUsedLoginMethodPromote"
import { lastUsedLoginMethodSave } from "../client/src/preferences/model/lastUsedLoginMethodSave"

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

describe("last-used login method persistence", () => {
  test("round-trips separate primary and MFA methods by organization", () => {
    const storage = storageCreate()
    const methods = {
      version: 1 as const,
      primary: { method: "identity_provider" as const, identityProviderId: "github-1" },
      mfa: "totp" as const,
    }

    expect(lastUsedLoginMethodSave(storage, "org-1", methods).success).toBe(true)
    expect(lastUsedLoginMethodLoad(storage, "org-1")).toEqual({ success: true, data: methods })
    expect(lastUsedLoginMethodLoad(storage, "org-2")).toEqual({ success: true, data: undefined })
  })

  test("supports records with only one remembered method", () => {
    const storage = storageCreate()

    expect(lastUsedLoginMethodSave(storage, "org-1", { version: 1, primary: { method: "password" } }).success).toBe(
      true,
    )
    expect(lastUsedLoginMethodLoad(storage, "org-1")).toEqual({
      success: true,
      data: { version: 1, primary: { method: "password" } },
    })
    expect(lastUsedLoginMethodSave(storage, "org-2", { version: 1, mfa: "passkey" }).success).toBe(true)
    expect(lastUsedLoginMethodLoad(storage, "org-2")).toEqual({
      success: true,
      data: { version: 1, mfa: "passkey" },
    })
  })

  test("keeps a flow candidate in session storage and verifies its organization", () => {
    const sessionStorage = storageCreate()
    const localStorage = storageCreate()
    const primary = { method: "identity_provider" as const, identityProviderId: "github-exact-42" }

    expect(lastUsedLoginMethodCandidateSave(sessionStorage, "flow-1", "org-1", primary).success).toBe(true)
    expect(lastUsedLoginMethodCandidateLoad(sessionStorage, "flow-1", "org-1")).toEqual({
      success: true,
      data: primary,
    })
    expect(lastUsedLoginMethodCandidateLoad(sessionStorage, "flow-1", "org-2")).toEqual({
      success: true,
      data: undefined,
    })
    expect(sessionStorage.getItem(lastUsedLoginMethodCandidateKey("flow-1"))).toBeNull()
    expect(lastUsedLoginMethodLoad(localStorage, "org-1")).toEqual({ success: true, data: undefined })
  })

  test("removes malformed flow candidates safely", () => {
    const key = lastUsedLoginMethodCandidateKey("flow-1")
    const storage = storageCreate({ [key]: JSON.stringify({ version: 1, organizationId: "org-1" }) })

    expect(lastUsedLoginMethodCandidateLoad(storage, "flow-1", "org-1").success).toBe(false)
    expect(storage.getItem(key)).toBeNull()
  })

  test("removes malformed state without throwing", () => {
    const key = "zitadel-login:last-used-method:v1:org-1"
    const storage = storageCreate({ [key]: JSON.stringify({ version: 1, primary: { method: "unknown" } }) })

    expect(lastUsedLoginMethodLoad(storage, "org-1").success).toBe(false)
    expect(storage.getItem(key)).toBeNull()
  })

  test("treats missing, denied, and unavailable storage safely", () => {
    const denied = storageCreate()
    denied.getItem = () => {
      throw new DOMException("denied")
    }
    denied.setItem = () => {
      throw new DOMException("denied")
    }

    expect(lastUsedLoginMethodLoad(undefined, "org-1")).toEqual({ success: true, data: undefined })
    expect(lastUsedLoginMethodSave(undefined, "org-1", { version: 1, mfa: "totp" })).toEqual({
      success: true,
      data: undefined,
    })
    expect(lastUsedLoginMethodLoad(denied, "org-1").success).toBe(false)
    expect(lastUsedLoginMethodSave(denied, "org-1", { version: 1, mfa: "totp" }).success).toBe(false)
    expect(lastUsedLoginMethodCandidateLoad(denied, "flow-1", "org-1").success).toBe(false)
    expect(lastUsedLoginMethodCandidateSave(denied, "flow-1", "org-1", { method: "password" }).success).toBe(false)
  })

  test("preserves the flow candidate when loading storage throws", () => {
    const sessionStorage = storageCreate()
    const localStorage = storageCreate()
    const primary = { method: "password" as const }
    lastUsedLoginMethodCandidateSave(sessionStorage, "flow-1", "org-1", primary)
    const getItem = sessionStorage.getItem
    let unavailable = true
    sessionStorage.getItem = (key) => {
      if (unavailable) throw new DOMException("denied")
      return getItem(key)
    }

    expect(lastUsedLoginMethodPromote(localStorage, sessionStorage, "flow-1", "org-1", { version: 1 }).success).toBe(
      false,
    )

    unavailable = false
    expect(lastUsedLoginMethodCandidateLoad(sessionStorage, "flow-1", "org-1")).toEqual({
      success: true,
      data: primary,
    })
  })

  test("preserves the flow candidate when saving is unavailable or throws", () => {
    const sessionStorage = storageCreate()
    const primary = { method: "password" as const }
    lastUsedLoginMethodCandidateSave(sessionStorage, "flow-1", "org-1", primary)

    expect(lastUsedLoginMethodPromote(undefined, sessionStorage, "flow-1", "org-1", { version: 1 })).toEqual({
      success: true,
      data: { version: 1, primary },
    })
    expect(lastUsedLoginMethodCandidateLoad(sessionStorage, "flow-1", "org-1")).toEqual({
      success: true,
      data: primary,
    })

    const localStorage = storageCreate()
    localStorage.setItem = () => {
      throw new DOMException("denied")
    }
    expect(lastUsedLoginMethodPromote(localStorage, sessionStorage, "flow-1", "org-1", { version: 1 }).success).toBe(
      false,
    )
    expect(lastUsedLoginMethodCandidateLoad(sessionStorage, "flow-1", "org-1")).toEqual({
      success: true,
      data: primary,
    })
  })

  test("clears the flow candidate after successful persistence", () => {
    const sessionStorage = storageCreate()
    const localStorage = storageCreate()
    lastUsedLoginMethodCandidateSave(sessionStorage, "flow-1", "org-1", { method: "password" })

    expect(lastUsedLoginMethodPromote(localStorage, sessionStorage, "flow-1", "org-1", { version: 1 }).success).toBe(
      true,
    )
    expect(sessionStorage.getItem(lastUsedLoginMethodCandidateKey("flow-1"))).toBeNull()
  })
})
