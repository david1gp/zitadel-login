import { createSignalObject } from "../../ui/createSignalObject"

export function mfaOtpCountdownCreate() {
  const countdown = createSignalObject(0)
  let timerId: ReturnType<typeof setInterval> | undefined

  const stop = () => {
    if (timerId !== undefined) {
      clearInterval(timerId)
      timerId = undefined
    }
  }

  const start = (seconds = 30) => {
    stop()
    countdown.set(seconds)
    timerId = setInterval(() => {
      const next = countdown.get() - 1
      if (next <= 0) {
        countdown.set(0)
        stop()
        return
      }
      countdown.set(next)
    }, 1000)
  }

  return {
    get: countdown.get,
    start,
    stop,
    reset: () => {
      stop()
      countdown.set(0)
    },
  }
}
