import { Show } from "solid-js"

import { ttc } from "../../i18n/model/ttc"
import { classesBackButton } from "../../ui/classes/classesBackButton"
import { classesCheckbox } from "../../ui/classes/classesCheckbox"
import { classesCodeActions } from "../../ui/classes/classesCodeActions"
import { classesCodeInput } from "../../ui/classes/classesCodeInput"
import { classesFieldHelp } from "../../ui/classes/classesFieldHelp"
import { classesHeading } from "../../ui/classes/classesHeading"
import { classesInput } from "../../ui/classes/classesInput"
import { classesIntro } from "../../ui/classes/classesIntro"
import { classesIntroCopy } from "../../ui/classes/classesIntroCopy"
import { classesLabel } from "../../ui/classes/classesLabel"
import { classesNoticeMessage } from "../../ui/classes/classesNoticeMessage"
import { classesPrimaryButton } from "../../ui/classes/classesPrimaryButton"
import { classesRememberField } from "../../ui/classes/classesRememberField"
import { classesTextButton } from "../../ui/classes/classesTextButton"

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
  resendAllowed: () => boolean
  resendCountdown: () => number
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
            <div class={classesIntro}>
              <h1 ref={props.headingRegister} id="login-title" tabindex="-1" class={classesHeading}>
                {ttc("Check your email")}
              </h1>
              <p class={classesIntroCopy}>
                {ttc("Enter the code sent for {email}.").replace("{email}", props.maskedEmail())}
              </p>
            </div>
            <form onSubmit={props.codeSubmit} novalidate>
              <label class={classesLabel} for="code">
                {ttc("Verification code")}
              </label>
              <input
                ref={props.codeInputRegister}
                class={classesCodeInput}
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
              <p id="code-help" class={classesFieldHelp}>
                {ttc("Enter 6 to 20 digits.")}
              </p>
              <button class={classesPrimaryButton} type="submit" disabled={props.busy() || props.code().length < 6}>
                {props.busy() ? ttc("Verifying...") : ttc("Continue")}
              </button>
            </form>
            <div class={classesCodeActions}>
              <button
                class={classesTextButton}
                type="button"
                onClick={props.resend}
                disabled={props.busy() || !props.resendAllowed()}
                aria-describedby={props.resendCountdown() > 0 ? "email-otp-resend-countdown" : undefined}
              >
                {ttc("Send a new code")}
              </button>
              <button class={classesTextButton} type="button" onClick={props.emailChange} disabled={props.busy()}>
                {ttc("Change email")}
              </button>
            </div>
            <Show when={props.resendCountdown() > 0}>
              <p id="email-otp-resend-countdown" class={classesFieldHelp} aria-live="polite" aria-atomic="true">
                {ttc("Another code can be sent in {seconds} seconds.").replace(
                  "{seconds}",
                  String(props.resendCountdown()),
                )}
              </p>
            </Show>
            <p id="resend-status" class={classesNoticeMessage} role="status">
              {ttc(props.notice())}
            </p>
          </>
        }
      >
        <div class={classesIntro}>
          <h1 ref={props.headingRegister} id="login-title" tabindex="-1" class={classesHeading}>
            {ttc("Enter your email")}
          </h1>
        </div>
        <form onSubmit={props.emailSubmit} novalidate>
          <label class={classesLabel} for="email">
            {ttc("Email address")}
          </label>
          <input
            ref={props.emailInputRegister}
            class={classesInput}
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
          <label class={classesRememberField}>
            <input
              class={classesCheckbox}
              type="checkbox"
              checked={props.rememberIdentifier()}
              onChange={(event) => props.rememberIdentifierChange(event)}
              disabled={props.busy()}
            />
            {ttc("Remember this email")}
          </label>
          <button class={classesPrimaryButton} type="submit" disabled={props.busy() || !props.valid()}>
            {props.busy() ? ttc("Sending...") : ttc("Send code")}
          </button>
        </form>
      </Show>
      <button class={classesBackButton} type="button" onClick={props.showChooser} disabled={props.busy()}>
        {ttc("Back to methods")}
      </button>
    </section>
  )
}
