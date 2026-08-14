import { Match, Show, Switch } from "solid-js"
import { classesBackButton } from "../../ui/classes/classesBackButton"
import { classesCodeInput } from "../../ui/classes/classesCodeInput"
import { classesFieldHelp } from "../../ui/classes/classesFieldHelp"
import { classesHeading } from "../../ui/classes/classesHeading"
import { classesIntro } from "../../ui/classes/classesIntro"
import { classesIntroCopy } from "../../ui/classes/classesIntroCopy"
import { classesLabel } from "../../ui/classes/classesLabel"
import { classesNoticeMessage } from "../../ui/classes/classesNoticeMessage"
import { classesPrimaryButton } from "../../ui/classes/classesPrimaryButton"
import { classesResendSection } from "../../ui/classes/classesResendSection"
import { classesSecondaryButton } from "../../ui/classes/classesSecondaryButton"
import { mfaEmailOtpStateCreate } from "./mfaEmailOtpStateCreate"

type MfaEmailOtpPanelProps = {
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
  isEnrollment?: boolean
  codePending?: boolean
}

export function MfaEmailOtpPanel(props: MfaEmailOtpPanelProps) {
  const state = mfaEmailOtpStateCreate({
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
    isEnrollment: props.isEnrollment,
    codePending: props.codePending,
  })

  return (
    <div>
      <Switch>
        <Match when={state.stage() === "send"}>
          <div class={classesIntro}>
            <h1 ref={props.headingRegister} id="login-title" tabindex="-1" class={classesHeading}>
              Email code
            </h1>
            <p class={classesIntroCopy}>Send a verification code to your email address.</p>
          </div>
          <button class={classesPrimaryButton} type="button" onClick={state.sendCode} disabled={props.busy()}>
            {props.busy() ? "Sending code..." : "Send code"}
          </button>
          <Show when={props.showChooser}>
            <button class={classesBackButton} type="button" onClick={props.showChooser} disabled={props.busy()}>
              Back to 2-step choices
            </button>
          </Show>
          <button class={classesBackButton} type="button" onClick={props.showRootChooser} disabled={props.busy()}>
            Back to methods
          </button>
        </Match>

        <Match when={state.stage() === "enroll"}>
          <div class={classesIntro}>
            <h1 ref={props.headingRegister} id="login-title" tabindex="-1" class={classesHeading}>
              Set up email codes
            </h1>
            <p class={classesIntroCopy}>Verification codes will be sent to your account email address.</p>
          </div>
          <button
            class={classesPrimaryButton}
            type="button"
            onClick={() => void state.enroll()}
            disabled={props.busy()}
          >
            {props.busy() ? "Setting up..." : "Set up email codes"}
          </button>
          <Show when={props.showChooser}>
            <button class={classesBackButton} type="button" onClick={props.showChooser} disabled={props.busy()}>
              Back to 2-step choices
            </button>
          </Show>
          <button class={classesBackButton} type="button" onClick={props.showRootChooser} disabled={props.busy()}>
            Back to methods
          </button>
        </Match>

        <Match when={state.stage() === "code"}>
          <div class={classesIntro}>
            <h1 ref={props.headingRegister} id="login-title" tabindex="-1" class={classesHeading}>
              Email verification code
            </h1>
            <p class={classesIntroCopy}>Enter the 6-20 digit code sent to your email address.</p>
          </div>
          <Show when={state.notice()}>
            <p class={classesNoticeMessage} role="status">
              {state.notice()}
            </p>
          </Show>
          <form onSubmit={state.submit} novalidate>
            <label class={classesLabel} for="mfa-email-code">
              Verification code
            </label>
            <input
              ref={state.codeInputRegister}
              class={classesCodeInput}
              id="mfa-email-code"
              name="code"
              type="text"
              autocomplete="one-time-code"
              inputmode="numeric"
              pattern="[A-Za-z0-9-]{6,20}"
              maxlength="20"
              required
              value={state.code()}
              onInput={(event) => {
                const raw = event.currentTarget.value
                const cleaned = state.codeInput(raw)
                if (cleaned !== raw) {
                  event.currentTarget.value = cleaned
                }
              }}
              disabled={props.busy()}
              aria-describedby="mfa-email-code-help"
            />
            <p id="mfa-email-code-help" class={classesFieldHelp}>
              Enter 6 to 20 digits.
            </p>
            <button class={classesPrimaryButton} type="submit" disabled={props.busy() || !state.valid()}>
              {props.busy() ? "Verifying..." : "Verify"}
            </button>
          </form>
          <div class={classesResendSection}>
            <button
              class={classesSecondaryButton}
              type="button"
              onClick={state.resendCode}
              disabled={props.busy() || !state.resendAllowed()}
              aria-describedby={state.countdown() > 0 ? "mfa-email-otp-resend-countdown" : undefined}
            >
              Resend code
            </button>
            <Show when={state.countdown() > 0}>
              <p id="mfa-email-otp-resend-countdown" class={classesFieldHelp} aria-live="polite" aria-atomic="true">
                Another code can be sent in {state.countdown()} seconds.
              </p>
            </Show>
          </div>
          <Show when={props.showChooser}>
            <button class={classesBackButton} type="button" onClick={props.showChooser} disabled={props.busy()}>
              Back to 2-step choices
            </button>
          </Show>
          <button class={classesBackButton} type="button" onClick={props.showRootChooser} disabled={props.busy()}>
            Back to methods
          </button>
        </Match>
      </Switch>
    </div>
  )
}
