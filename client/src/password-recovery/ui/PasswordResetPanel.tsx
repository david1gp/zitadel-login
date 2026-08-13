import { Match, Switch } from "solid-js"

import { classesBackButton } from "../../ui/classes/classesBackButton"
import { classesHeading } from "../../ui/classes/classesHeading"
import { classesInput } from "../../ui/classes/classesInput"
import { classesIntro } from "../../ui/classes/classesIntro"
import { classesIntroCopy } from "../../ui/classes/classesIntroCopy"
import { classesLabel } from "../../ui/classes/classesLabel"
import { classesLoadingState } from "../../ui/classes/classesLoadingState"
import { classesPasswordInputGroup } from "../../ui/classes/classesPasswordInputGroup"
import { classesPrimaryButton } from "../../ui/classes/classesPrimaryButton"
import { classesRevealButton } from "../../ui/classes/classesRevealButton"
import { classesSpinner } from "../../ui/classes/classesSpinner"
import { classesStep } from "../../ui/classes/classesStep"
import { passwordResetStateCreate } from "./passwordResetStateCreate"

type PasswordResetPanelProps = {
  apiOrigin: () => string
  errorClear: () => void
  failureSet: (message: string) => void
  focusHeading: () => void
  headingRegister: (element: HTMLHeadingElement) => void
  showLogin: () => void
  fetchFn?: typeof fetch
  initialStep?: "loading" | "ready" | "invalid_link" | "complete"
}

export function PasswordResetPanel(props: PasswordResetPanelProps) {
  const state = passwordResetStateCreate({
    apiOrigin: () => props.apiOrigin(),
    errorClear: () => props.errorClear(),
    failureSet: (message) => props.failureSet(message),
    focusHeading: () => props.focusHeading(),
    fetchFn: props.fetchFn,
    initialStep: props.initialStep,
  })

  return (
    <section aria-labelledby="login-title">
      <Switch>
        <Match when={state.step() === "loading"}>
          <div class={classesLoadingState} role="status">
            <span class={classesSpinner} aria-hidden="true" />
            <h1 ref={props.headingRegister} id="login-title" tabindex="-1">
              Checking your reset link...
            </h1>
          </div>
        </Match>
        <Match when={state.step() === "invalid_link"}>
          <div class={classesIntro}>
            <p class={classesStep}>Password reset</p>
            <h1 ref={props.headingRegister} id="login-title" tabindex="-1" class={classesHeading}>
              This reset link is no longer valid
            </h1>
          </div>
          <button class={classesBackButton} type="button" onClick={props.showLogin}>
            Back to sign-in
          </button>
        </Match>
        <Match when={state.step() === "complete"}>
          <div class={classesIntro}>
            <p class={classesStep}>Password reset</p>
            <h1 ref={props.headingRegister} id="login-title" tabindex="-1" class={classesHeading}>
              Your password was changed
            </h1>
            <p class={classesIntroCopy}>Sign in with your new password to continue.</p>
          </div>
          <button class={classesBackButton} type="button" onClick={props.showLogin}>
            Back to sign-in
          </button>
        </Match>
        <Match when={state.step() === "ready"}>
          <div class={classesIntro}>
            <p class={classesStep}>Password reset</p>
            <h1 ref={props.headingRegister} id="login-title" tabindex="-1" class={classesHeading}>
              Choose a new password
            </h1>
          </div>
          <form onSubmit={state.submit} novalidate>
            <label class={classesLabel} for="new-password">
              New password
            </label>
            <div class={classesPasswordInputGroup}>
              <input
                ref={state.passwordInputRegister}
                class={classesInput}
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
                class={classesRevealButton}
                type="button"
                onClick={state.toggleShowPassword}
                disabled={state.busy()}
                aria-label={state.showPassword() ? "Hide password" : "Show password"}
              >
                {state.showPassword() ? "Hide" : "Show"}
              </button>
            </div>
            <label class={classesLabel} for="confirm-password">
              Confirm new password
            </label>
            <input
              class={classesInput}
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
            <button class={classesPrimaryButton} type="submit" disabled={state.busy() || !state.valid()}>
              {state.busy() ? "Saving..." : "Set new password"}
            </button>
          </form>
          <button class={classesBackButton} type="button" onClick={props.showLogin} disabled={state.busy()}>
            Back to sign-in
          </button>
        </Match>
      </Switch>
    </section>
  )
}
