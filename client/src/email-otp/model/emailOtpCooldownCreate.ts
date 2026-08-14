import * as v from "valibot"

import { createSignalObject } from "../../ui/createSignalObject"

const expirySchema = v.pipe(v.number(), v.integer(), v.minValue(0))

export function emailOtpCooldownCreate(input: { storageKey: string; storage?: Storage; now?: () => number }) {
  const now = input.now ?? Date.now
  const storage =
    input.storage ??
    (() => {
      try {
        return window.localStorage
      } catch {
        return undefined
      }
    })()
  const storedExpiry = (() => {
    try {
      const raw = storage?.getItem(input.storageKey)
      if (raw === null || raw === undefined) return 0
      const parsed = v.safeParse(expirySchema, Number(raw))
      return parsed.success ? parsed.output : 0
    } catch {
      return 0
    }
  })()
  const expiry = createSignalObject(storedExpiry)
  const remainingSeconds = createSignalObject(Math.max(0, Math.ceil(storedExpiry - now() / 1000)))
  const reconciled = createSignalObject(false)
  let timerId: ReturnType<typeof setTimeout> | undefined

  const storageRemove = () => {
    try {
      storage?.removeItem(input.storageKey)
    } catch {
      // Storage is optional display continuity; server reconciliation still controls resend.
    }
  }
  const update = () => {
    const remaining = Math.max(0, Math.ceil(expiry.get() - now() / 1000))
    remainingSeconds.set(remaining)
    if (remaining > 0) {
      timerId = setTimeout(update, 1000)
      return
    }
    expiry.set(0)
    storageRemove()
    timerId = undefined
  }
  const stop = () => {
    if (timerId === undefined) return
    clearTimeout(timerId)
    timerId = undefined
  }
  const reconcile = (authoritativeExpiry: number) => {
    stop()
    const parsed = v.safeParse(expirySchema, authoritativeExpiry)
    const nextExpiry = parsed.success ? parsed.output : 0
    expiry.set(nextExpiry)
    reconciled.set(true)
    if (nextExpiry > now() / 1000) {
      try {
        storage?.setItem(input.storageKey, String(nextExpiry))
      } catch {
        // Storage is optional display continuity; the in-memory expiry remains authoritative.
      }
    } else {
      storageRemove()
    }
    update()
  }

  if (remainingSeconds.get() > 0) update()
  else storageRemove()

  return {
    expiry: expiry.get,
    remainingSeconds: remainingSeconds.get,
    resendAllowed: () => reconciled.get() && remainingSeconds.get() === 0,
    reconciliationStart: () => reconciled.set(false),
    reconcile,
    stop,
  }
}
