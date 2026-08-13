import { onCleanup, onMount } from "solid-js"

import { createSignalObject } from "../../ui/createSignalObject"
import { mfaV2SmsOtpChallengeApiRequest } from "../api/mfaV2SmsOtpChallengeApiRequest"
import { mfaV2SmsOtpResendApiRequest } from "../api/mfaV2SmsOtpResendApiRequest"
import { mfaV2SmsOtpVerifyApiRequest } from "../api/mfaV2SmsOtpVerifyApiRequest"
import { mfaOtpCountdownCreate } from "../model/mfaOtpCountdownCreate"

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
}

export function mfaSmsOtpStateCreate(inputs: Inputs) {
  const stage = createSignalObject<"send" | "code">("send")
  const code = createSignalObject("")
  const notice = createSignalObject("")
  const countdown = mfaOtpCountdownCreate()

  let codeInputElement: HTMLInputElement | undefined

  const focusSchedule = () => queueMicrotask(() => codeInputElement?.focus())

  onMount(() => {
    // Starts in stage "send"
  })

  onCleanup(() => {
    countdown.stop()
    code.set("")
  })

  const sendCode = async () => {
    if (inputs.busy()) return
    inputs.errorClear()
    inputs.busySet(true)

    const res = await mfaV2SmsOtpChallengeApiRequest(
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
    notice.set("Verification code sent to your mobile phone via SMS.")
    countdown.start(30)
    focusSchedule()
  }

  const resendCode = async () => {
    if (inputs.busy() || countdown.get() > 0) return
    inputs.errorClear()
    code.set("")
    inputs.busySet(true)

    const res = await mfaV2SmsOtpResendApiRequest(
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

    notice.set("A new verification code was sent to your mobile phone via SMS.")
    countdown.start(30)
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

    const res = await mfaV2SmsOtpVerifyApiRequest(
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

  const reset = () => {
    countdown.reset()
    code.set("")
    notice.set("")
    stage.set("send")
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
    reset,
    codeFocus: focusSchedule,
  }
}
