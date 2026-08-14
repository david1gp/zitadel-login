import { describe, expect, test, vi } from "vitest"

import { emailOtpCooldownCreate } from "../client/src/email-otp/model/emailOtpCooldownCreate"

describe("emailOtpCooldownCreate", () => {
  test("persists only the expiry, requires server reconciliation, and removes it on expiry", () => {
    vi.useFakeTimers()
    let now = 1_800_000_000_000
    const storage = new Map<string, string>()
    const storageAdapter = {
      getItem: (key: string) => storage.get(key) ?? null,
      setItem: (key: string, value: string) => storage.set(key, value),
      removeItem: (key: string) => storage.delete(key),
    } as unknown as Storage
    const cooldown = emailOtpCooldownCreate({ storageKey: "cooldown", storage: storageAdapter, now: () => now })

    expect(cooldown.resendAllowed()).toBe(false)
    cooldown.reconcile(1_800_000_002)
    expect(storage.get("cooldown")).toBe("1800000002")
    expect(cooldown.remainingSeconds()).toBe(2)
    expect(cooldown.resendAllowed()).toBe(false)

    now += 2_000
    vi.advanceTimersByTime(2_000)
    expect(cooldown.remainingSeconds()).toBe(0)
    expect(cooldown.resendAllowed()).toBe(true)
    expect(storage.has("cooldown")).toBe(false)
    cooldown.stop()
    vi.useRealTimers()
  })

  test("cached expiry never authorizes resend before reconciliation", () => {
    const storage = {
      getItem: () => "0",
      setItem: vi.fn(),
      removeItem: vi.fn(),
    } as unknown as Storage
    const cooldown = emailOtpCooldownCreate({ storageKey: "cooldown", storage })

    expect(cooldown.remainingSeconds()).toBe(0)
    expect(cooldown.resendAllowed()).toBe(false)
    cooldown.reconcile(0)
    expect(cooldown.resendAllowed()).toBe(true)
  })

  test("recreates an active countdown from localStorage across remount", () => {
    vi.useFakeTimers()
    try {
      let currentNow = 1_800_000_000_000
      const storage = new Map<string, string>()
      const storageAdapter = {
        getItem: (key: string) => storage.get(key) ?? null,
        setItem: (key: string, value: string) => storage.set(key, value),
        removeItem: (key: string) => storage.delete(key),
      } as unknown as Storage
      const expiresAt = currentNow / 1000 + 60

      const first = emailOtpCooldownCreate({ storageKey: "cooldown", storage: storageAdapter, now: () => currentNow })
      first.reconcile(expiresAt)
      first.stop()

      const remounted = emailOtpCooldownCreate({
        storageKey: "cooldown",
        storage: storageAdapter,
        now: () => currentNow,
      })
      expect(remounted.remainingSeconds()).toBe(60)
      expect(remounted.resendAllowed()).toBe(false)

      remounted.reconcile(expiresAt)
      currentNow += 60_000
      vi.advanceTimersByTime(60_000)
      expect(remounted.remainingSeconds()).toBe(0)
      expect(remounted.resendAllowed()).toBe(true)
      remounted.stop()
    } finally {
      vi.useRealTimers()
    }
  })

  test("cleans expired and malformed stored values", () => {
    const storage = new Map<string, string>()
    const storageAdapter = {
      getItem: (key: string) => storage.get(key) ?? null,
      setItem: (key: string, value: string) => storage.set(key, value),
      removeItem: (key: string) => storage.delete(key),
    } as unknown as Storage
    const now = 1_800_000_000_000

    storage.set("cooldown", String(now / 1000 - 1))
    const expired = emailOtpCooldownCreate({ storageKey: "cooldown", storage: storageAdapter, now: () => now })
    expect(expired.remainingSeconds()).toBe(0)
    expect(storage.has("cooldown")).toBe(false)
    expired.stop()

    storage.set("cooldown", "not-a-number")
    const malformed = emailOtpCooldownCreate({ storageKey: "cooldown", storage: storageAdapter, now: () => now })
    expect(malformed.remainingSeconds()).toBe(0)
    expect(storage.has("cooldown")).toBe(false)
    malformed.stop()
  })

  test("survives storage access errors without authorizing before server reconciliation", () => {
    const storage = {
      getItem: () => {
        throw new Error("getItem failed")
      },
      setItem: () => {
        throw new Error("setItem failed")
      },
      removeItem: () => {
        throw new Error("removeItem failed")
      },
    } as unknown as Storage
    const cooldown = emailOtpCooldownCreate({ storageKey: "cooldown", storage, now: () => 1_800_000_000_000 })

    expect(cooldown.resendAllowed()).toBe(false)
    expect(() => cooldown.reconcile(1_800_000_060)).not.toThrow()
    expect(cooldown.remainingSeconds()).toBe(60)
    expect(cooldown.resendAllowed()).toBe(false)
    cooldown.stop()
  })

  test("stays fail-closed after reconciliation starts without a server result", () => {
    const cooldown = emailOtpCooldownCreate({ storageKey: "cooldown", storage: new MapStorageFake() })
    cooldown.reconcile(1_800_000_060)
    expect(cooldown.resendAllowed()).toBe(false)
    cooldown.reconciliationStart()
    expect(cooldown.resendAllowed()).toBe(false)
    cooldown.stop()
  })
})

class MapStorageFake implements Storage {
  private readonly values = new Map<string, string>()

  get length() {
    return this.values.size
  }

  clear() {
    this.values.clear()
  }

  getItem(key: string) {
    return this.values.get(key) ?? null
  }

  key(index: number) {
    return [...this.values.keys()][index] ?? null
  }

  removeItem(key: string) {
    this.values.delete(key)
  }

  setItem(key: string, value: string) {
    this.values.set(key, value)
  }
}
