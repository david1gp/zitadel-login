import { Show } from "solid-js"

import { ttc } from "../../i18n/model/ttc"

import { classesBackButton } from "../../ui/classes/classesBackButton"
import { classesCheckbox } from "../../ui/classes/classesCheckbox"
import { classesForgotPasswordButton } from "../../ui/classes/classesForgotPasswordButton"
import { classesHeading } from "../../ui/classes/classesHeading"
import { classesInput } from "../../ui/classes/classesInput"
import { classesIntro } from "../../ui/classes/classesIntro"
import { classesLabel } from "../../ui/classes/classesLabel"
import { classesMfaNotice } from "../../ui/classes/classesMfaNotice"
import { classesPasswordInputGroup } from "../../ui/classes/classesPasswordInputGroup"
import { classesPrimaryButton } from "../../ui/classes/classesPrimaryButton"
import { classesRememberField } from "../../ui/classes/classesRememberField"
import { classesRevealButton } from "../../ui/classes/classesRevealButton"

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
            {ttc("Sign in with password")}
          </h1>
        </div>
        <form onSubmit={props.submit} novalidate>
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
          <label class={classesLabel} for="password">
            {ttc("Password")}
          </label>
          <div class={classesPasswordInputGroup}>
            <input
              ref={props.passwordInputRegister}
              class={classesInput}
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
              class={classesRevealButton}
              type="button"
              onClick={props.toggleShowPassword}
              disabled={props.busy()}
              aria-label={props.showPassword() ? ttc("Hide password") : ttc("Show password")}
            >
              {props.showPassword() ? ttc("Hide") : ttc("Show")}
            </button>
          </div>
          <Show when={props.passwordRecoveryAvailable()}>
            <button
              class={classesForgotPasswordButton}
              type="button"
              onClick={props.passwordRecoveryStart}
              disabled={props.busy()}
            >
              {ttc("Forgot password?")}
            </button>
          </Show>
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
          <button class={classesPrimaryButton} type="submit" disabled={props.busy() || !props.valid()}>
            {props.busy() ? ttc("Signing in...") : ttc("Sign in")}
          </button>
        </form>
        <button class={classesBackButton} type="button" onClick={props.showChooser} disabled={props.busy()}>
          {ttc("Back to methods")}
        </button>
      </Show>
    </section>
  )
}
