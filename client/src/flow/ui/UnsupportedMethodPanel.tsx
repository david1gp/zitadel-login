import { ttc } from "../../i18n/model/ttc"
import { classesBackButton } from "../../ui/classes/classesBackButton"
import { classesHeading } from "../../ui/classes/classesHeading"
import { classesIntro } from "../../ui/classes/classesIntro"
import { classesPrimaryButton } from "../../ui/classes/classesPrimaryButton"

type UnsupportedMethodPanelProps = {
  method: "password" | "passkey" | "identity_provider" | "mfa"
  providerName?: string
  busy: () => boolean
  headingRegister: (element: HTMLHeadingElement) => void
  submit: (event: SubmitEvent) => void
  showChooser: () => void
}

export function UnsupportedMethodPanel(props: UnsupportedMethodPanelProps) {
  return (
    <section aria-labelledby="login-title">
      <div class={classesIntro}>
        <h1 ref={props.headingRegister} id="login-title" tabindex="-1" class={classesHeading}>
          {props.method === "password"
            ? ttc("Sign in with password")
            : props.method === "passkey"
              ? ttc("Sign in with a passkey")
              : props.method === "mfa"
                ? ttc("2-Step Verification")
                : ttc("Continue with {provider}").replace("{provider}", props.providerName ?? "provider")}
        </h1>
      </div>
      <form onSubmit={props.submit} novalidate>
        <button class={classesPrimaryButton} type="submit" disabled={props.busy()}>
          {ttc("Continue in ZITADEL")}
        </button>
      </form>
      <button class={classesBackButton} type="button" onClick={props.showChooser} disabled={props.busy()}>
        {ttc("Back to methods")}
      </button>
    </section>
  )
}
