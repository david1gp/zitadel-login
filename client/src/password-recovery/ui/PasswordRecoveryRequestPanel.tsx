import { Match, Switch } from "solid-js"

import { passwordRecoveryRequestStateCreate } from "./passwordRecoveryRequestStateCreate"

type PasswordRecoveryRequestPanelProps = {
  apiOrigin: () => string
  errorClear: () => void
  failureSet: (message: string) => void
  focusHeading: () => void
  headingRegister: (element: HTMLHeadingElement) => void
  showLogin: () => void
}

export function PasswordRecoveryRequestPanel(props: PasswordRecoveryRequestPanelProps) {
  const state = passwordRecoveryRequestStateCreate({
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
            <p>Loading password recovery...</p>
          </div>
        </Match>
        <Match when={state.step() === "sent"}>
          <div class="intro">
            <p class="step">Password recovery</p>
            <h1 ref={props.headingRegister} id="login-title" tabindex="-1">
              Check your email
            </h1>
            <p>If an account matches that email address, we sent a password reset link.</p>
          </div>
          <button class="back-button" type="button" onClick={props.showLogin}>
            Back to sign-in
          </button>
        </Match>
        <Match when={state.step() === "fatal"}>
          <div class="intro">
            <p class="step">Password recovery</p>
            <h1 ref={props.headingRegister} id="login-title" tabindex="-1">
              Password recovery unavailable
            </h1>
          </div>
          <button class="back-button" type="button" onClick={props.showLogin}>
            Back to sign-in
          </button>
        </Match>
        <Match when={state.step() === "email"}>
          <div class="intro">
            <p class="step">Password recovery</p>
            <h1 ref={props.headingRegister} id="login-title" tabindex="-1">
              Reset your password
            </h1>
          </div>
          <form onSubmit={state.submit} novalidate>
            <label for="recovery-email">Email address</label>
            <input
              ref={state.emailInputRegister}
              id="recovery-email"
              name="email"
              type="email"
              autocomplete="username"
              inputmode="email"
              required
              maxlength="254"
              value={state.email()}
              onInput={(event) => state.emailInput(event.currentTarget.value)}
              disabled={state.busy()}
            />
            <button class="primary" type="submit" disabled={state.busy() || !state.valid()}>
              {state.busy() ? "Sending..." : "Send reset link"}
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
