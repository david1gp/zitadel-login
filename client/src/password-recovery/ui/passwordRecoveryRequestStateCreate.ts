import { createMemo, onCleanup, onMount } from "solid-js"

import { loginIdentifierNormalize } from "../../preferences/model/loginIdentifierNormalize"
import { createSignalObject } from "../../ui/createSignalObject"
import { passwordRecoveryBootstrapApiRequest } from "../api/passwordRecoveryBootstrapApiRequest"
import { passwordResetRequestApiRequest } from "../api/passwordResetRequestApiRequest"

type RequestStep = "loading" | "email" | "sent" | "fatal"

export function passwordRecoveryRequestStateCreate(input: {
  apiOrigin: () => string
  errorClear: () => void
  failureSet: (message: string) => void
  focusHeading: () => void
  fetchFn?: typeof fetch
  initialStep?: RequestStep
}) {
  const step = createSignalObject<RequestStep>(input.initialStep ?? "loading")
  const email = createSignalObject("")
  const busy = createSignalObject(false)
  let csrfToken = ""
  let emailInput: HTMLInputElement | undefined
  let active = true
  let requestSequence = 0

  const focusSchedule = (element: () => HTMLElement | undefined) => queueMicrotask(() => element()?.focus())

  const bootstrapStart = async () => {
    const request = ++requestSequence
    const result = await passwordRecoveryBootstrapApiRequest(input.apiOrigin(), input.fetchFn)
    if (!active || request !== requestSequence) return
    if (!result.success) {
      csrfToken = ""
      step.set("fatal")
      input.failureSet(result.errorMessage)
      return
    }
    csrfToken = result.data.csrfToken
    step.set("email")
    focusSchedule(() => emailInput)
  }

  onMount(() => {
    if (input.initialStep) return
    void bootstrapStart()
  })

  onCleanup(() => {
    active = false
    requestSequence += 1
    csrfToken = ""
    email.set("")
  })

  const submit = async (event: SubmitEvent) => {
    event.preventDefault()
    if (busy.get() || step.get() !== "email") return
    input.errorClear()

    const normalized = loginIdentifierNormalize(email.get())
    email.set(normalized)
    if (!normalized.includes("@") || normalized.length < 3 || normalized.length > 254) {
      input.failureSet("Enter the email address for your account.")
      focusSchedule(() => emailInput)
      return
    }

    busy.set(true)
    const request = ++requestSequence
    const result = await passwordResetRequestApiRequest(
      input.apiOrigin(),
      { email: normalized, csrfToken },
      input.fetchFn,
    )
    if (!active || request !== requestSequence) return
    busy.set(false)

    if (!result.success) {
      input.failureSet(result.errorMessage)
      focusSchedule(() => emailInput)
      return
    }

    csrfToken = ""
    email.set("")
    step.set("sent")
    input.focusHeading()
  }

  return {
    step: step.get,
    email: email.get,
    busy: busy.get,
    valid: createMemo(() => email.get().trim().length > 2 && email.get().includes("@")),
    emailInput: (value: string) => email.set(value),
    emailInputRegister: (element: HTMLInputElement) => {
      emailInput = element
    },
    submit,
  }
}
