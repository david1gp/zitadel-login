import { createMemo, onCleanup } from "solid-js"

import { loginIdentifierNormalize } from "../../preferences/model/loginIdentifierNormalize"
import { createSignalObject } from "../../ui/createSignalObject"
import type { SignalObject } from "../../ui/SignalObject"
import { passwordV2VerifyApiRequest } from "../api/passwordV2VerifyApiRequest"

export function passwordStateCreate(input: {
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
  changeRequiredSet?: (value: { expired: boolean }) => void
}) {
  const identifier = createSignalObject("")
  const password = createSignalObject("")
  const showPassword = createSignalObject(false)
  const mfaRequired = createSignalObject(false)
  let identifierInput: HTMLInputElement | undefined
  let passwordInput: HTMLInputElement | undefined

  const focusSchedule = (element: () => HTMLElement | undefined) => queueMicrotask(() => element()?.focus())
  const resetMessages = () => {
    input.errorClear()
    input.notice.set("")
  }

  onCleanup(() => {
    password.set("")
  })

  const submit = async (event: SubmitEvent) => {
    event.preventDefault()
    resetMessages()
    const normalizedIdentifier = loginIdentifierNormalize(identifier.get())
    identifier.set(normalizedIdentifier)

    if (!normalizedIdentifier) {
      input.failureSet("Enter your username or email address.")
      focusSchedule(() => identifierInput)
      return
    }
    if (!password.get()) {
      input.failureSet("Enter your password.")
      focusSchedule(() => passwordInput)
      return
    }

    input.preferenceSave(normalizedIdentifier)
    const submittedPassword = password.get()
    password.set("")

    input.busy.set(true)
    const result = await passwordV2VerifyApiRequest(input.apiOrigin(), input.flowHandle.get(), {
      identifier: normalizedIdentifier,
      password: submittedPassword,
      csrfToken: input.csrfToken.get(),
    })
    input.busy.set(false)

    if (!result.success) {
      input.failureSet(result.errorMessage)
      focusSchedule(() => passwordInput)
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
      if (transition.screen.name === "password_change_required") {
        input.changeRequiredSet?.({ expired: transition.screen.expired })
        return
      }
      if (transition.screen.name === "mfa" || transition.route.startsWith("/login/mfa")) {
        mfaRequired.set(true)
      }
    }
  }

  return {
    identifier: identifier.get,
    identifierSet: identifier.set,
    password: password.get,
    showPassword: showPassword.get,
    mfaRequired: mfaRequired.get,
    valid: createMemo(() => identifier.get().trim().length > 0 && password.get().length > 0),
    reset: () => {
      password.set("")
      showPassword.set(false)
      mfaRequired.set(false)
    },
    identifierInput: (value: string) => identifier.set(value),
    passwordInput: (value: string) => password.set(value),
    toggleShowPassword: () => showPassword.set(!showPassword.get()),
    identifierInputRegister: (element: HTMLInputElement) => (identifierInput = element),
    passwordInputRegister: (element: HTMLInputElement) => (passwordInput = element),
    identifierFocus: () => focusSchedule(() => identifierInput),
    passwordFocus: () => focusSchedule(() => passwordInput),
    submit,
  }
}
