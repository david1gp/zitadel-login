import { createMemo, onCleanup, onMount } from "solid-js"

import { createSignalObject } from "../../ui/createSignalObject"
import { mfaV2TotpVerifyApiRequest } from "../api/mfaV2TotpVerifyApiRequest"

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

export function mfaTotpStateCreate(inputs: Inputs) {
  const code = createSignalObject("")
  let codeInputElement: HTMLInputElement | undefined

  const focusSchedule = () => queueMicrotask(() => codeInputElement?.focus())

  onMount(() => {
    focusSchedule()
  })

  onCleanup(() => {
    code.set("")
  })

  const submit = async (event: SubmitEvent) => {
    event.preventDefault()
    inputs.errorClear()

    const rawCode = code.get()
    if (rawCode.length !== 6) {
      inputs.failureSet("Enter the complete 6-digit authenticator code.")
      focusSchedule()
      return
    }

    inputs.busySet(true)
    code.set("")

    const res = await mfaV2TotpVerifyApiRequest(
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
    code: code.get,
    valid: createMemo(() => code.get().length === 6),
    codeInput: (value: string) => code.set(value.replace(/\D/g, "").slice(0, 6)),
    codeInputRegister: (element: HTMLInputElement) => {
      codeInputElement = element
    },
    submit,
    reset: () => code.set(""),
    codeFocus: focusSchedule,
  }
}
