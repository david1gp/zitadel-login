import { onCleanup, onMount } from "solid-js"

import { passkeyAssertionSerialize } from "../../passkey/model/passkeyAssertionSerialize"
import { passkeyCeremonyErrorClassify } from "../../passkey/model/passkeyCeremonyErrorClassify"
import { passkeyOptionsDecode } from "../../passkey/model/passkeyOptionsDecode"
import { passkeyOptionsParse } from "../../passkey/model/passkeyOptionsParse"
import type { PasskeyOptions } from "../../passkey/model/passkeyOptionsSchema"

import { createSignalObject } from "../../ui/createSignalObject"
import { mfaV2U2fChallengeApiRequest } from "../api/mfaV2U2fChallengeApiRequest"
import { mfaV2U2fVerifyApiRequest } from "../api/mfaV2U2fVerifyApiRequest"

export type PasskeyCredentialsGet = (options: CredentialRequestOptions) => Promise<Credential | null>

type Inputs = {
  apiOrigin: () => string
  flowHandle: () => string
  factorType: () => "u2f" | "passkey"
  csrfToken: () => string
  csrfTokenSet: (token: string) => void
  busy: () => boolean
  busySet: (value: boolean) => void
  errorClear: () => void
  failureSet: (message: string) => void
  fallbackContinue: (path?: string) => void
  lastUsedSave?: (factor: "u2f" | "passkey") => void
  enrollmentPending?: () => boolean
  enrollmentPendingSet?: (value: boolean) => void
  statusContinue: (url: string) => void
  optionsReload?: () => Promise<void>
  showChooser?: () => void
  showRootChooser: () => void
  credentialsGet?: PasskeyCredentialsGet
  isSupported?: boolean
  fetchFn?: typeof fetch
  initialOptions?: () => PasskeyOptions | undefined
}

export function mfaU2fStateCreate(inputs: Inputs) {
  const options = createSignalObject<PasskeyOptions | undefined>(inputs.initialOptions?.())

  const isBrowserSupported = (): boolean =>
    inputs.isSupported ??
    (typeof window !== "undefined" &&
      Boolean(window.PublicKeyCredential) &&
      typeof window.navigator?.credentials?.get === "function")

  onCleanup(() => {
    options.set(undefined)
  })

  const fetchChallenge = async (): Promise<PasskeyOptions | undefined> => {
    if (!isBrowserSupported()) {
      inputs.failureSet(
        inputs.factorType() === "passkey"
          ? "Passkey authentication is not supported in this browser."
          : "Security key authentication is not supported in this browser.",
      )
      return undefined
    }

    inputs.errorClear()
    inputs.busySet(true)

    const res = await mfaV2U2fChallengeApiRequest(
      inputs.apiOrigin(),
      inputs.flowHandle(),
      { method: inputs.factorType(), csrfToken: inputs.csrfToken() },
      inputs.fetchFn,
    )
    inputs.busySet(false)

    if (!res.success) {
      inputs.failureSet(res.errorMessage)
      return undefined
    }

    const transition = res.data
    if (transition.kind === "fallback") {
      inputs.fallbackContinue(transition.path)
      return undefined
    }
    if (transition.kind === "complete") {
      inputs.statusContinue(transition.path)
      return undefined
    }
    if (transition.kind === "render") {
      inputs.csrfTokenSet(transition.csrfToken)
      if (transition.screen.name === "mfa" && transition.screen.options) {
        inputs.enrollmentPendingSet?.(transition.screen.enrollment === true)
        const parsed = passkeyOptionsParse(transition.screen.options)
        if (parsed.success) {
          options.set(parsed.data)
          return parsed.data
        }
        inputs.failureSet("The sign-in service returned an invalid response.")
        return undefined
      }
      inputs.failureSet("2-Step verification challenge is temporarily unavailable.")
      return undefined
    }
    return undefined
  }

  const startCeremony = async (event?: SubmitEvent) => {
    if (event) event.preventDefault()

    if (!isBrowserSupported()) {
      inputs.failureSet(
        inputs.factorType() === "passkey"
          ? "Passkey authentication is not supported in this browser."
          : "Security key authentication is not supported in this browser.",
      )
      return
    }

    inputs.errorClear()

    let currentOptions = options.get()
    if (!currentOptions) {
      currentOptions = await fetchChallenge()
    }

    if (!currentOptions) return

    let decodedOptions: PublicKeyCredentialRequestOptions
    try {
      decodedOptions = passkeyOptionsDecode(currentOptions)
    } catch {
      inputs.failureSet("Failed to decode verification challenge options.")
      return
    }

    inputs.busySet(true)
    const credentialsFn = inputs.credentialsGet ?? ((opts) => window.navigator.credentials.get(opts))

    let credential: Credential | null = null
    try {
      credential = await credentialsFn({ publicKey: decodedOptions })
    } catch (ceremonyError) {
      inputs.busySet(false)
      const msg = passkeyCeremonyErrorClassify(ceremonyError)
      inputs.failureSet(msg)
      return
    }

    if (!credential) {
      inputs.busySet(false)
      inputs.failureSet("Passkey sign-in was canceled or timed out.")
      return
    }

    let assertion: ReturnType<typeof passkeyAssertionSerialize>
    try {
      assertion = passkeyAssertionSerialize(credential as PublicKeyCredential)
    } catch {
      inputs.busySet(false)
      inputs.failureSet("Failed to process verification response.")
      return
    }

    const verifyRes = await mfaV2U2fVerifyApiRequest(
      inputs.apiOrigin(),
      inputs.flowHandle(),
      {
        credential: assertion,
        method: inputs.factorType(),
        csrfToken: inputs.csrfToken(),
      },
      inputs.fetchFn,
    )
    inputs.busySet(false)

    if (!verifyRes.success) {
      inputs.failureSet(verifyRes.errorMessage)
      return
    }

    const verifyTransition = verifyRes.data
    if (verifyTransition.kind === "complete") {
      if (!inputs.enrollmentPending?.()) inputs.lastUsedSave?.(inputs.factorType())
      inputs.statusContinue(verifyTransition.path)
      return
    }
    if (verifyTransition.kind === "fallback") {
      inputs.fallbackContinue(verifyTransition.path)
      return
    }
    if (verifyTransition.kind === "render") {
      inputs.csrfTokenSet(verifyTransition.csrfToken)
      if (verifyTransition.screen.name === "mfa") {
        inputs.enrollmentPendingSet?.(verifyTransition.screen.enrollment === true)
      }
      if (inputs.optionsReload) {
        await inputs.optionsReload()
      }
    }
  }

  onMount(() => {
    if (isBrowserSupported() && !options.get()) {
      void fetchChallenge()
    }
  })

  return {
    options: options.get,
    isSupported: isBrowserSupported,
    fetchChallenge,
    submit: startCeremony,
    reset: () => {
      options.set(undefined)
    },
  }
}
