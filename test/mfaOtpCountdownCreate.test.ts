import { describe, expect, test, vi } from "vitest"

import { mfaOtpCountdownCreate } from "../client/src/mfa/model/mfaOtpCountdownCreate"

describe("mfaOtpCountdownCreate", () => {
  test("counts down and stops at zero", () => {
    vi.useFakeTimers()
    const countdown = mfaOtpCountdownCreate()

    countdown.start(2)
    expect(countdown.get()).toBe(2)

    vi.advanceTimersByTime(1000)
    expect(countdown.get()).toBe(1)

    vi.advanceTimersByTime(1000)
    expect(countdown.get()).toBe(0)

    vi.advanceTimersByTime(1000)
    expect(countdown.get()).toBe(0)
    vi.useRealTimers()
  })

  test("reset clears the active countdown", () => {
    vi.useFakeTimers()
    const countdown = mfaOtpCountdownCreate()

    countdown.start(30)
    countdown.reset()
    vi.advanceTimersByTime(1000)

    expect(countdown.get()).toBe(0)
    vi.useRealTimers()
  })
})
