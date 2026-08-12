import { Match, Switch } from "solid-js"

import { passwordResetStateCreate } from "./passwordResetStateCreate"

type PasswordResetPanelProps = {
  apiOrigin: () => string
  errorClear: () => void
  failureSet: (message: string) => void
  focusHeading: () => void
  headingRegister: (element: HTMLHeadingElement) => void
  showLogin: () => void
}

export function PasswordResetPanel(props: PasswordResetPanelProps) {
  const state = passwordResetStateCreate({
    apiOrigin: () => props.apiOrigin(),
    errorClear: () => props.errorClear(),
    failureSet: (message) => props.failureSet(message),
    focusHeading: () => props.focusHeading(),
  })

  return (
    <section aria-labelledby="login-title">
      <Switch>
        <Match when={state.step() === "loading"}>
          <div class="loading-state" role="status">
            <span class="spinner" aria-hidden="true" />
            <p>Checking your reset link...</p>
          </div>
        </Match>
        <Match when={state.step() === "invalid_link"}>
          <div class="intro">
            <p class="step">Password reset</p>
            <h1 ref={props.headingRegister} id="login-title" tabindex="-1">
              This reset link is no longer valid
            </h1>
          </div>
          <button class="back-button" type="button" onClick={props.showLogin}>
            Back to sign-in
          </button>
        </Match>
        <Match when={state.step() === "complete"}>
          <div class="intro">
            <p class="step">Password reset</p>
            <h1 ref={props.headingRegister} id="login-title" tabindex="-1">
              Your password was changed
            </h1>
            <p>Sign in with your new password to continue.</p>
          </div>
          <button class="back-button" type="button" onClick={props.showLogin}>
            Back to sign-in
          </button>
        </Match>
        <Match when={state.step() === "ready"}>
          <div class="intro">
            <p class="step">Password reset</p>
            <h1 ref={props.headingRegister} id="login-title" tabindex="-1">
              Choose a new password
            </h1>
          </div>
          <form onSubmit={state.submit} novalidate>
            <label for="new-password">New password</label>
            <div class="password-input-group">
              <input
                ref={state.passwordInputRegister}
                id="new-password"
                name="new-password"
                type={state.showPassword() ? "text" : "password"}
                autocomplete="new-password"
                required
                maxlength="200"
                value={state.password()}
                onInput={(event) => state.passwordInput(event.currentTarget.value)}
                disabled={state.busy()}
              />
              <button
                class="text-button reveal-button"
                type="button"
                onClick={state.toggleShowPassword}
                disabled={state.busy()}
                aria-label={state.showPassword() ? "Hide password" : "Show password"}
              >
                {state.showPassword() ? "Hide" : "Show"}
              </button>
            </div>
            <label for="confirm-password">Confirm new password</label>
            <input
              id="confirm-password"
              name="confirm-password"
              type={state.showPassword() ? "text" : "password"}
              autocomplete="new-password"
              required
              maxlength="200"
              value={state.confirmation()}
              onInput={(event) => state.confirmationInput(event.currentTarget.value)}
              disabled={state.busy()}
            />
            <button class="primary" type="submit" disabled={state.busy() || !state.valid()}>
              {state.busy() ? "Saving..." : "Set new password"}
            </button>
          </form>
          <button class="back-button" type="button" onClick={props.showLogin} disabled={state.busy()}>
            Back to sign-in
          </button>
        </Match>
      </Switch>
    </section>
  )
}
