import { Show } from "solid-js"

type EmailOtpPanelProps = {
  step: () => "email" | "code"
  email: () => string
  code: () => string
  busy: () => boolean
  valid: () => boolean
  maskedEmail: () => string
  notice: () => string
  rememberIdentifier: () => boolean
  headingRegister: (element: HTMLHeadingElement) => void
  emailInputRegister: (element: HTMLInputElement) => void
  codeInputRegister: (element: HTMLInputElement) => void
  emailInput: (value: string) => void
  codeInput: (value: string) => void
  rememberIdentifierChange: (event: Event & { currentTarget: HTMLInputElement }) => void
  emailSubmit: (event: SubmitEvent) => void
  codeSubmit: (event: SubmitEvent) => void
  resend: () => void
  emailChange: () => void
  showChooser: () => void
}

export function EmailOtpPanel(props: EmailOtpPanelProps) {
  return (
    <section aria-labelledby="login-title">
      <Show
        when={props.step() === "email"}
        fallback={
          <>
            <div class="intro">
              <p class="step">Email code</p>
              <h1 ref={props.headingRegister} id="login-title" tabindex="-1">
                Check your email
              </h1>
              <p>
                Enter the code sent for <strong>{props.maskedEmail()}</strong>.
              </p>
            </div>
            <form onSubmit={props.codeSubmit} novalidate>
              <label for="code">Verification code</label>
              <input
                ref={props.codeInputRegister}
                class="code-input"
                id="code"
                name="code"
                type="text"
                autocomplete="one-time-code"
                inputmode="numeric"
                pattern="[0-9]{6,20}"
                maxlength="20"
                required
                value={props.code()}
                onInput={(event) => props.codeInput(event.currentTarget.value)}
                disabled={props.busy()}
                aria-describedby="code-help resend-status"
              />
              <p id="code-help" class="field-help">
                Enter 6 to 20 digits.
              </p>
              <button class="primary" type="submit" disabled={props.busy() || props.code().length < 6}>
                {props.busy() ? "Verifying..." : "Continue"}
              </button>
            </form>
            <div class="code-actions">
              <button class="text-button" type="button" onClick={props.resend} disabled={props.busy()}>
                Send a new code
              </button>
              <button class="text-button" type="button" onClick={props.emailChange} disabled={props.busy()}>
                Change email
              </button>
            </div>
            <p id="resend-status" class="success-message" role="status">
              {props.notice()}
            </p>
          </>
        }
      >
        <div class="intro">
          <p class="step">Email code</p>
          <h1 ref={props.headingRegister} id="login-title" tabindex="-1">
            Enter your email
          </h1>
        </div>
        <form onSubmit={props.emailSubmit} novalidate>
          <label for="email">Email address</label>
          <input
            ref={props.emailInputRegister}
            id="email"
            name="email"
            type="email"
            autocomplete="username"
            inputmode="email"
            required
            maxlength="254"
            value={props.email()}
            onInput={(event) => props.emailInput(event.currentTarget.value)}
            disabled={props.busy()}
          />
          <label class="remember-field">
            <input
              type="checkbox"
              checked={props.rememberIdentifier()}
              onChange={(event) => props.rememberIdentifierChange(event)}
              disabled={props.busy()}
            />
            Remember this email
          </label>
          <button class="primary" type="submit" disabled={props.busy() || !props.valid()}>
            {props.busy() ? "Sending..." : "Send code"}
          </button>
        </form>
      </Show>
      <button class="back-button" type="button" onClick={props.showChooser} disabled={props.busy()}>
        Back to methods
      </button>
    </section>
  )
}
