import { createEffect, onMount } from "solid-js"
import type { LoginMethodSelection } from "../../flow/model/loginMethodSelectionSchema"
import type { PasskeyOptions } from "../../passkey/model/passkeyOptionsSchema"
import { createSignalObject } from "../../ui/createSignalObject"
import { mfaV2OptionsApiRequest } from "../api/mfaV2OptionsApiRequest"
import { mfaV2SkipApiRequest } from "../api/mfaV2SkipApiRequest"
import type { MfaMethodSummary } from "../model/mfaMethodSummarySchema"
import type { MfaOptions } from "../model/mfaOptionsSchema"

type Inputs = {
  apiOrigin: () => string
  flowHandle: () => string
  csrfToken?: () => string
  csrfTokenSet?: (token: string) => void
  selectedFactor: () => MfaMethodSummary["type"] | undefined
  busy: () => boolean
  busySet?: (value: boolean) => void
  errorClear: () => void
  failureSet: (message: string) => void
  fallbackContinue: (path?: string) => void
  statusContinue?: (url: string) => void
  routeSet: (next: LoginMethodSelection | undefined, replace?: boolean) => void
  fetchFn?: typeof fetch
  optionsDisabled?: () => boolean
}

export function mfaStateCreate(inputs: Inputs) {
  const options = createSignalObject<MfaOptions | undefined>(undefined)
  const assertionOptions = createSignalObject<PasskeyOptions | undefined>(undefined)
  const loading = createSignalObject(false)
  const error = createSignalObject("")
  let inFlight = false

  const loadOptions = async (preserveError = false) => {
    if (inputs.optionsDisabled?.()) return
    const handle = inputs.flowHandle()
    if (!handle || loading.get() || inFlight) return
    inFlight = true
    loading.set(true)
    if (!preserveError) {
      error.set("")
      inputs.errorClear()
    }

    const res = await mfaV2OptionsApiRequest(inputs.apiOrigin(), handle, inputs.fetchFn)
    loading.set(false)
    inFlight = false

    if (!res.success) {
      error.set("Unable to load 2-Step Verification options.")
      inputs.failureSet("Unable to load 2-Step Verification options.")
      return
    }

    const data = res.data
    options.set(data)

    if (data.mode === "check") {
      const unambiguousType = data.method.type
      if (inputs.selectedFactor() !== unambiguousType) {
        inputs.routeSet({ method: "mfa", factor: unambiguousType }, true)
      }
      return
    }

    const currentFactor = inputs.selectedFactor()
    if (currentFactor) {
      let valid = false
      if (data.mode === "select" || data.mode === "enroll" || data.mode === "skip") {
        valid = data.methods.some((m) => m.type === currentFactor)
      }
      if (!valid) {
        inputs.routeSet({ method: "mfa" }, true)
      }
    }
  }

  onMount(() => {
    if (!inputs.optionsDisabled?.() && inputs.flowHandle() && !options.get()) {
      void loadOptions()
    }
  })

  createEffect(() => {
    const handle = inputs.flowHandle()
    if (!inputs.optionsDisabled?.() && handle && !options.get() && !loading.get()) {
      void loadOptions()
    }
  })

  const skipSubmit = async () => {
    const handle = inputs.flowHandle()
    if (!handle || inputs.busy()) return
    inputs.errorClear()
    inputs.busySet?.(true)

    const csrfToken = inputs.csrfToken?.() ?? ""
    const res = await mfaV2SkipApiRequest(inputs.apiOrigin(), handle, { csrfToken }, inputs.fetchFn)
    inputs.busySet?.(false)

    if (!res.success) {
      inputs.failureSet(res.errorMessage)
      await loadOptions(true)
      return
    }

    const transition = res.data
    if (transition.kind === "complete") {
      if (inputs.statusContinue) {
        inputs.statusContinue(transition.path)
      } else {
        inputs.fallbackContinue(transition.path)
      }
      return
    }

    if (transition.kind === "fallback") {
      inputs.fallbackContinue(transition.path)
      return
    }

    if (transition.kind === "render") {
      inputs.csrfTokenSet?.(transition.csrfToken)
      await loadOptions()
    }
  }

  return {
    options: options.get,
    assertionOptions: assertionOptions.get,
    assertionStart: (next: PasskeyOptions) => {
      assertionOptions.set(next)
    },
    loading: loading.get,
    error: error.get,
    reload: loadOptions,
    selectFactor: (type: MfaMethodSummary["type"]) => {
      inputs.routeSet({ method: "mfa", factor: type })
    },
    skipSubmit,
    showChooser: () => {
      inputs.routeSet({ method: "mfa" })
    },
    showRootChooser: () => {
      inputs.routeSet(undefined)
    },
  }
}
