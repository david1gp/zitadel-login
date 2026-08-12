import { onCleanup } from "solid-js"

import { passkeyAttestationSerialize } from "../../passkey/model/passkeyAttestationSerialize"
import { passkeyCreationOptionsDecode } from "../../passkey/model/passkeyCreationOptionsDecode"
import { passkeyCreationOptionsParse } from "../../passkey/model/passkeyCreationOptionsParse"
import type { PasskeyCreationOptions } from "../../passkey/model/passkeyCreationOptionsSchema"
import { passkeyOptionsParse } from "../../passkey/model/passkeyOptionsParse"
import type { PasskeyOptions } from "../../passkey/model/passkeyOptionsSchema"
import { passkeyRegistrationErrorClassify } from "../../passkey/model/passkeyRegistrationErrorClassify"
import { createSignalObject } from "../../ui/createSignalObject"
import { mfaV2WebAuthnEnrollStartApiRequest } from "../api/mfaV2WebAuthnEnrollStartApiRequest"
import { mfaV2WebAuthnEnrollVerifyApiRequest } from "../api/mfaV2WebAuthnEnrollVerifyApiRequest"

export type PasskeyCredentialsCreate = (options: CredentialCreationOptions) => Promise<Credential | null>

export const mfaWebAuthnDisplayNameMaxLength = 64

type Inputs = {
  apiOrigin: () => string
  flowHandle: () => string
  method: () => "u2f" | "passkey"
  csrfToken: () => string
  csrfTokenSet: (token: string) => void
  busy: () => boolean
  busySet: (value: boolean) => void
  errorClear: () => void
  failureSet: (message: string) => void
  fallbackContinue: (path?: string) => void
  statusContinue: (url: string) => void
  assertionStart?: (options: PasskeyOptions) => void
  optionsReload?: () => Promise<void>
  credentialsCreate?: PasskeyCredentialsCreate
  isSupported?: boolean
  fetchFn?: typeof fetch
  setupUnavailable?: boolean
}

export function mfaWebAuthnEnrollStateCreate(inputs: Inputs) {
  const stage = createSignalObject<"start" | "unavailable">(inputs.setupUnavailable ? "unavailable" : "start")
  const displayName = createSignalObject("")
  let inFlight = false
  let disposed = false
  let pendingOptions: PasskeyCreationOptions | undefined

  onCleanup(() => {
    disposed = true
    pendingOptions = undefined
    displayName.set("")
  })

  const isBrowserSupported = (): boolean =>
    inputs.isSupported ??
    (typeof window !== "undefined" &&
      Boolean(window.PublicKeyCredential) &&
      typeof window.navigator?.credentials?.create === "function")

  const unsupportedMessage = () =>
    inputs.method() === "passkey"
      ? "Passkey registration is not supported in this browser."
      : "Security key registration is not supported in this browser."

  const start = async () => {
    if (inFlight || inputs.busy() || stage.get() === "unavailable") return
    if (!isBrowserSupported()) {
      inputs.failureSet(unsupportedMessage())
      return
    }

    inFlight = true
    inputs.errorClear()
    inputs.busySet(true)

    if (!pendingOptions) {
      const started = await mfaV2WebAuthnEnrollStartApiRequest(
        inputs.apiOrigin(),
        inputs.flowHandle(),
        { method: inputs.method(), csrfToken: inputs.csrfToken() },
        inputs.fetchFn,
      )
      if (disposed) {
        inputs.busySet(false)
        inFlight = false
        return
      }
      if (!started.success) {
        inputs.busySet(false)
        inFlight = false
        inputs.failureSet(started.errorMessage)
        return
      }

      const startTransition = started.data.transition
      if (startTransition.kind === "complete") {
        inputs.busySet(false)
        inFlight = false
        inputs.statusContinue(startTransition.path)
        return
      }
      if (startTransition.kind === "fallback") {
        inputs.busySet(false)
        inFlight = false
        inputs.fallbackContinue(startTransition.path)
        return
      }
      inputs.csrfTokenSet(startTransition.csrfToken)

      const parsed = passkeyCreationOptionsParse(started.data.options)
      if (!parsed.success) {
        inputs.busySet(false)
        inFlight = false
        inputs.failureSet("The sign-in service returned an invalid response.")
        return
      }
      pendingOptions = parsed.data
    }

    let credential: Credential | null = null
    try {
      const credentialsCreate =
        inputs.credentialsCreate ??
        ((options: CredentialCreationOptions) => window.navigator.credentials.create(options))
      credential = await credentialsCreate({ publicKey: passkeyCreationOptionsDecode(pendingOptions) })
    } catch (ceremonyError) {
      inputs.busySet(false)
      inFlight = false
      if (!disposed) inputs.failureSet(passkeyRegistrationErrorClassify(ceremonyError))
      return
    }
    if (disposed) {
      inputs.busySet(false)
      inFlight = false
      return
    }
    if (!credential) {
      inputs.busySet(false)
      inFlight = false
      inputs.failureSet(passkeyRegistrationErrorClassify({ name: "NotAllowedError" }))
      return
    }

    const attestation = passkeyAttestationSerialize(credential as PublicKeyCredential)
    if (!attestation.success) {
      inputs.busySet(false)
      inFlight = false
      inputs.failureSet(attestation.errorMessage)
      return
    }

    const trimmedName = displayName.get().trim().slice(0, mfaWebAuthnDisplayNameMaxLength)
    const verified = await mfaV2WebAuthnEnrollVerifyApiRequest(
      inputs.apiOrigin(),
      inputs.flowHandle(),
      {
        method: inputs.method(),
        credential: attestation.data,
        ...(trimmedName ? { displayName: trimmedName } : {}),
        csrfToken: inputs.csrfToken(),
      },
      inputs.fetchFn,
    )
    inputs.busySet(false)
    inFlight = false
    if (disposed) return

    if (!verified.success) {
      inputs.failureSet(verified.errorMessage)
      return
    }

    pendingOptions = undefined
    displayName.set("")
    const transition = verified.data
    if (transition.kind === "complete") {
      inputs.statusContinue(transition.path)
      return
    }
    if (transition.kind === "fallback") {
      inputs.fallbackContinue(transition.path)
      return
    }

    inputs.csrfTokenSet(transition.csrfToken)
    if (transition.screen.name === "mfa" && transition.screen.options && inputs.assertionStart) {
      const assertionOptions = passkeyOptionsParse(transition.screen.options)
      if (assertionOptions.success) {
        inputs.assertionStart(assertionOptions.data)
        return
      }
    }
    if (inputs.optionsReload) await inputs.optionsReload()
  }

  return {
    stage: stage.get,
    isSupported: isBrowserSupported,
    displayName: displayName.get,
    displayNameInput: (value: string) => {
      const cleaned = value.slice(0, mfaWebAuthnDisplayNameMaxLength)
      displayName.set(cleaned)
      return cleaned
    },
    start,
    submit: (event: SubmitEvent) => {
      event.preventDefault()
      void start()
    },
  }
}
