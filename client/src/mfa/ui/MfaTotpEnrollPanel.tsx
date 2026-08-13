import { For, Match, Show, Switch } from "solid-js"
import { classesBackButton } from "../../ui/classes/classesBackButton"
import { classesCodeInput } from "../../ui/classes/classesCodeInput"
import { classesFieldHelp } from "../../ui/classes/classesFieldHelp"
import { classesHeading } from "../../ui/classes/classesHeading"
import { classesIntro } from "../../ui/classes/classesIntro"
import { classesLabel } from "../../ui/classes/classesLabel"
import { classesMfaDescription } from "../../ui/classes/classesMfaDescription"
import { classesPrimaryButton } from "../../ui/classes/classesPrimaryButton"
import { classesSecondaryButton } from "../../ui/classes/classesSecondaryButton"
import { classesStep } from "../../ui/classes/classesStep"
import { classesTotpQr } from "../../ui/classes/classesTotpQr"
import { classesTotpQrBackground } from "../../ui/classes/classesTotpQrBackground"
import { classesTotpQrModules } from "../../ui/classes/classesTotpQrModules"
import { classesTotpSecret } from "../../ui/classes/classesTotpSecret"
import { classesTotpSecretLabel } from "../../ui/classes/classesTotpSecretLabel"
import { classesTotpSecretValue } from "../../ui/classes/classesTotpSecretValue"
import { mfaTotpEnrollStateCreate } from "./mfaTotpEnrollStateCreate"

type MfaTotpEnrollPanelProps = {
  apiOrigin: () => string
  flowHandle: () => string
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
  fetchFn?: typeof fetch
  setupUnavailable?: boolean
}

export function MfaTotpEnrollPanel(props: MfaTotpEnrollPanelProps) {
  const state = mfaTotpEnrollStateCreate({
    apiOrigin: props.apiOrigin,
    flowHandle: props.flowHandle,
    csrfToken: props.csrfToken,
    csrfTokenSet: props.csrfTokenSet,
    busy: props.busy,
    busySet: props.busySet,
    errorClear: props.errorClear,
    failureSet: props.failureSet,
    fallbackContinue: props.fallbackContinue,
    statusContinue: props.statusContinue,
    optionsReload: props.optionsReload,
    fetchFn: props.fetchFn,
    setupUnavailable: props.setupUnavailable,
  })

  return (
    <div>
      <div class={classesIntro}>
        <p class={classesStep}>2-Step Verification</p>
        <h1 ref={props.headingRegister} id="login-title" tabindex="-1" class={classesHeading}>
          Set up authenticator app
        </h1>
      </div>
      <Switch>
        <Match when={state.stage() === "start"}>
          <p class={classesMfaDescription}>
            Use an authenticator app such as 1Password, Google Authenticator, or Aegis to generate 6-digit codes.
          </p>
          <button class={classesPrimaryButton} type="button" onClick={() => void state.start()} disabled={props.busy()}>
            {props.busy() ? "Starting setup..." : "Start setup"}
          </button>
        </Match>

        <Match when={state.stage() === "unavailable"}>
          <p class={classesMfaDescription}>
            Authenticator setup could not be prepared here. The setup details cannot be restored after a reload.
          </p>
          <button
            class={classesPrimaryButton}
            type="button"
            onClick={() => props.fallbackContinue()}
            disabled={props.busy()}
          >
            Continue in ZITADEL
          </button>
        </Match>

        <Match when={state.stage() === "setup"}>
          <p class={classesMfaDescription}>
            Scan the code with your authenticator app, then enter the 6-digit code it shows.
          </p>
          <Show when={state.qr()}>
            {(qr) => (
              <svg
                class={classesTotpQr}
                role="img"
                aria-label="QR code for authenticator app setup"
                viewBox={`0 0 ${qr().viewBoxSize} ${qr().viewBoxSize}`}
                shape-rendering="crispEdges"
              >
                <rect class={classesTotpQrBackground} width={qr().viewBoxSize} height={qr().viewBoxSize} />
                <path class={classesTotpQrModules} d={qr().path} />
              </svg>
            )}
          </Show>
          <div class={classesTotpSecret} role="group" aria-labelledby="totp-secret-label">
            <p id="totp-secret-label" class={classesTotpSecretLabel}>
              Setup key (if you cannot scan)
            </p>
            <Show
              when={state.secretVisible()}
              fallback={
                <button
                  class={classesSecondaryButton}
                  type="button"
                  onClick={state.secretVisibleToggle}
                  aria-describedby="totp-secret-label"
                >
                  Show setup key
                </button>
              }
            >
              <p class={classesTotpSecretValue}>
                <For each={state.secretGroups()}>{(group) => <span>{group}</span>}</For>
              </p>
              <button class={classesSecondaryButton} type="button" onClick={state.secretVisibleToggle}>
                Hide setup key
              </button>
            </Show>
          </div>
          <form onSubmit={state.submit} novalidate>
            <label class={classesLabel} for="totp-enroll-code">
              Authenticator code
            </label>
            <input
              ref={state.codeInputRegister}
              class={classesCodeInput}
              id="totp-enroll-code"
              name="code"
              type="text"
              autocomplete="one-time-code"
              inputmode="numeric"
              pattern="[0-9]{6}"
              maxlength="6"
              required
              value={state.code()}
              onInput={(event) => {
                const cleaned = state.codeInput(event.currentTarget.value)
                if (cleaned !== event.currentTarget.value) {
                  event.currentTarget.value = cleaned
                }
              }}
              disabled={props.busy()}
              aria-describedby="totp-enroll-code-help"
            />
            <p id="totp-enroll-code-help" class={classesFieldHelp}>
              Enter 6 digits.
            </p>
            <button class={classesPrimaryButton} type="submit" disabled={props.busy() || !state.valid()}>
              {props.busy() ? "Verifying..." : "Activate"}
            </button>
          </form>
        </Match>
      </Switch>
      <Show when={!props.setupUnavailable && props.showChooser}>
        <button class={classesBackButton} type="button" onClick={props.showChooser} disabled={props.busy()}>
          Back to 2-step choices
        </button>
      </Show>
      <Show when={!props.setupUnavailable}>
        <button class={classesBackButton} type="button" onClick={props.showRootChooser} disabled={props.busy()}>
          Back to methods
        </button>
      </Show>
    </div>
  )
}
