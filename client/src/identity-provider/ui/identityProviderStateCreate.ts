import { browserLocationAssign } from "../../flow/model/browserLocationAssign"
import type { SignalObject } from "../../ui/SignalObject"
import { identityProviderV2StartApiRequest } from "../api/identityProviderV2StartApiRequest"

type IdentityProviderStateCreateOptions = {
  apiOrigin: () => string
  busy: SignalObject<boolean>
  csrfToken: () => string
  flowHandle: () => string
  provider: () => { id: string; name: string; type: string } | undefined
  subroute: () => "failure" | "account-not-found" | "linking-failed" | "registration-failed" | undefined
  errorClear: () => void
  failureSet: (message: string) => void
  fallbackContinue: (path?: string) => void
  statusContinue: (url: string) => void
  preferenceSave: () => void
  browserWindow?: Window
}

export function identityProviderStateCreate(options: IdentityProviderStateCreateOptions) {
  const windowObj = options.browserWindow ?? (typeof window !== "undefined" ? window : undefined)
  const providerName = () => options.provider()?.name ?? "Provider"
  const providerType = () => options.provider()?.type ?? ""

  const submit = async (event: SubmitEvent) => {
    event.preventDefault()
    const currentProvider = options.provider()
    if (!currentProvider) {
      options.failureSet("This sign-in method is not available.")
      return
    }
    options.errorClear()
    options.preferenceSave()
    options.busy.set(true)

    const result = await identityProviderV2StartApiRequest(
      options.apiOrigin(),
      options.flowHandle(),
      currentProvider.id,
      options.csrfToken(),
    )
    options.busy.set(false)

    if (!result.success) {
      options.failureSet(result.errorMessage)
      return
    }

    if ("redirectUrl" in result.data) {
      if (windowObj) browserLocationAssign(windowObj, result.data.redirectUrl)
      return
    }

    if (result.data.transition.kind === "fallback") {
      options.fallbackContinue(result.data.transition.path)
      return
    }

    if (result.data.transition.kind === "complete") {
      options.statusContinue(result.data.transition.path)
      return
    }
  }

  return {
    providerName,
    providerType,
    subroute: options.subroute,
    submit,
  }
}
