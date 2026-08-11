import { Show } from "solid-js"

import { mfaFactorDetailGet } from "../model/mfaFactorDetailGet"
import { mfaFactorLabelGet } from "../model/mfaFactorLabelGet"
import { type PasskeyCredentialsGet, mfaU2fStateCreate } from "./mfaU2fStateCreate"

type MfaU2fPanelProps = {
  apiOrigin: () => string
  flowHandle: () => string
  factorType: () => "u2f" | "passkey"
  csrfToken: () => string
  csrfTokenSet: (token: string) => void
  busy: () => boolean
  busySet: (value: boolean) => void
  headingRegister: (element: HTMLHeadingElement) => void
  errorClear: () => void
  failureSet: (message: string) => void
  fallbackContinue: (path?: string) => void
  statusContinue: (url: string) => void
  optionsReload?: () => Promise<void>
  showChooser?: () => void
  showRootChooser: () => void
  credentialsGet?: PasskeyCredentialsGet
  isSupported?: boolean
  fetchFn?: typeof fetch
}

export function MfaU2fPanel(props: MfaU2fPanelProps) {
  const state = mfaU2fStateCreate({
    apiOrigin: props.apiOrigin,
    flowHandle: props.flowHandle,
    factorType: props.factorType,
    csrfToken: props.csrfToken,
    csrfTokenSet: props.csrfTokenSet,
    busy: props.busy,
    busySet: props.busySet,
    errorClear: props.errorClear,
    failureSet: props.failureSet,
    fallbackContinue: props.fallbackContinue,
    statusContinue: props.statusContinue,
    optionsReload: props.optionsReload,
    showChooser: props.showChooser,
    showRootChooser: props.showRootChooser,
    credentialsGet: props.credentialsGet,
    isSupported: props.isSupported,
    fetchFn: props.fetchFn,
  })

  const label = () => mfaFactorLabelGet(props.factorType())
  const detail = () => mfaFactorDetailGet(props.factorType())

  return (
    <div>
      <Show
        when={state.isSupported()}
        fallback={
          <div class="unsupported-panel">
            <div class="intro">
              <p class="step">2-Step Verification</p>
              <h1 ref={props.headingRegister} id="login-title" tabindex="-1">
                {label()} not supported
              </h1>
              <p class="notice-message">
                {label()} authentication is not supported in this browser. Please use another 2-step verification
                method.
              </p>
            </div>
            <Show when={props.showChooser}>
              <button class="back-button" type="button" onClick={props.showChooser} disabled={props.busy()}>
                Back to 2-step choices
              </button>
            </Show>
            <button class="back-button" type="button" onClick={props.showRootChooser} disabled={props.busy()}>
              Back to methods
            </button>
          </div>
        }
      >
        <div class="intro">
          <p class="step">2-Step Verification</p>
          <h1 ref={props.headingRegister} id="login-title" tabindex="-1">
            {label()}
          </h1>
          <p>{detail()}</p>
        </div>
        <form onSubmit={state.submit} novalidate>
          <button class="primary" type="submit" disabled={props.busy()}>
            {props.busy() ? "Verifying..." : `Verify with ${label()}`}
          </button>
        </form>
        <Show when={props.showChooser}>
          <button class="back-button" type="button" onClick={props.showChooser} disabled={props.busy()}>
            Back to 2-step choices
          </button>
        </Show>
        <button class="back-button" type="button" onClick={props.showRootChooser} disabled={props.busy()}>
          Back to methods
        </button>
      </Show>
    </div>
  )
}
