import { Show } from "solid-js"

type PasswordPanelProps = {
  identifier: () => string
  password: () => string
  showPassword: () => boolean
  mfaRequired: () => boolean
  busy: () => boolean
  valid: () => boolean
  rememberIdentifier: () => boolean
  headingRegister: (element: HTMLHeadingElement) => void
  identifierInputRegister: (element: HTMLInputElement) => void
  passwordInputRegister: (element: HTMLInputElement) => void
  identifierInput: (value: string) => void
  passwordInput: (value: string) => void
  toggleShowPassword: () => void
  rememberIdentifierChange: (event: Event & { currentTarget: HTMLInputElement }) => void
  submit: (event: SubmitEvent) => void
  showChooser: () => void
  passwordRecoveryAvailable: () => boolean
  passwordRecoveryStart: () => void
}

export function PasswordPanel(props: PasswordPanelProps) {
  return (
    <section aria-labelledby="login-title">
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
          <p class="step">Password</p>
          <h1 ref={props.headingRegister} id="login-title" tabindex="-1">
            Sign in with password
          </h1>
        </div>
        <form onSubmit={props.submit} novalidate>
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
          <label for="password">Password</label>
          <div class="password-input-group">
            <input
              ref={props.passwordInputRegister}
              id="password"
              name="password"
              type={props.showPassword() ? "text" : "password"}
              autocomplete="current-password"
              required
              maxlength="1024"
              value={props.password()}
              onInput={(event) => props.passwordInput(event.currentTarget.value)}
              disabled={props.busy()}
            />
            <button
              class="text-button reveal-button"
              type="button"
              onClick={props.toggleShowPassword}
              disabled={props.busy()}
              aria-label={props.showPassword() ? "Hide password" : "Show password"}
            >
              {props.showPassword() ? "Hide" : "Show"}
            </button>
          </div>
          <Show when={props.passwordRecoveryAvailable()}>
            <button
              class="text-button forgot-password-button"
              type="button"
              onClick={props.passwordRecoveryStart}
              disabled={props.busy()}
            >
              Forgot password?
            </button>
          </Show>
          <label class="remember-field">
            <input
              type="checkbox"
              checked={props.rememberIdentifier()}
              onChange={(event) => props.rememberIdentifierChange(event)}
              disabled={props.busy()}
            />
            Remember this identifier
          </label>
          <button class="primary" type="submit" disabled={props.busy() || !props.valid()}>
            {props.busy() ? "Signing in..." : "Sign in"}
          </button>
        </form>
        <button class="back-button" type="button" onClick={props.showChooser} disabled={props.busy()}>
          Back to methods
        </button>
      </Show>
    </section>
  )
}
