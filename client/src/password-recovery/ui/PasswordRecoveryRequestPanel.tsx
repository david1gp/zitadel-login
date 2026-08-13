import { Match, Switch } from "solid-js"

import { classesBackButton } from "../../ui/classes/classesBackButton"
import { classesHeading } from "../../ui/classes/classesHeading"
import { classesInput } from "../../ui/classes/classesInput"
import { classesIntro } from "../../ui/classes/classesIntro"
import { classesIntroCopy } from "../../ui/classes/classesIntroCopy"
import { classesLabel } from "../../ui/classes/classesLabel"
import { classesLoadingState } from "../../ui/classes/classesLoadingState"
import { classesPrimaryButton } from "../../ui/classes/classesPrimaryButton"
import { classesSpinner } from "../../ui/classes/classesSpinner"
import { classesStep } from "../../ui/classes/classesStep"
import { passwordRecoveryRequestStateCreate } from "./passwordRecoveryRequestStateCreate"

type PasswordRecoveryRequestPanelProps = {
  apiOrigin: () => string
  errorClear: () => void
  failureSet: (message: string) => void
  focusHeading: () => void
  headingRegister: (element: HTMLHeadingElement) => void
  showLogin: () => void
  fetchFn?: typeof fetch
  initialStep?: "loading" | "email" | "sent" | "fatal"
}

export function PasswordRecoveryRequestPanel(props: PasswordRecoveryRequestPanelProps) {
  const state = passwordRecoveryRequestStateCreate({
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
              Loading password recovery...
            </h1>
          </div>
        </Match>
        <Match when={state.step() === "sent"}>
          <div class={classesIntro}>
            <p class={classesStep}>Password recovery</p>
            <h1 ref={props.headingRegister} id="login-title" tabindex="-1" class={classesHeading}>
              Check your email
            </h1>
            <p class={classesIntroCopy}>If an account matches that email address, we sent a password reset link.</p>
          </div>
          <button class={classesBackButton} type="button" onClick={props.showLogin}>
            Back to sign-in
          </button>
        </Match>
        <Match when={state.step() === "fatal"}>
          <div class={classesIntro}>
            <p class={classesStep}>Password recovery</p>
            <h1 ref={props.headingRegister} id="login-title" tabindex="-1" class={classesHeading}>
              Password recovery unavailable
            </h1>
          </div>
          <button class={classesBackButton} type="button" onClick={props.showLogin}>
            Back to sign-in
          </button>
        </Match>
        <Match when={state.step() === "email"}>
          <div class={classesIntro}>
            <p class={classesStep}>Password recovery</p>
            <h1 ref={props.headingRegister} id="login-title" tabindex="-1" class={classesHeading}>
              Reset your password
            </h1>
          </div>
          <form onSubmit={state.submit} novalidate>
            <label class={classesLabel} for="recovery-email">
              Email address
            </label>
            <input
              ref={state.emailInputRegister}
              class={classesInput}
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
            <button class={classesPrimaryButton} type="submit" disabled={state.busy() || !state.valid()}>
              {state.busy() ? "Sending..." : "Send reset link"}
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
