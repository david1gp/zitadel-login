import { createMemo, onCleanup } from "solid-js"

import { createSignalObject } from "../../ui/createSignalObject"
import { mfaV2TotpEnrollStartApiRequest } from "../api/mfaV2TotpEnrollStartApiRequest"
import { mfaV2TotpEnrollVerifyApiRequest } from "../api/mfaV2TotpEnrollVerifyApiRequest"
import { type TotpProvisioningQr, totpProvisioningQrGet } from "../model/totpProvisioningQrGet"
import { totpSecretGroupsGet } from "../model/totpSecretGroupsGet"

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
  fetchFn?: typeof fetch
  setupUnavailable?: boolean
}

export function mfaTotpEnrollStateCreate(inputs: Inputs) {
  const stage = createSignalObject<"start" | "setup" | "unavailable">(inputs.setupUnavailable ? "unavailable" : "start")
  const secret = createSignalObject("")
  const qr = createSignalObject<TotpProvisioningQr | undefined>(undefined)
  const code = createSignalObject("")
  const secretVisible = createSignalObject(false)
  let inFlight = false
  let codeInputElement: HTMLInputElement | undefined
  let disposed = false

  const focusSchedule = () => queueMicrotask(() => codeInputElement?.focus())

  const setupClear = () => {
    secret.set("")
    qr.set(undefined)
    code.set("")
    secretVisible.set(false)
  }

  onCleanup(() => {
    disposed = true
    setupClear()
  })

  const start = async () => {
    if (inFlight || inputs.busy()) return
    inFlight = true
    inputs.errorClear()
    inputs.busySet(true)

    const res = await mfaV2TotpEnrollStartApiRequest(
      inputs.apiOrigin(),
      inputs.flowHandle(),
      { csrfToken: inputs.csrfToken() },
      inputs.fetchFn,
    )
    inputs.busySet(false)
    inFlight = false
    if (disposed) {
      setupClear()
      return
    }

    if (!res.success) {
      setupClear()
      stage.set("unavailable")
      inputs.failureSet(res.errorMessage)
      return
    }

    const transition = res.data.transition
    if (transition.kind === "complete") {
      setupClear()
      inputs.statusContinue(transition.path)
      return
    }
    if (transition.kind === "fallback") {
      setupClear()
      inputs.fallbackContinue(transition.path)
      return
    }

    inputs.csrfTokenSet(transition.csrfToken)
    const rendered = totpProvisioningQrGet(res.data.provisioningUri)
    if (!rendered.success) {
      setupClear()
      stage.set("unavailable")
      inputs.failureSet(rendered.errorMessage)
      return
    }

    qr.set(rendered.data)
    secret.set(res.data.secret)
    stage.set("setup")
    focusSchedule()
  }

  const submit = async (event: SubmitEvent) => {
    event.preventDefault()
    if (inFlight || inputs.busy()) return
    inputs.errorClear()

    const enteredCode = code.get()
    if (enteredCode.length !== 6) {
      inputs.failureSet("Enter the complete 6-digit code from your authenticator app.")
      focusSchedule()
      return
    }

    inFlight = true
    inputs.busySet(true)
    code.set("")

    const res = await mfaV2TotpEnrollVerifyApiRequest(
      inputs.apiOrigin(),
      inputs.flowHandle(),
      { code: enteredCode, csrfToken: inputs.csrfToken() },
      inputs.fetchFn,
    )
    inputs.busySet(false)
    inFlight = false
    if (disposed) {
      setupClear()
      return
    }

    if (!res.success) {
      inputs.failureSet(res.errorMessage)
      focusSchedule()
      return
    }

    const transition = res.data
    if (transition.kind === "complete") {
      setupClear()
      inputs.statusContinue(transition.path)
      return
    }
    if (transition.kind === "fallback") {
      setupClear()
      inputs.fallbackContinue(transition.path)
      return
    }

    setupClear()
    stage.set("start")
    inputs.csrfTokenSet(transition.csrfToken)
    if (inputs.optionsReload) {
      await inputs.optionsReload()
    }
  }

  return {
    stage: stage.get,
    qr: qr.get,
    secret: secret.get,
    secretGroups: createMemo(() => totpSecretGroupsGet(secret.get())),
    secretVisible: secretVisible.get,
    secretVisibleToggle: () => secretVisible.set(!secretVisible.get()),
    code: code.get,
    valid: createMemo(() => code.get().length === 6),
    codeInput: (value: string) => {
      const cleaned = value.replace(/\D/g, "").slice(0, 6)
      code.set(cleaned)
      return cleaned
    },
    codeInputRegister: (element: HTMLInputElement) => {
      codeInputElement = element
    },
    start,
    submit,
    codeFocus: focusSchedule,
  }
}
