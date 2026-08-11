import { createMemo } from "solid-js"

import { loginIdentifierNormalize } from "../../preferences/model/loginIdentifierNormalize"
import type { SignalObject } from "../../ui/SignalObject"
import { createSignalObject } from "../../ui/createSignalObject"
import { emailOtpV2ResendApiRequest } from "../api/emailOtpV2ResendApiRequest"
import { emailOtpV2StartApiRequest } from "../api/emailOtpV2StartApiRequest"
import { emailOtpV2VerifyApiRequest } from "../api/emailOtpV2VerifyApiRequest"

export function emailOtpStateCreate(input: {
  apiOrigin: () => string
  busy: SignalObject<boolean>
  csrfToken: SignalObject<string>
  flowHandle: SignalObject<string>
  errorClear: () => void
  failureSet: (message: string) => void
  fallbackContinue: (path?: string) => void
  notice: SignalObject<string>
  preferenceSave: (identifier: string) => void
  statusContinue: (url: string) => void
}) {
  const step = createSignalObject<"email" | "code">("email")
  const email = createSignalObject("")
  const code = createSignalObject("")
  let emailInput: HTMLInputElement | undefined
  let codeInput: HTMLInputElement | undefined

  const focusSchedule = (element: () => HTMLElement | undefined) => queueMicrotask(() => element()?.focus())
  const resetMessages = () => {
    input.errorClear()
    input.notice.set("")
  }
  const emailSubmit = async (event: SubmitEvent) => {
    event.preventDefault()
    resetMessages()
    if (!emailInput?.checkValidity()) {
      emailInput?.reportValidity()
      return
    }
    const normalized = loginIdentifierNormalize(email.get())
    email.set(normalized)
    input.preferenceSave(normalized)
    input.busy.set(true)
    const result = await emailOtpV2StartApiRequest(input.apiOrigin(), input.flowHandle.get(), {
      email: normalized,
      csrfToken: input.csrfToken.get(),
    })
    input.busy.set(false)
    if (!result.success) {
      input.failureSet(result.errorMessage)
      return
    }
    const transition = result.data
    if (transition.kind === "fallback") {
      input.fallbackContinue(transition.path)
      return
    }
    if (transition.kind === "complete") {
      input.statusContinue(transition.path)
      return
    }
    if (transition.kind === "render") {
      input.csrfToken.set(transition.csrfToken)
      step.set("code")
      focusSchedule(() => codeInput)
    }
  }
  const codeSubmit = async (event: SubmitEvent) => {
    event.preventDefault()
    resetMessages()
    if (code.get().length < 6 || code.get().length > 20) {
      input.failureSet("Enter the complete verification code.")
      return
    }
    input.busy.set(true)
    const submittedCode = code.get()
    code.set("")
    const result = await emailOtpV2VerifyApiRequest(input.apiOrigin(), input.flowHandle.get(), {
      code: submittedCode,
      csrfToken: input.csrfToken.get(),
    })
    input.busy.set(false)
    if (!result.success) {
      input.failureSet(result.errorMessage)
      focusSchedule(() => codeInput)
      return
    }
    const transition = result.data
    if (transition.kind === "complete") {
      input.statusContinue(transition.path)
      return
    }
    if (transition.kind === "fallback") {
      input.fallbackContinue(transition.path)
      return
    }
    if (transition.kind === "render") {
      input.csrfToken.set(transition.csrfToken)
    }
  }
  const resend = async () => {
    resetMessages()
    input.busy.set(true)
    const result = await emailOtpV2ResendApiRequest(input.apiOrigin(), input.flowHandle.get(), {
      csrfToken: input.csrfToken.get(),
    })
    input.busy.set(false)
    if (!result.success) {
      input.failureSet(result.errorMessage)
      return
    }
    const transition = result.data
    if (transition.kind === "render") {
      input.csrfToken.set(transition.csrfToken)
      code.set("")
      input.notice.set("A new code has been sent.")
      focusSchedule(() => codeInput)
    }
  }

  return {
    step: step.get,
    stepSet: step.set,
    email: email.get,
    code: code.get,
    valid: createMemo(() => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.get())),
    maskedEmail: createMemo(() => {
      const [local = "", domain = ""] = email.get().split("@")
      return `${local.slice(0, 2)}${"*".repeat(Math.min(5, Math.max(2, local.length - 2)))}@${domain}`
    }),
    emailSet: email.set,
    reset: () => {
      step.set("email")
      code.set("")
    },
    emailInput: (value: string) => email.set(value),
    codeInput: (value: string) => code.set(value.replace(/\D/g, "").slice(0, 20)),
    emailInputRegister: (element: HTMLInputElement) => (emailInput = element),
    codeInputRegister: (element: HTMLInputElement) => (codeInput = element),
    emailSubmit,
    codeSubmit,
    resend,
    emailChange: () => {
      code.set("")
      step.set("email")
      resetMessages()
      focusSchedule(() => emailInput)
    },
    emailFocus: () => focusSchedule(() => emailInput),
  }
}
