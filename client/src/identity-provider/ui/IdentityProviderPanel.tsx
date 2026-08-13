import { Show } from "solid-js"

import { classesBackButton } from "../../ui/classes/classesBackButton"
import { classesFieldHelp } from "../../ui/classes/classesFieldHelp"
import { classesHeading } from "../../ui/classes/classesHeading"
import { classesIdpIdentityBox } from "../../ui/classes/classesIdpIdentityBox"
import { classesIdpProviderLabel } from "../../ui/classes/classesIdpProviderLabel"
import { classesIntro } from "../../ui/classes/classesIntro"
import { classesPrimaryButton } from "../../ui/classes/classesPrimaryButton"
import { classesStep } from "../../ui/classes/classesStep"
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
      <div class={classesIntro}>
        <p class={classesStep}>{stepText()}</p>
        <h1 ref={props.headingRegister} id="login-title" tabindex="-1" class={classesHeading}>
          {headingText()}
        </h1>
      </div>
      <div class={classesIdpIdentityBox}>
        <IdentityProviderIcon type={props.providerType()} name={props.providerName()} />
        <span class={classesIdpProviderLabel}>{props.providerName()}</span>
      </div>
      <Show when={isFailure()}>
        <p class={classesFieldHelp} role="status">
          Sign in with {props.providerName()} was not completed. Please try again.
        </p>
      </Show>
      <Show when={isUnlinked()}>
        <p class={classesFieldHelp} role="status">
          No ZITADEL account is linked to this {props.providerName()} account. Account linking and self-service
          registration are not enabled yet.
        </p>
      </Show>
      <Show when={isLinkingFailed()}>
        <p class={classesFieldHelp} role="status">
          Account linking could not be completed. Please try another sign-in method.
        </p>
      </Show>

      <Show
        when={!isUnlinked() && !isLinkingFailed()}
        fallback={
          <button class={classesPrimaryButton} type="button" onClick={props.showChooser} disabled={props.busy()}>
            Back to methods
          </button>
        }
      >
        <form onSubmit={props.submit} novalidate>
          <button class={classesPrimaryButton} type="submit" disabled={props.busy()}>
            {isFailure() ? "Try again" : `Continue with ${props.providerName()}`}
          </button>
        </form>
        <button class={classesBackButton} type="button" onClick={props.showChooser} disabled={props.busy()}>
          Back to methods
        </button>
      </Show>
    </section>
  )
}
