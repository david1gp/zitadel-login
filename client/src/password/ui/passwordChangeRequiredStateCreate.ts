import { createMemo, onCleanup, onMount } from "solid-js"

import { createSignalObject } from "../../ui/createSignalObject"
import { passwordChangeRequiredApiRequest } from "../api/passwordChangeRequiredApiRequest"

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
  transitionApply: (route: string) => void
  fetchFn?: typeof fetch
}

export function passwordChangeRequiredStateCreate(inputs: Inputs) {
  const currentPassword = createSignalObject("")
  const newPassword = createSignalObject("")
  const confirmation = createSignalObject("")
  const showPassword = createSignalObject(false)
  const submitted = createSignalObject(false)
  let currentInput: HTMLInputElement | undefined
  let newInput: HTMLInputElement | undefined
  let active = true
  let requestSequence = 0

  const focusSchedule = (element: () => HTMLElement | undefined) => queueMicrotask(() => element()?.focus())
  const secretsClear = () => {
    currentPassword.set("")
    newPassword.set("")
    confirmation.set("")
    showPassword.set(false)
  }

  onMount(() => {
    focusSchedule(() => currentInput)
  })

  onCleanup(() => {
    active = false
    requestSequence += 1
    secretsClear()
  })

  const submit = async (event: SubmitEvent) => {
    event.preventDefault()
    if (inputs.busy() || submitted.get()) return
    inputs.errorClear()

    if (!currentPassword.get()) {
      inputs.failureSet("Enter your current password.")
      focusSchedule(() => currentInput)
      return
    }
    if (!newPassword.get()) {
      inputs.failureSet("Enter a new password.")
      focusSchedule(() => newInput)
      return
    }
    if (newPassword.get() !== confirmation.get()) {
      inputs.failureSet("The passwords do not match.")
      focusSchedule(() => newInput)
      return
    }

    const submittedCurrent = currentPassword.get()
    const submittedNew = newPassword.get()
    submitted.set(true)
    inputs.busySet(true)
    const request = ++requestSequence

    const result = await passwordChangeRequiredApiRequest(
      inputs.apiOrigin(),
      inputs.flowHandle(),
      { currentPassword: submittedCurrent, newPassword: submittedNew, csrfToken: inputs.csrfToken() },
      inputs.fetchFn,
    )
    secretsClear()
    if (!active || request !== requestSequence) return
    inputs.busySet(false)
    submitted.set(false)

    if (!result.success) {
      inputs.failureSet(result.errorMessage)
      focusSchedule(() => currentInput)
      return
    }

    if (result.data.status === "retryable") {
      inputs.csrfTokenSet(result.data.csrfToken)
      inputs.failureSet(result.data.errorMessage)
      focusSchedule(() => currentInput)
      return
    }

    const transition = result.data.transition
    if (transition.kind === "fallback") {
      inputs.fallbackContinue(transition.path)
      return
    }
    if (transition.kind === "complete") {
      inputs.statusContinue(transition.path)
      return
    }
    inputs.csrfTokenSet(transition.csrfToken)
    inputs.transitionApply(transition.route)
  }

  return {
    currentPassword: currentPassword.get,
    newPassword: newPassword.get,
    confirmation: confirmation.get,
    showPassword: showPassword.get,
    valid: createMemo(
      () => currentPassword.get().length > 0 && newPassword.get().length > 0 && confirmation.get().length > 0,
    ),
    currentPasswordInput: (value: string) => currentPassword.set(value),
    newPasswordInput: (value: string) => newPassword.set(value),
    confirmationInput: (value: string) => confirmation.set(value),
    toggleShowPassword: () => showPassword.set(!showPassword.get()),
    currentPasswordInputRegister: (element: HTMLInputElement) => {
      currentInput = element
    },
    newPasswordInputRegister: (element: HTMLInputElement) => {
      newInput = element
    },
    submit,
  }
}
