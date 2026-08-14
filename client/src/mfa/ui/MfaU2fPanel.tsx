import { Show } from "solid-js"

import { ttc } from "../../i18n/model/ttc"
import type { PasskeyOptions } from "../../passkey/model/passkeyOptionsSchema"
import { classesBackButton } from "../../ui/classes/classesBackButton"
import { classesHeading } from "../../ui/classes/classesHeading"
import { classesIntro } from "../../ui/classes/classesIntro"
import { classesIntroCopy } from "../../ui/classes/classesIntroCopy"
import { classesNoticeMessage } from "../../ui/classes/classesNoticeMessage"
import { classesPrimaryButton } from "../../ui/classes/classesPrimaryButton"
import { mfaFactorDetailGet } from "../model/mfaFactorDetailGet"
import { mfaFactorLabelGet } from "../model/mfaFactorLabelGet"
import { mfaU2fStateCreate, type PasskeyCredentialsGet } from "./mfaU2fStateCreate"

type MfaU2fPanelProps = {
  apiOrigin: () => string
  flowHandle: () => string
  factorType: () => "u2f" | "passkey"
  csrfToken: () => string
  csrfTokenSet: (token: string) => void
  busy: () => boolean
  busySet: (value: boolean) => void
  headingRegister: (element: HTMLHeadingElement) => void
  errorClear: () => void
  failureSet: (message: string) => void
  fallbackContinue: (path?: string) => void
  lastUsedSave?: (factor: "u2f" | "passkey") => void
  enrollmentPending?: () => boolean
  enrollmentPendingSet?: (value: boolean) => void
  statusContinue: (url: string) => void
  optionsReload?: () => Promise<void>
  showChooser?: () => void
  showRootChooser: () => void
  credentialsGet?: PasskeyCredentialsGet
  isSupported?: boolean
  fetchFn?: typeof fetch
  initialOptions?: () => PasskeyOptions | undefined
}

export function MfaU2fPanel(props: MfaU2fPanelProps) {
  const state = mfaU2fStateCreate({
    apiOrigin: props.apiOrigin,
    flowHandle: props.flowHandle,
    factorType: props.factorType,
    csrfToken: props.csrfToken,
    csrfTokenSet: props.csrfTokenSet,
    busy: props.busy,
    busySet: props.busySet,
    errorClear: props.errorClear,
    failureSet: props.failureSet,
    fallbackContinue: props.fallbackContinue,
    lastUsedSave: props.lastUsedSave,
    enrollmentPending: props.enrollmentPending,
    enrollmentPendingSet: props.enrollmentPendingSet,
    statusContinue: props.statusContinue,
    optionsReload: props.optionsReload,
    showChooser: props.showChooser,
    showRootChooser: props.showRootChooser,
    credentialsGet: props.credentialsGet,
    isSupported: props.isSupported,
    fetchFn: props.fetchFn,
    initialOptions: props.initialOptions,
  })

  const label = () => mfaFactorLabelGet(props.factorType())
  const detail = () => mfaFactorDetailGet(props.factorType())

  return (
    <div>
      <Show
        when={state.isSupported()}
        fallback={
          <div>
            <div class={classesIntro}>
              <h1 ref={props.headingRegister} id="login-title" tabindex="-1" class={classesHeading}>
                {ttc("{method} not supported").replace("{method}", ttc(label()))}
              </h1>
              <p class={classesNoticeMessage}>
                {ttc(
                  "{method} authentication is not supported in this browser. Please use another 2-step verification method.",
                ).replace("{method}", ttc(label()))}
              </p>
            </div>
            <Show when={props.showChooser}>
              <button class={classesBackButton} type="button" onClick={props.showChooser} disabled={props.busy()}>
                {ttc("Back to 2-step choices")}
              </button>
            </Show>
            <button class={classesBackButton} type="button" onClick={props.showRootChooser} disabled={props.busy()}>
              {ttc("Back to methods")}
            </button>
          </div>
        }
      >
        <div class={classesIntro}>
          <h1 ref={props.headingRegister} id="login-title" tabindex="-1" class={classesHeading}>
            {ttc(label())}
          </h1>
          <p class={classesIntroCopy}>{ttc(detail())}</p>
        </div>
        <form onSubmit={state.submit} novalidate>
          <button class={classesPrimaryButton} type="submit" disabled={props.busy()}>
            {props.busy() ? ttc("Verifying...") : ttc("Verify with {method}").replace("{method}", ttc(label()))}
          </button>
        </form>
        <Show when={props.showChooser}>
          <button class={classesBackButton} type="button" onClick={props.showChooser} disabled={props.busy()}>
            {ttc("Back to 2-step choices")}
          </button>
        </Show>
        <button class={classesBackButton} type="button" onClick={props.showRootChooser} disabled={props.busy()}>
          {ttc("Back to methods")}
        </button>
      </Show>
    </div>
  )
}
