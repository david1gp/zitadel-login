import { Match, Show, Switch } from "solid-js"

import { ttc } from "../../i18n/model/ttc"
import type { PasskeyOptions } from "../../passkey/model/passkeyOptionsSchema"
import { classesBackButton } from "../../ui/classes/classesBackButton"
import { classesFieldHelp } from "../../ui/classes/classesFieldHelp"
import { classesHeading } from "../../ui/classes/classesHeading"
import { classesInput } from "../../ui/classes/classesInput"
import { classesIntro } from "../../ui/classes/classesIntro"
import { classesLabel } from "../../ui/classes/classesLabel"
import { classesMfaDescription } from "../../ui/classes/classesMfaDescription"
import { classesNoticeMessage } from "../../ui/classes/classesNoticeMessage"
import { classesPrimaryButton } from "../../ui/classes/classesPrimaryButton"
import {
  mfaWebAuthnDisplayNameMaxLength,
  mfaWebAuthnEnrollStateCreate,
  type PasskeyCredentialsCreate,
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
  enrollmentPendingSet?: (value: boolean) => void
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
    enrollmentPendingSet: props.enrollmentPendingSet,
    assertionStart: props.assertionStart,
    optionsReload: props.optionsReload,
    credentialsCreate: props.credentialsCreate,
    isSupported: props.isSupported,
    fetchFn: props.fetchFn,
    setupUnavailable: props.setupUnavailable,
  })

  return (
    <div>
      <div class={classesIntro}>
        <h1 ref={props.headingRegister} id="login-title" tabindex="-1" class={classesHeading}>
          {ttc(props.method() === "passkey" ? "Set up a passkey" : "Set up a security key")}
        </h1>
      </div>
      <Switch>
        <Match when={!state.isSupported()}>
          <p class={classesNoticeMessage}>
            {ttc(
              props.method() === "passkey"
                ? "Passkey registration is not supported in this browser."
                : "Security key registration is not supported in this browser.",
            )}
          </p>
        </Match>
        <Match when={state.stage() === "unavailable"}>
          <p class={classesMfaDescription}>
            {ttc("This registration cannot be resumed after a reload. Continue in ZITADEL to finish setup.")}
          </p>
          <button
            class={classesPrimaryButton}
            type="button"
            onClick={() => props.fallbackContinue()}
            disabled={props.busy()}
          >
            {ttc("Continue in ZITADEL")}
          </button>
        </Match>
        <Match when={state.stage() === "start"}>
          <p class={classesMfaDescription}>
            {ttc(
              props.method() === "passkey"
                ? "Register a passkey with biometrics or a device PIN, then verify it once to continue."
                : "Register a hardware security key, then verify it once to continue.",
            )}
          </p>
          <form onSubmit={state.submit} novalidate>
            <label class={classesLabel} for="webauthn-enroll-name">
              {ttc("Name (optional)")}
            </label>
            <input
              class={classesInput}
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
            <p id="webauthn-enroll-name-help" class={classesFieldHelp}>
              {ttc("Helps you recognize this device later.")}
            </p>
            <button class={classesPrimaryButton} type="submit" disabled={props.busy()}>
              {props.busy()
                ? ttc("Registering...")
                : ttc(props.method() === "passkey" ? "Create passkey" : "Register security key")}
            </button>
          </form>
        </Match>
      </Switch>
      <Show when={!props.setupUnavailable && props.showChooser}>
        <button class={classesBackButton} type="button" onClick={props.showChooser} disabled={props.busy()}>
          {ttc("Back to 2-step choices")}
        </button>
      </Show>
      <Show when={!props.setupUnavailable}>
        <button class={classesBackButton} type="button" onClick={props.showRootChooser} disabled={props.busy()}>
          {ttc("Back to methods")}
        </button>
      </Show>
    </div>
  )
}
