import { createMemo, onMount } from "solid-js"

import { loginApiRequest } from "./loginApiRequest"
import { signalObjectCreate } from "./signalObjectCreate"

type LoginStage = "loading" | "email" | "code" | "continuing" | "fatal"

export function loginStateCreate(apiOrigin: () => string) {
  const stage = signalObjectCreate<LoginStage>("loading")
  const email = signalObjectCreate("")
  const code = signalObjectCreate("")
  const csrfToken = signalObjectCreate("")
  const error = signalObjectCreate("")
  const notice = signalObjectCreate("")
  const busy = signalObjectCreate(false)
  const fallbackAvailable = signalObjectCreate(false)
  let emailInput: HTMLInputElement | undefined
  let codeInput: HTMLInputElement | undefined
  let errorElement: HTMLDivElement | undefined

  const apiUrlGet = (path: string) => new URL(path, apiOrigin() || window.location.origin).toString()
  const focusSchedule = (element: () => HTMLElement | undefined) => queueMicrotask(() => element()?.focus())
  const failureSet = (message: string) => {
    error.set(message)
    focusSchedule(() => errorElement)
  }
  const fallbackContinue = (url: string) => window.location.assign(apiUrlGet(url))

  onMount(async () => {
    const authRequest = new URLSearchParams(window.location.search).get("authRequest")
    if (!authRequest) {
      stage.set("fatal")
      failureSet("The authorization request is missing.")
      return
    }

    const result = await loginApiRequest(apiOrigin(), { type: "initialize", authRequest })
    if (!result.success) {
      stage.set("fatal")
      failureSet(result.errorMessage)
      return
    }
    if (result.data.status === "fallback") {
      stage.set("continuing")
      fallbackContinue(result.data.fallbackUrl)
      return
    }
    if (result.data.status === "continue" || result.data.status === "verified") {
      stage.set("continuing")
      fallbackContinue(result.data.continuationUrl)
      return
    }
    if (result.data.status !== "ready") {
      stage.set("fatal")
      failureSet("The sign-in service returned an invalid response.")
      return
    }

    csrfToken.set(result.data.csrfToken)
    email.set(result.data.loginHint ?? "")
    fallbackAvailable.set(true)
    stage.set("email")
    focusSchedule(() => emailInput)
  })

  const emailSubmit = async (event: SubmitEvent) => {
    event.preventDefault()
    error.set("")
    notice.set("")
    if (!emailInput?.checkValidity()) {
      emailInput?.reportValidity()
      return
    }
    busy.set(true)
    const result = await loginApiRequest(apiOrigin(), { type: "start", email: email.get(), csrfToken: csrfToken.get() })
    busy.set(false)
    if (!result.success) {
      failureSet(result.errorMessage)
      return
    }
    if (result.data.status === "fallback") {
      stage.set("continuing")
      fallbackContinue(result.data.fallbackUrl)
      return
    }
    if (result.data.status !== "code_sent") {
      failureSet("The sign-in service returned an invalid response.")
      return
    }
    stage.set("code")
    focusSchedule(() => codeInput)
  }

  const codeSubmit = async (event: SubmitEvent) => {
    event.preventDefault()
    error.set("")
    notice.set("")
    if (code.get().length !== 6) {
      failureSet("Enter the complete six-digit code.")
      focusSchedule(() => codeInput)
      return
    }
    busy.set(true)
    const result = await loginApiRequest(apiOrigin(), { type: "verify", code: code.get(), csrfToken: csrfToken.get() })
    busy.set(false)
    if (!result.success) {
      code.set("")
      failureSet(result.errorMessage)
      focusSchedule(() => codeInput)
      return
    }
    if (result.data.status !== "verified" && result.data.status !== "continue") {
      failureSet("The sign-in service returned an invalid response.")
      return
    }
    stage.set("continuing")
    fallbackContinue(result.data.continuationUrl)
  }

  const resend = async () => {
    error.set("")
    notice.set("")
    busy.set(true)
    const result = await loginApiRequest(apiOrigin(), { type: "resend", csrfToken: csrfToken.get() })
    busy.set(false)
    if (!result.success) {
      failureSet(result.errorMessage)
      return
    }
    if (result.data.status !== "code_sent") {
      failureSet("The sign-in service returned an invalid response.")
      return
    }
    code.set("")
    notice.set("A new code has been sent.")
    focusSchedule(() => codeInput)
  }

  return {
    stage: stage.get,
    email: email.get,
    code: code.get,
    error: error.get,
    notice: notice.get,
    busy: busy.get,
    fallbackAvailable: fallbackAvailable.get,
    emailValid: createMemo(() => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.get())),
    maskedEmail: createMemo(() => {
      const [local = "", domain = ""] = email.get().split("@")
      return `${local.slice(0, 2)}${"*".repeat(Math.min(5, Math.max(2, local.length - 2)))}@${domain}`
    }),
    emailInput: (event: InputEvent & { currentTarget: HTMLInputElement }) => email.set(event.currentTarget.value),
    codeInput: (event: InputEvent & { currentTarget: HTMLInputElement }) =>
      code.set(event.currentTarget.value.replace(/\D/g, "").slice(0, 6)),
    emailInputRegister: (element: HTMLInputElement) => (emailInput = element),
    codeInputRegister: (element: HTMLInputElement) => (codeInput = element),
    errorRegister: (element: HTMLDivElement) => (errorElement = element),
    emailSubmit,
    codeSubmit,
    resend,
    emailChange: () => {
      code.set("")
      error.set("")
      notice.set("")
      stage.set("email")
      focusSchedule(() => emailInput)
    },
    fallback: () => fallbackContinue("/api/fallback"),
  }
}
