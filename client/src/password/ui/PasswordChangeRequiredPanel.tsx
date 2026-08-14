import { ttc } from "../../i18n/model/ttc"
import { classesHeading } from "../../ui/classes/classesHeading"
import { classesInput } from "../../ui/classes/classesInput"
import { classesIntro } from "../../ui/classes/classesIntro"
import { classesIntroCopy } from "../../ui/classes/classesIntroCopy"
import { classesLabel } from "../../ui/classes/classesLabel"
import { classesPasswordInputGroup } from "../../ui/classes/classesPasswordInputGroup"
import { classesPrimaryButton } from "../../ui/classes/classesPrimaryButton"
import { classesRevealButton } from "../../ui/classes/classesRevealButton"
import { passwordChangeRequiredStateCreate } from "./passwordChangeRequiredStateCreate"

type PasswordChangeRequiredPanelProps = {
  apiOrigin: () => string
  flowHandle: () => string
  csrfToken: () => string
  csrfTokenSet: (token: string) => void
  expired: () => boolean
  busy: () => boolean
  busySet: (value: boolean) => void
  headingRegister: (element: HTMLHeadingElement) => void
  errorClear: () => void
  failureSet: (message: string) => void
  fallbackContinue: (path?: string) => void
  statusContinue: (url: string) => void
  transitionApply: (route: string) => void
  fetchFn?: typeof fetch
}

export function PasswordChangeRequiredPanel(props: PasswordChangeRequiredPanelProps) {
  const state = passwordChangeRequiredStateCreate({
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
    transitionApply: props.transitionApply,
    fetchFn: props.fetchFn,
  })

  return (
    <section aria-labelledby="login-title">
      <div class={classesIntro}>
        <h1 ref={props.headingRegister} id="login-title" tabindex="-1" class={classesHeading}>
          {ttc("Change your password")}
        </h1>
        <p class={classesIntroCopy}>
          {props.expired()
            ? ttc("Your password has expired. Set a new password to continue.")
            : ttc("Your password must be changed before you continue.")}
        </p>
      </div>
      <form onSubmit={state.submit} novalidate>
        <label class={classesLabel} for="current-password">
          {ttc("Current password")}
        </label>
        <input
          ref={state.currentPasswordInputRegister}
          class={classesInput}
          id="current-password"
          name="current-password"
          type={state.showPassword() ? "text" : "password"}
          autocomplete="current-password"
          required
          maxlength="200"
          value={state.currentPassword()}
          onInput={(event) => state.currentPasswordInput(event.currentTarget.value)}
          disabled={props.busy()}
        />
        <label class={classesLabel} for="new-password">
          {ttc("New password")}
        </label>
        <div class={classesPasswordInputGroup}>
          <input
            ref={state.newPasswordInputRegister}
            class={classesInput}
            id="new-password"
            name="new-password"
            type={state.showPassword() ? "text" : "password"}
            autocomplete="new-password"
            required
            maxlength="200"
            value={state.newPassword()}
            onInput={(event) => state.newPasswordInput(event.currentTarget.value)}
            disabled={props.busy()}
          />
          <button
            class={classesRevealButton}
            type="button"
            onClick={state.toggleShowPassword}
            disabled={props.busy()}
            aria-label={state.showPassword() ? ttc("Hide password") : ttc("Show password")}
          >
            {state.showPassword() ? ttc("Hide") : ttc("Show")}
          </button>
        </div>
        <label class={classesLabel} for="confirm-password">
          {ttc("Confirm new password")}
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
          disabled={props.busy()}
        />
        <button class={classesPrimaryButton} type="submit" disabled={props.busy() || !state.valid()}>
          {props.busy() ? ttc("Saving...") : ttc("Change password")}
        </button>
      </form>
    </section>
  )
}
