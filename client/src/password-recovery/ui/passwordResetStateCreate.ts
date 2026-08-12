import { createMemo, onCleanup, onMount } from "solid-js"

import { createSignalObject } from "../../ui/createSignalObject"
import { passwordResetSetApiRequest } from "../api/passwordResetSetApiRequest"
import { passwordResetSetBootstrapApiRequest } from "../api/passwordResetSetBootstrapApiRequest"

type ResetStep = "loading" | "ready" | "invalid_link" | "complete"

export function passwordResetStateCreate(input: {
  apiOrigin: () => string
  errorClear: () => void
  failureSet: (message: string) => void
  focusHeading: () => void
  fetchFn?: typeof fetch
  initialStep?: ResetStep
}) {
  const step = createSignalObject<ResetStep>(input.initialStep ?? "loading")
  const password = createSignalObject("")
  const confirmation = createSignalObject("")
  const showPassword = createSignalObject(false)
  const busy = createSignalObject(false)
  let csrfToken = ""
  let passwordInput: HTMLInputElement | undefined
  let active = true
  let requestSequence = 0

  const focusSchedule = (element: () => HTMLElement | undefined) => queueMicrotask(() => element()?.focus())
  const secretsClear = () => {
    csrfToken = ""
    password.set("")
    confirmation.set("")
    showPassword.set(false)
  }

  const bootstrapStart = async () => {
    const request = ++requestSequence
    const result = await passwordResetSetBootstrapApiRequest(input.apiOrigin(), input.fetchFn)
    if (!active || request !== requestSequence) return
    if (!result.success) {
      secretsClear()
      step.set("invalid_link")
      input.failureSet(result.errorMessage)
      return
    }
    csrfToken = result.data.csrfToken
    step.set("ready")
    focusSchedule(() => passwordInput)
  }

  onMount(() => {
    if (input.initialStep) return
    void bootstrapStart()
  })

  onCleanup(() => {
    active = false
    requestSequence += 1
    secretsClear()
  })

  const submit = async (event: SubmitEvent) => {
    event.preventDefault()
    if (busy.get() || step.get() !== "ready") return
    input.errorClear()

    if (!password.get()) {
      input.failureSet("Enter a new password.")
      focusSchedule(() => passwordInput)
      return
    }
    if (password.get() !== confirmation.get()) {
      input.failureSet("The passwords do not match.")
      focusSchedule(() => passwordInput)
      return
    }

    const submittedPassword = password.get()
    busy.set(true)
    const request = ++requestSequence
    const result = await passwordResetSetApiRequest(
      input.apiOrigin(),
      {
        password: submittedPassword,
        csrfToken,
      },
      input.fetchFn,
    )
    if (!active || request !== requestSequence) return
    busy.set(false)

    if (!result.success) {
      input.failureSet(result.errorMessage)
      focusSchedule(() => passwordInput)
      return
    }

    const outcome = result.data
    if (outcome.status === "retryable") {
      csrfToken = outcome.csrfToken
      password.set("")
      confirmation.set("")
      input.failureSet(outcome.errorMessage)
      focusSchedule(() => passwordInput)
      return
    }
    if (outcome.status === "terminal") {
      secretsClear()
      step.set("invalid_link")
      input.failureSet(outcome.errorMessage)
      return
    }

    secretsClear()
    step.set("complete")
    input.focusHeading()
  }

  return {
    step: step.get,
    password: password.get,
    confirmation: confirmation.get,
    showPassword: showPassword.get,
    busy: busy.get,
    valid: createMemo(() => password.get().length > 0 && confirmation.get().length > 0),
    passwordInput: (value: string) => password.set(value),
    confirmationInput: (value: string) => confirmation.set(value),
    toggleShowPassword: () => showPassword.set(!showPassword.get()),
    passwordInputRegister: (element: HTMLInputElement) => {
      passwordInput = element
    },
    submit,
  }
}
