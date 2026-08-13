import { onCleanup } from "solid-js"

import { loginIdentifierNormalize } from "../../preferences/model/loginIdentifierNormalize"
import { createSignalObject } from "../../ui/createSignalObject"
import type { SignalObject } from "../../ui/SignalObject"
import { passkeyV2ChallengeApiRequest } from "../api/passkeyV2ChallengeApiRequest"
import { passkeyV2VerifyApiRequest } from "../api/passkeyV2VerifyApiRequest"
import { passkeyAssertionSerialize } from "../model/passkeyAssertionSerialize"
import { passkeyCeremonyErrorClassify } from "../model/passkeyCeremonyErrorClassify"
import { passkeyOptionsDecode } from "../model/passkeyOptionsDecode"
import { passkeyOptionsParse } from "../model/passkeyOptionsParse"
import type { PasskeyOptions } from "../model/passkeyOptionsSchema"

export type PasskeyCredentialsGet = (options: CredentialRequestOptions) => Promise<Credential | null>

export function passkeyStateCreate(input: {
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
  credentialsGet?: PasskeyCredentialsGet
  isSupported?: boolean
}) {
  const identifier = createSignalObject("")
  const passkeyOptions = createSignalObject<PasskeyOptions | undefined>(undefined)
  const mfaRequired = createSignalObject(false)
  let identifierInput: HTMLInputElement | undefined

  const focusSchedule = (element: () => HTMLElement | undefined) => queueMicrotask(() => element()?.focus())
  const resetMessages = () => {
    input.errorClear()
    input.notice.set("")
  }

  const isBrowserSupported = () =>
    input.isSupported ??
    (typeof window !== "undefined" &&
      Boolean(window.PublicKeyCredential) &&
      typeof window.navigator?.credentials?.get === "function")

  onCleanup(() => {
    passkeyOptions.set(undefined)
    mfaRequired.set(false)
  })

  const submit = async (event?: SubmitEvent) => {
    if (event) event.preventDefault()
    resetMessages()

    if (!isBrowserSupported()) {
      input.failureSet("Passkey sign-in is not supported in this browser.")
      return
    }

    let currentOptions = passkeyOptions.get()

    if (!currentOptions) {
      const normalizedIdentifier = loginIdentifierNormalize(identifier.get())
      identifier.set(normalizedIdentifier)

      input.busy.set(true)
      const challengeResult = await passkeyV2ChallengeApiRequest(input.apiOrigin(), input.flowHandle.get(), {
        ...(normalizedIdentifier ? { identifier: normalizedIdentifier } : {}),
        csrfToken: input.csrfToken.get(),
      })
      input.busy.set(false)

      if (!challengeResult.success) {
        input.failureSet(challengeResult.errorMessage)
        focusSchedule(() => identifierInput)
        return
      }

      const transition = challengeResult.data
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
        if (transition.screen.name === "passkey" && transition.screen.options) {
          const parsedOptions = passkeyOptionsParse(transition.screen.options)
          if (parsedOptions.success) {
            currentOptions = parsedOptions.data
            passkeyOptions.set(currentOptions)
          } else {
            input.failureSet("The sign-in service returned an invalid response.")
            return
          }
        } else {
          input.failureSet("Passkey sign-in is temporarily unavailable.")
          return
        }
      }
    }

    if (!currentOptions) {
      input.failureSet("Passkey challenge is unavailable.")
      return
    }

    if (identifier.get().trim().length > 0) {
      input.preferenceSave(loginIdentifierNormalize(identifier.get()))
    }

    let publicKeyRequestOptions: PublicKeyCredentialRequestOptions
    try {
      publicKeyRequestOptions = passkeyOptionsDecode(currentOptions)
    } catch {
      input.failureSet("Failed to decode passkey challenge options.")
      return
    }

    input.busy.set(true)
    const credentialsFn = input.credentialsGet ?? ((opts) => window.navigator.credentials.get(opts))

    let credential: Credential | null = null
    try {
      credential = await credentialsFn({ publicKey: publicKeyRequestOptions })
    } catch (ceremonyError) {
      input.busy.set(false)
      const msg = passkeyCeremonyErrorClassify(ceremonyError)
      input.failureSet(msg)
      return
    }

    if (!credential) {
      input.busy.set(false)
      input.failureSet("Passkey sign-in was canceled or timed out.")
      return
    }

    let assertion: ReturnType<typeof passkeyAssertionSerialize>
    try {
      assertion = passkeyAssertionSerialize(credential as PublicKeyCredential)
    } catch {
      input.busy.set(false)
      input.failureSet("Failed to process passkey response.")
      return
    }

    const verifyResult = await passkeyV2VerifyApiRequest(input.apiOrigin(), input.flowHandle.get(), {
      credential: assertion,
      csrfToken: input.csrfToken.get(),
    })
    input.busy.set(false)

    if (!verifyResult.success) {
      input.failureSet(verifyResult.errorMessage)
      return
    }

    const verifyTransition = verifyResult.data
    if (verifyTransition.kind === "fallback") {
      input.fallbackContinue(verifyTransition.path)
      return
    }
    if (verifyTransition.kind === "complete") {
      input.statusContinue(verifyTransition.path)
      return
    }
    if (verifyTransition.kind === "render") {
      input.csrfToken.set(verifyTransition.csrfToken)
      if (verifyTransition.screen.name === "mfa" || verifyTransition.route.startsWith("/login/mfa")) {
        mfaRequired.set(true)
      }
    }
  }

  return {
    identifier: identifier.get,
    identifierSet: identifier.set,
    options: passkeyOptions.get,
    optionsSet: passkeyOptions.set,
    mfaRequired: mfaRequired.get,
    isSupported: isBrowserSupported,
    reset: () => {
      passkeyOptions.set(undefined)
      mfaRequired.set(false)
    },
    identifierInput: (value: string) => identifier.set(value),
    identifierInputRegister: (element: HTMLInputElement) => (identifierInput = element),
    identifierFocus: () => focusSchedule(() => identifierInput),
    submit,
  }
}
