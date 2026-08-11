import { Show } from "solid-js"

type PasskeyPanelProps = {
  identifier: () => string
  options: () => unknown
  mfaRequired: () => boolean
  busy: () => boolean
  isSupported: () => boolean
  rememberIdentifier: () => boolean
  headingRegister: (element: HTMLHeadingElement) => void
  identifierInputRegister: (element: HTMLInputElement) => void
  identifierInput: (value: string) => void
  rememberIdentifierChange: (event: Event & { currentTarget: HTMLInputElement }) => void
  submit: (event?: SubmitEvent) => void
  showChooser: () => void
}

export function PasskeyPanel(props: PasskeyPanelProps) {
  const handleSubmit = (event: SubmitEvent) => {
    event.preventDefault()
    props.submit(event)
  }

  return (
    <section aria-labelledby="login-title">
      <Show
        when={props.isSupported()}
        fallback={
          <div class="unsupported-panel">
            <div class="intro">
              <p class="step">Passkey</p>
              <h1 ref={props.headingRegister} id="login-title" tabindex="-1">
                Passkey not supported
              </h1>
              <p class="notice-message">
                Passkey authentication is not supported in this browser. Please use another sign-in method.
              </p>
            </div>
            <button class="back-button" type="button" onClick={props.showChooser} disabled={props.busy()}>
              Back to methods
            </button>
          </div>
        }
      >
        <Show
          when={!props.mfaRequired()}
          fallback={
            <div class="mfa-placeholder">
              <div class="intro">
                <p class="step">Authentication</p>
                <h1 ref={props.headingRegister} id="login-title" tabindex="-1">
                  2-Step Verification Required
                </h1>
                <p class="mfa-notice">
                  Multi-factor authentication (MFA) is required for this account. MFA support will be enabled in Task 5.
                </p>
              </div>
              <button class="back-button" type="button" onClick={props.showChooser} disabled={props.busy()}>
                Back to methods
              </button>
            </div>
          }
        >
          <div class="intro">
            <p class="step">Passkey</p>
            <h1 ref={props.headingRegister} id="login-title" tabindex="-1">
              Sign in with passkey
            </h1>
          </div>
          <form onSubmit={handleSubmit} novalidate>
            <Show when={!props.options()}>
              <label for="identifier">Username or email</label>
              <input
                ref={props.identifierInputRegister}
                id="identifier"
                name="identifier"
                type="text"
                autocomplete="username"
                inputmode="email"
                required
                maxlength="254"
                value={props.identifier()}
                onInput={(event) => props.identifierInput(event.currentTarget.value)}
                disabled={props.busy()}
              />
              <label class="remember-field">
                <input
                  type="checkbox"
                  checked={props.rememberIdentifier()}
                  onChange={(event) => props.rememberIdentifierChange(event)}
                  disabled={props.busy()}
                />
                Remember this identifier
              </label>
            </Show>
            <button class="primary" type="submit" disabled={props.busy()}>
              {props.busy() ? "Signing in..." : "Sign in with passkey"}
            </button>
          </form>
          <button class="back-button" type="button" onClick={props.showChooser} disabled={props.busy()}>
            Back to methods
          </button>
        </Show>
      </Show>
    </section>
  )
}
