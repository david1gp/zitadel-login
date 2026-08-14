import { onCleanup, onMount } from "solid-js"

import { emailOtpCooldownApiRequest } from "../../email-otp/api/emailOtpCooldownApiRequest"
import { emailOtpCooldownCreate } from "../../email-otp/model/emailOtpCooldownCreate"
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
  lastUsedSave?: () => void
  statusContinue: (url: string) => void
  optionsReload?: () => Promise<void>
  showChooser?: () => void
  showRootChooser: () => void
  fetchFn?: typeof fetch
  isEnrollment?: boolean
  codePending?: boolean
  storage?: Storage
}

export function mfaEmailOtpStateCreate(inputs: Inputs) {
  const initialStage = inputs.codePending ? "code" : inputs.isEnrollment ? "enroll" : "send"
  const stage = createSignalObject<"send" | "enroll" | "code">(initialStage)
  const code = createSignalObject("")
  const notice = createSignalObject("")
  const cooldown = emailOtpCooldownCreate({
    storageKey: "zitadel-login.mfa-email-otp.cooldown-expires-at",
    storage: inputs.storage,
  })

  let codeInputElement: HTMLInputElement | undefined
  let inFlight = false
  let disposed = false

  const focusSchedule = () => queueMicrotask(() => codeInputElement?.focus())
  const cooldownReconcile = async () => {
    cooldown.reconciliationStart()
    const result = await emailOtpCooldownApiRequest(inputs.apiOrigin(), inputs.flowHandle(), "mfa", inputs.fetchFn)
    if (disposed) return
    if (result.success) cooldown.reconcile(result.data)
  }

  onMount(() => {
    if (stage.get() === "code") void cooldownReconcile()
  })

  onCleanup(() => {
    disposed = true
    cooldown.stop()
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
    void cooldownReconcile()
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
    void cooldownReconcile()
    focusSchedule()
  }

  const resendCode = async () => {
    if (inputs.busy() || !cooldown.resendAllowed()) return
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
    if (res.cooldownExpiresAt !== undefined) cooldown.reconcile(res.cooldownExpiresAt)
    else void cooldownReconcile()

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
      if (!inputs.isEnrollment) inputs.lastUsedSave?.()
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
    countdown: cooldown.remainingSeconds,
    resendAllowed: cooldown.resendAllowed,
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
      code.set("")
      notice.set("")
      stage.set(initialStage)
    },
    codeFocus: focusSchedule,
  }
}
