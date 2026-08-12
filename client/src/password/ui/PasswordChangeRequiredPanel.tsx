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
      <div class="intro">
        <p class="step">Password change</p>
        <h1 ref={props.headingRegister} id="login-title" tabindex="-1">
          Change your password
        </h1>
        <p>
          {props.expired()
            ? "Your password has expired. Set a new password to continue."
            : "Your password must be changed before you continue."}
        </p>
      </div>
      <form onSubmit={state.submit} novalidate>
        <label for="current-password">Current password</label>
        <input
          ref={state.currentPasswordInputRegister}
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
        <label for="new-password">New password</label>
        <div class="password-input-group">
          <input
            ref={state.newPasswordInputRegister}
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
            class="text-button reveal-button"
            type="button"
            onClick={state.toggleShowPassword}
            disabled={props.busy()}
            aria-label={state.showPassword() ? "Hide password" : "Show password"}
          >
            {state.showPassword() ? "Hide" : "Show"}
          </button>
        </div>
        <label for="confirm-password">Confirm new password</label>
        <input
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
        <button class="primary" type="submit" disabled={props.busy() || !state.valid()}>
          {props.busy() ? "Saving..." : "Change password"}
        </button>
      </form>
    </section>
  )
}
