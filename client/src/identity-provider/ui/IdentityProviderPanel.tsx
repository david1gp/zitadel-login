import { Show } from "solid-js"

import { ttc } from "../../i18n/model/ttc"
import { classesBackButton } from "../../ui/classes/classesBackButton"
import { classesFieldHelp } from "../../ui/classes/classesFieldHelp"
import { classesHeading } from "../../ui/classes/classesHeading"
import { classesIdpIdentityBox } from "../../ui/classes/classesIdpIdentityBox"
import { classesIntro } from "../../ui/classes/classesIntro"
import { classesPrimaryButton } from "../../ui/classes/classesPrimaryButton"
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

  return (
    <section aria-labelledby="login-title">
      <div class={classesIntro}>
        <h1 ref={props.headingRegister} id="login-title" tabindex="-1" class={classesHeading}>
          {isUnlinked()
            ? ttc("No account linked")
            : isLinkingFailed()
              ? ttc("Could not link account")
              : ttc("Sign in with {provider}").replace("{provider}", props.providerName())}
        </h1>
      </div>
      <div class={classesIdpIdentityBox}>
        <IdentityProviderIcon type={props.providerType()} name={props.providerName()} />
      </div>
      <Show when={isFailure()}>
        <p class={classesFieldHelp} role="status">
          {ttc("Sign in with {provider} was not completed. Please try again.").replace(
            "{provider}",
            props.providerName(),
          )}
        </p>
      </Show>
      <Show when={isUnlinked()}>
        <p class={classesFieldHelp} role="status">
          {ttc(
            "No ZITADEL account is linked to this {provider} account. Account linking and self-service registration are not enabled yet.",
          ).replace("{provider}", props.providerName())}
        </p>
      </Show>
      <Show when={isLinkingFailed()}>
        <p class={classesFieldHelp} role="status">
          {ttc("Account linking could not be completed. Please try another sign-in method.")}
        </p>
      </Show>

      <Show
        when={!isUnlinked() && !isLinkingFailed()}
        fallback={
          <button class={classesPrimaryButton} type="button" onClick={props.showChooser} disabled={props.busy()}>
            {ttc("Back to methods")}
          </button>
        }
      >
        <form onSubmit={props.submit} novalidate>
          <button class={classesPrimaryButton} type="submit" disabled={props.busy()}>
            {isFailure()
              ? ttc("Try again")
              : ttc("Continue with {provider}").replace("{provider}", props.providerName())}
          </button>
        </form>
        <button class={classesBackButton} type="button" onClick={props.showChooser} disabled={props.busy()}>
          {ttc("Back to methods")}
        </button>
      </Show>
    </section>
  )
}
