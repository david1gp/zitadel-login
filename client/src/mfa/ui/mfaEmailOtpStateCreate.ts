import { onCleanup } from "solid-js"

import { createSignalObject } from "../../ui/createSignalObject"
import { mfaV2EmailOtpChallengeApiRequest } from "../api/mfaV2EmailOtpChallengeApiRequest"
import { mfaV2EmailOtpEnrollApiRequest } from "../api/mfaV2EmailOtpEnrollApiRequest"
import { mfaV2EmailOtpResendApiRequest } from "../api/mfaV2EmailOtpResendApiRequest"
import { mfaV2EmailOtpVerifyApiRequest } from "../api/mfaV2EmailOtpVerifyApiRequest"

type Inputs = {
  apiOrigin: () => string
  flowHandle: () => string
  csrfToken: () => string
  csrfTokenSet: (token: string) => void
  busy: () => boolean
  busySet: (value: boolean) => void
  errorClear: () => void
  failureSet: (message: string) => void
  fallbackContinue: (path?: string) => void
  statusContinue: (url: string) => void
  optionsReload?: () => Promise<void>
  showChooser?: () => void
  showRootChooser: () => void
  fetchFn?: typeof fetch
  isEnrollment?: boolean
  codePending?: boolean
}

export function mfaEmailOtpStateCreate(inputs: Inputs) {
  const initialStage = inputs.codePending ? "code" : inputs.isEnrollment ? "enroll" : "send"
  const stage = createSignalObject<"send" | "enroll" | "code">(initialStage)
  const code = createSignalObject("")
  const notice = createSignalObject("")
  const countdown = createSignalObject(0)

  let codeInputElement: HTMLInputElement | undefined
  let timerId: ReturnType<typeof setInterval> | undefined
  let inFlight = false
  let disposed = false

  const focusSchedule = () => queueMicrotask(() => codeInputElement?.focus())

  const countdownStop = () => {
    if (timerId !== undefined) {
      clearInterval(timerId)
      timerId = undefined
    }
  }

  const countdownStart = (seconds = 30) => {
    countdownStop()
    countdown.set(seconds)
    timerId = setInterval(() => {
      const next = countdown.get() - 1
      if (next <= 0) {
        countdown.set(0)
        countdownStop()
      } else {
        countdown.set(next)
      }
    }, 1000)
  }

  onCleanup(() => {
    disposed = true
    countdownStop()
    code.set("")
  })

  const enroll = async () => {
    if (inFlight || inputs.busy()) return
    inFlight = true
    inputs.errorClear()
    inputs.busySet(true)

    const res = await mfaV2EmailOtpEnrollApiRequest(
      inputs.apiOrigin(),
      inputs.flowHandle(),
      { csrfToken: inputs.csrfToken() },
      inputs.fetchFn,
    )
    inputs.busySet(false)
    inFlight = false
    if (disposed) return

    if (!res.success) {
      inputs.failureSet(res.errorMessage)
      return
    }

    const transition = res.data
    if (transition.kind === "fallback") {
      inputs.fallbackContinue(transition.path)
      return
    }
    if (transition.kind === "complete") {
      inputs.statusContinue(transition.path)
      return
    }

    inputs.csrfTokenSet(transition.csrfToken)
    stage.set("code")
    const challengeIssued = transition.screen.name === "mfa_email_otp_code" && transition.screen.challengeIssued
    notice.set(
      challengeIssued
        ? "Email codes are set up. Enter the code sent to your email address, or resend it."
        : "Email codes are set up. Resend a code to continue.",
    )
    if (challengeIssued) countdownStart(30)
    focusSchedule()
  }

  const sendCode = async () => {
    if (inputs.busy()) return
    inputs.errorClear()
    inputs.busySet(true)

    const res = await mfaV2EmailOtpChallengeApiRequest(
      inputs.apiOrigin(),
      inputs.flowHandle(),
      { csrfToken: inputs.csrfToken() },
      inputs.fetchFn,
    )
    inputs.busySet(false)

    if (!res.success) {
      inputs.failureSet(res.errorMessage)
      return
    }

    const transition = res.data
    if (transition.kind === "fallback") {
      inputs.fallbackContinue(transition.path)
      return
    }
    if (transition.kind === "complete") {
      inputs.statusContinue(transition.path)
      return
    }
    if (transition.kind === "render") {
      inputs.csrfTokenSet(transition.csrfToken)
    }

    stage.set("code")
    notice.set("Verification code sent to your email address.")
    countdownStart(30)
    focusSchedule()
  }

  const resendCode = async () => {
    if (inputs.busy() || countdown.get() > 0) return
    inputs.errorClear()
    code.set("")
    inputs.busySet(true)

    const res = await mfaV2EmailOtpResendApiRequest(
      inputs.apiOrigin(),
      inputs.flowHandle(),
      { csrfToken: inputs.csrfToken() },
      inputs.fetchFn,
    )
    inputs.busySet(false)

    if (!res.success) {
      inputs.failureSet(res.errorMessage)
      focusSchedule()
      return
    }

    const transition = res.data
    if (transition.kind === "fallback") {
      inputs.fallbackContinue(transition.path)
      return
    }
    if (transition.kind === "complete") {
      inputs.statusContinue(transition.path)
      return
    }
    if (transition.kind === "render") {
      inputs.csrfTokenSet(transition.csrfToken)
    }

    notice.set("A new verification code was sent to your email address.")
    countdownStart(30)
    focusSchedule()
  }

  const codeInputClean = (raw: string): string => {
    return raw.replace(/[^A-Za-z0-9-]/g, "").slice(0, 20)
  }

  const submit = async (event: SubmitEvent) => {
    event.preventDefault()
    inputs.errorClear()

    const rawCode = code.get()
    if (rawCode.length < 6 || rawCode.length > 20) {
      inputs.failureSet("Enter the complete verification code (6 to 20 digits).")
      focusSchedule()
      return
    }

    inputs.busySet(true)
    code.set("")

    const res = await mfaV2EmailOtpVerifyApiRequest(
      inputs.apiOrigin(),
      inputs.flowHandle(),
      { code: rawCode, csrfToken: inputs.csrfToken() },
      inputs.fetchFn,
    )
    inputs.busySet(false)

    if (!res.success) {
      inputs.failureSet(res.errorMessage)
      focusSchedule()
      return
    }

    const transition = res.data
    if (transition.kind === "complete") {
      inputs.statusContinue(transition.path)
      return
    }

    if (transition.kind === "fallback") {
      inputs.fallbackContinue(transition.path)
      return
    }

    if (transition.kind === "render") {
      inputs.csrfTokenSet(transition.csrfToken)
      if (inputs.optionsReload) {
        await inputs.optionsReload()
      }
    }
  }

  return {
    stage: stage.get,
    code: code.get,
    notice: notice.get,
    countdown: countdown.get,
    valid: () => {
      const len = code.get().length
      return len >= 6 && len <= 20
    },
    enroll,
    sendCode,
    resendCode,
    codeInput: (value: string) => {
      const cleaned = codeInputClean(value)
      code.set(cleaned)
      return cleaned
    },
    codeInputRegister: (element: HTMLInputElement) => {
      codeInputElement = element
    },
    submit,
    reset: () => {
      countdownStop()
      code.set("")
      notice.set("")
      countdown.set(0)
      stage.set(initialStage)
    },
    codeFocus: focusSchedule,
  }
}
