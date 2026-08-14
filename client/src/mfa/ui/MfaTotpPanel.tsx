import { Show } from "solid-js"
import { ttc } from "../../i18n/model/ttc"
import { classesBackButton } from "../../ui/classes/classesBackButton"
import { classesCodeInput } from "../../ui/classes/classesCodeInput"
import { classesFieldHelp } from "../../ui/classes/classesFieldHelp"
import { classesHeading } from "../../ui/classes/classesHeading"
import { classesIntro } from "../../ui/classes/classesIntro"
import { classesIntroCopy } from "../../ui/classes/classesIntroCopy"
import { classesLabel } from "../../ui/classes/classesLabel"
import { classesPrimaryButton } from "../../ui/classes/classesPrimaryButton"
import { mfaTotpStateCreate } from "./mfaTotpStateCreate"

type MfaTotpPanelProps = {
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
}

export function MfaTotpPanel(props: MfaTotpPanelProps) {
  const state = mfaTotpStateCreate({
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
    showChooser: props.showChooser,
    showRootChooser: props.showRootChooser,
    fetchFn: props.fetchFn,
  })

  return (
    <div>
      <div class={classesIntro}>
        <h1 ref={props.headingRegister} id="login-title" tabindex="-1" class={classesHeading}>
          {ttc("Authenticator code")}
        </h1>
        <p class={classesIntroCopy}>{ttc("Enter the 6-digit code from your authenticator app.")}</p>
      </div>
      <form onSubmit={state.submit} novalidate>
        <label class={classesLabel} for="totp-code">
          {ttc("Authenticator code")}
        </label>
        <input
          ref={state.codeInputRegister}
          class={classesCodeInput}
          id="totp-code"
          name="code"
          type="text"
          autocomplete="one-time-code"
          inputmode="numeric"
          pattern="[0-9]{6}"
          maxlength="6"
          required
          value={state.code()}
          onInput={(event) => {
            const raw = event.currentTarget.value
            const cleaned = raw.replace(/\D/g, "").slice(0, 6)
            if (cleaned !== raw) {
              event.currentTarget.value = cleaned
            }
            state.codeInput(cleaned)
          }}
          disabled={props.busy()}
          aria-describedby="totp-code-help"
        />
        <p id="totp-code-help" class={classesFieldHelp}>
          {ttc("Enter 6 digits.")}
        </p>
        <button class={classesPrimaryButton} type="submit" disabled={props.busy() || !state.valid()}>
          {props.busy() ? ttc("Verifying...") : ttc("Verify")}
        </button>
      </form>
      <Show when={props.showChooser}>
        <button class={classesBackButton} type="button" onClick={props.showChooser} disabled={props.busy()}>
          {ttc("Back to 2-step choices")}
        </button>
      </Show>
      <button class={classesBackButton} type="button" onClick={props.showRootChooser} disabled={props.busy()}>
        {ttc("Back to methods")}
      </button>
    </div>
  )
}
