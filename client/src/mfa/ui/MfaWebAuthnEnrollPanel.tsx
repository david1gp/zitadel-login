import { Match, Show, Switch } from "solid-js"

import type { PasskeyOptions } from "../../passkey/model/passkeyOptionsSchema"
import {
  type PasskeyCredentialsCreate,
  mfaWebAuthnDisplayNameMaxLength,
  mfaWebAuthnEnrollStateCreate,
} from "./mfaWebAuthnEnrollStateCreate"

type MfaWebAuthnEnrollPanelProps = {
  apiOrigin: () => string
  flowHandle: () => string
  method: () => "u2f" | "passkey"
  csrfToken: () => string
  csrfTokenSet: (token: string) => void
  busy: () => boolean
  busySet: (value: boolean) => void
  headingRegister: (element: HTMLHeadingElement) => void
  errorClear: () => void
  failureSet: (message: string) => void
  fallbackContinue: (path?: string) => void
  statusContinue: (url: string) => void
  assertionStart?: (options: PasskeyOptions) => void
  optionsReload?: () => Promise<void>
  showChooser?: () => void
  showRootChooser: () => void
  credentialsCreate?: PasskeyCredentialsCreate
  isSupported?: boolean
  fetchFn?: typeof fetch
  setupUnavailable?: boolean
}

export function MfaWebAuthnEnrollPanel(props: MfaWebAuthnEnrollPanelProps) {
  const state = mfaWebAuthnEnrollStateCreate({
    apiOrigin: props.apiOrigin,
    flowHandle: props.flowHandle,
    method: props.method,
    csrfToken: props.csrfToken,
    csrfTokenSet: props.csrfTokenSet,
    busy: props.busy,
    busySet: props.busySet,
    errorClear: props.errorClear,
    failureSet: props.failureSet,
    fallbackContinue: props.fallbackContinue,
    statusContinue: props.statusContinue,
    assertionStart: props.assertionStart,
    optionsReload: props.optionsReload,
    credentialsCreate: props.credentialsCreate,
    isSupported: props.isSupported,
    fetchFn: props.fetchFn,
    setupUnavailable: props.setupUnavailable,
  })

  const title = () => (props.method() === "passkey" ? "Set up a passkey" : "Set up a security key")
  const action = () => (props.method() === "passkey" ? "Create passkey" : "Register security key")

  return (
    <div>
      <div class="intro">
        <p class="step">2-Step Verification</p>
        <h1 ref={props.headingRegister} id="login-title" tabindex="-1">
          {title()}
        </h1>
      </div>
      <Switch>
        <Match when={!state.isSupported()}>
          <p class="notice-message">
            {props.method() === "passkey"
              ? "Passkey registration is not supported in this browser."
              : "Security key registration is not supported in this browser."}
          </p>
        </Match>
        <Match when={state.stage() === "unavailable"}>
          <p class="mfa-mode-description">
            This registration cannot be resumed after a reload. Continue in ZITADEL to finish setup.
          </p>
          <button class="primary" type="button" onClick={() => props.fallbackContinue()} disabled={props.busy()}>
            Continue in ZITADEL
          </button>
        </Match>
        <Match when={state.stage() === "start"}>
          <p class="mfa-mode-description">
            {props.method() === "passkey"
              ? "Register a passkey with biometrics or a device PIN, then verify it once to continue."
              : "Register a hardware security key, then verify it once to continue."}
          </p>
          <form onSubmit={state.submit} novalidate>
            <label for="webauthn-enroll-name">Name (optional)</label>
            <input
              id="webauthn-enroll-name"
              name="displayName"
              type="text"
              autocomplete="off"
              maxlength={mfaWebAuthnDisplayNameMaxLength}
              value={state.displayName()}
              onInput={(event) => {
                const cleaned = state.displayNameInput(event.currentTarget.value)
                if (cleaned !== event.currentTarget.value) event.currentTarget.value = cleaned
              }}
              disabled={props.busy()}
              aria-describedby="webauthn-enroll-name-help"
            />
            <p id="webauthn-enroll-name-help" class="field-help">
              Helps you recognize this device later.
            </p>
            <button class="primary" type="submit" disabled={props.busy()}>
              {props.busy() ? "Registering..." : action()}
            </button>
          </form>
        </Match>
      </Switch>
      <Show when={!props.setupUnavailable && props.showChooser}>
        <button class="back-button" type="button" onClick={props.showChooser} disabled={props.busy()}>
          Back to 2-step choices
        </button>
      </Show>
      <Show when={!props.setupUnavailable}>
        <button class="back-button" type="button" onClick={props.showRootChooser} disabled={props.busy()}>
          Back to methods
        </button>
      </Show>
    </div>
  )
}
