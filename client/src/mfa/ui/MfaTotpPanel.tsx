import { Show } from "solid-js"

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
      <div class="intro">
        <p class="step">2-Step Verification</p>
        <h1 ref={props.headingRegister} id="login-title" tabindex="-1">
          Authenticator code
        </h1>
        <p>Enter the 6-digit code from your authenticator app.</p>
      </div>
      <form onSubmit={state.submit} novalidate>
        <label for="totp-code">Authenticator code</label>
        <input
          ref={state.codeInputRegister}
          class="code-input"
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
        <p id="totp-code-help" class="field-help">
          Enter 6 digits.
        </p>
        <button class="primary" type="submit" disabled={props.busy() || !state.valid()}>
          {props.busy() ? "Verifying..." : "Verify"}
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
    </div>
  )
}
