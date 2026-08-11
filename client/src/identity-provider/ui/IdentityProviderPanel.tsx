import { Show } from "solid-js"

import { IdentityProviderIcon } from "./IdentityProviderIcon"

type IdentityProviderPanelProps = {
  providerName: () => string
  providerType: () => string
  subroute: () => "failure" | "account-not-found" | "linking-failed" | "registration-failed" | undefined
  busy: () => boolean
  headingRegister: (element: HTMLHeadingElement) => void
  submit: (event: SubmitEvent) => void
  showChooser: () => void
}

export function IdentityProviderPanel(props: IdentityProviderPanelProps) {
  const isFailure = () => props.subroute() === "failure"
  const isUnlinked = () => props.subroute() === "account-not-found"
  const isLinkingFailed = () => props.subroute() === "linking-failed" || props.subroute() === "registration-failed"

  const stepText = () => (isUnlinked() ? "Account not found" : "Sign in")
  const headingText = () =>
    isUnlinked()
      ? "No account linked"
      : isLinkingFailed()
        ? "Could not link account"
        : `Sign in with ${props.providerName()}`

  return (
    <section aria-labelledby="login-title">
      <div class="intro">
        <p class="step">{stepText()}</p>
        <h1 ref={props.headingRegister} id="login-title" tabindex="-1">
          {headingText()}
        </h1>
      </div>
      <div class="idp-identity-box">
        <IdentityProviderIcon type={props.providerType()} name={props.providerName()} />
        <span class="idp-provider-label">{props.providerName()}</span>
      </div>
      <Show when={isFailure()}>
        <p class="field-help" role="status">
          Sign in with {props.providerName()} was not completed. Please try again.
        </p>
      </Show>
      <Show when={isUnlinked()}>
        <p class="field-help" role="status">
          No ZITADEL account is linked to this {props.providerName()} account. Account linking and self-service
          registration are not enabled yet.
        </p>
      </Show>
      <Show when={isLinkingFailed()}>
        <p class="field-help" role="status">
          Account linking could not be completed. Please try another sign-in method.
        </p>
      </Show>

      <Show
        when={!isUnlinked() && !isLinkingFailed()}
        fallback={
          <button class="primary" type="button" onClick={props.showChooser} disabled={props.busy()}>
            Back to methods
          </button>
        }
      >
        <form onSubmit={props.submit} novalidate>
          <button class="primary idp-submit-button" type="submit" disabled={props.busy()}>
            {isFailure() ? "Try again" : `Continue with ${props.providerName()}`}
          </button>
        </form>
        <button class="back-button" type="button" onClick={props.showChooser} disabled={props.busy()}>
          Back to methods
        </button>
      </Show>
    </section>
  )
}
