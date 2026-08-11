import { Match, Show, Switch } from "solid-js"

import { loginStateCreate } from "./login/loginStateCreate"

type AppProps = {
  apiOrigin: string
}

export function App(props: AppProps) {
  const state = loginStateCreate(() => props.apiOrigin)

  return (
    <main class="page-shell">
      <section class="login-card" aria-labelledby="login-title" aria-busy={state.busy()}>
        <header class="brand">
          <div class="brand-mark" aria-hidden="true">
            A
          </div>
          <div>
            <p class="eyebrow">Secure access</p>
            <p class="brand-name">Adaptive</p>
          </div>
        </header>

        <div class="content">
          <Switch>
            <Match when={state.stage() === "loading"}>
              <div class="loading-state" role="status">
                <span class="spinner" aria-hidden="true" />
                <p>Preparing your sign-in...</p>
              </div>
            </Match>

            <Match when={state.stage() === "email"}>
              <div class="intro">
                <p class="step">Step 1 of 2</p>
                <h1 id="login-title">Sign in without a password</h1>
                <p>Enter your email address. If email sign-in is available, we will send you a verification code.</p>
              </div>
              <form onSubmit={state.emailSubmit} novalidate>
                <label for="email">Email address</label>
                <input
                  ref={state.emailInputRegister}
                  id="email"
                  name="email"
                  type="email"
                  autocomplete="username"
                  inputmode="email"
                  required
                  maxlength="254"
                  value={state.email()}
                  onInput={state.emailInput}
                  disabled={state.busy()}
                  aria-describedby="email-help error-message"
                />
                <p id="email-help" class="field-help">
                  Use the address connected to your account.
                </p>
                <button class="primary" type="submit" disabled={state.busy() || !state.emailValid()}>
                  <Show when={!state.busy()} fallback={<span class="button-progress">Sending code...</span>}>
                    Email me a code
                  </Show>
                </button>
              </form>
            </Match>

            <Match when={state.stage() === "code"}>
              <div class="intro">
                <p class="step">Step 2 of 2</p>
                <h1 id="login-title">Check your email</h1>
                <p>
                  Enter the verification code sent for <strong>{state.maskedEmail()}</strong>. It may take a moment to
                  arrive.
                </p>
              </div>
              <form onSubmit={state.codeSubmit} novalidate>
                <label for="code">Verification code</label>
                <input
                  ref={state.codeInputRegister}
                  class="code-input"
                  id="code"
                  name="code"
                  type="text"
                  autocomplete="one-time-code"
                  inputmode="numeric"
                  pattern="[0-9]{6,20}"
                  maxlength="20"
                  required
                  value={state.code()}
                  onInput={state.codeInput}
                  disabled={state.busy()}
                  aria-describedby="code-help error-message resend-status"
                />
                <p id="code-help" class="field-help">
                  Codes expire after five minutes.
                </p>
                <button
                  class="primary"
                  type="submit"
                  disabled={state.busy() || state.code().length < 6 || state.code().length > 20}
                >
                  <Show when={!state.busy()} fallback={<span class="button-progress">Verifying...</span>}>
                    Continue securely
                  </Show>
                </button>
              </form>
              <div class="code-actions">
                <button class="text-button" type="button" onClick={state.resend} disabled={state.busy()}>
                  Send a new code
                </button>
                <button class="text-button" type="button" onClick={state.emailChange} disabled={state.busy()}>
                  Use a different email
                </button>
              </div>
              <p id="resend-status" class="success-message" role="status">
                {state.notice()}
              </p>
            </Match>

            <Match when={state.stage() === "continuing"}>
              <div class="loading-state" role="status">
                <span class="spinner" aria-hidden="true" />
                <h1 id="login-title">Sign-in complete</h1>
                <p>Returning you to the application...</p>
              </div>
            </Match>

            <Match when={state.stage() === "fatal"}>
              <div class="intro">
                <p class="step">Unable to continue</p>
                <h1 id="login-title">This sign-in link is not valid</h1>
                <p>Return to the application and start sign-in again.</p>
              </div>
            </Match>
          </Switch>

          <Show when={state.error()}>
            <div ref={state.errorRegister} id="error-message" class="error-message" role="alert" tabindex="-1">
              {state.error()}
            </div>
          </Show>

          <Show when={state.fallbackAvailable() && state.stage() !== "continuing"}>
            <div class="fallback">
              <span>or</span>
              <button class="secondary" type="button" onClick={state.fallback} disabled={state.busy()}>
                Use another sign-in method
              </button>
            </div>
          </Show>
        </div>

        <footer>
          <span class="status-dot" aria-hidden="true" /> Protected by ZITADEL
        </footer>
      </section>
      <p class="privacy-note">Your code is used only to complete this sign-in.</p>
    </main>
  )
}
