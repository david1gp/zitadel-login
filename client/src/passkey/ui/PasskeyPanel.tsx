import { Show } from "solid-js"

import { ttc } from "../../i18n/model/ttc"
import { classesBackButton } from "../../ui/classes/classesBackButton"
import { classesCheckbox } from "../../ui/classes/classesCheckbox"
import { classesHeading } from "../../ui/classes/classesHeading"
import { classesInput } from "../../ui/classes/classesInput"
import { classesIntro } from "../../ui/classes/classesIntro"
import { classesLabel } from "../../ui/classes/classesLabel"
import { classesMfaNotice } from "../../ui/classes/classesMfaNotice"
import { classesNoticeMessage } from "../../ui/classes/classesNoticeMessage"
import { classesPrimaryButton } from "../../ui/classes/classesPrimaryButton"
import { classesRememberField } from "../../ui/classes/classesRememberField"

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
          <div>
            <div class={classesIntro}>
              <h1 ref={props.headingRegister} id="login-title" tabindex="-1" class={classesHeading}>
                {ttc("Passkey not supported")}
              </h1>
              <p class={classesNoticeMessage}>
                {ttc("Passkey authentication is not supported in this browser. Please use another sign-in method.")}
              </p>
            </div>
            <button class={classesBackButton} type="button" onClick={props.showChooser} disabled={props.busy()}>
              {ttc("Back to methods")}
            </button>
          </div>
        }
      >
        <Show
          when={!props.mfaRequired()}
          fallback={
            <div>
              <div class={classesIntro}>
                <h1 ref={props.headingRegister} id="login-title" tabindex="-1" class={classesHeading}>
                  {ttc("2-Step Verification Required")}
                </h1>
                <p class={classesMfaNotice}>
                  {ttc(
                    "Multi-factor authentication (MFA) is required for this account. MFA support will be enabled in Task 5.",
                  )}
                </p>
              </div>
              <button class={classesBackButton} type="button" onClick={props.showChooser} disabled={props.busy()}>
                {ttc("Back to methods")}
              </button>
            </div>
          }
        >
          <div class={classesIntro}>
            <h1 ref={props.headingRegister} id="login-title" tabindex="-1" class={classesHeading}>
              {ttc("Sign in with passkey")}
            </h1>
          </div>
          <form onSubmit={handleSubmit} novalidate>
            <Show when={!props.options()}>
              <label class={classesLabel} for="identifier">
                {ttc("Username or email")}
              </label>
              <input
                ref={props.identifierInputRegister}
                class={classesInput}
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
              <label class={classesRememberField}>
                <input
                  class={classesCheckbox}
                  type="checkbox"
                  checked={props.rememberIdentifier()}
                  onChange={(event) => props.rememberIdentifierChange(event)}
                  disabled={props.busy()}
                />
                {ttc("Remember this identifier")}
              </label>
            </Show>
            <button class={classesPrimaryButton} type="submit" disabled={props.busy()}>
              {props.busy() ? ttc("Signing in...") : ttc("Sign in with passkey")}
            </button>
          </form>
          <button class={classesBackButton} type="button" onClick={props.showChooser} disabled={props.busy()}>
            {ttc("Back to methods")}
          </button>
        </Show>
      </Show>
    </section>
  )
}
