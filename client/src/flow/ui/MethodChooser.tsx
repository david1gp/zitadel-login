import { Show } from "solid-js"

import { ttc } from "../../i18n/model/ttc"
import type { LastUsedLoginMethodPrimary } from "../../preferences/model/lastUsedLoginMethodPrimarySchema"
import type { RecentAccountSummary } from "../../session/model/recentAccountSummarySchema"
import { RecentAccountChooser } from "../../session/ui/RecentAccountChooser"
import { classesHeading } from "../../ui/classes/classesHeading"
import { classesIntro } from "../../ui/classes/classesIntro"
import { classesMethodChoiceIcon } from "../../ui/classes/classesMethodChoiceIcon"
import { classesMethodChooserDivider } from "../../ui/classes/classesMethodChooserDivider"
import { classesMethodList } from "../../ui/classes/classesMethodList"
import { loginMethodIconPathGet } from "../model/loginMethodIconPathGet"
import type { LoginMethodSelection } from "../model/loginMethodSelectionSchema"
import { MethodChoiceButton } from "./MethodChoiceButton"
import { methodChooserStateCreate } from "./methodChooserStateCreate"

type MethodChooserProps = {
  methods: () => Array<{
    selection: LoginMethodSelection
    label: string
    detail?: string
    identityProviderType?: string
  }>
  select: (selection: LoginMethodSelection) => void
  headingRegister: (element: HTMLHeadingElement) => void
  recentAccounts?: () => RecentAccountSummary[]
  selectAccount?: (accountId: string) => void
  busy?: () => boolean
  lastUsedPrimary?: () => LastUsedLoginMethodPrimary | undefined
}

export function MethodChooser(props: MethodChooserProps) {
  const state = methodChooserStateCreate({
    recentAccounts: props.recentAccounts,
    lastUsedPrimary: props.lastUsedPrimary,
  })

  return (
    <section aria-labelledby="login-title">
      <div class={classesIntro}>
        <h1 ref={props.headingRegister} id="login-title" tabindex="-1" class={classesHeading}>
          {state.hasRecentAccounts() ? ttc("Choose an account or method") : ttc("Choose a method")}
        </h1>
      </div>
      <Show when={state.hasRecentAccounts() && props.selectAccount}>
        <RecentAccountChooser
          accounts={props.recentAccounts!}
          selectAccount={props.selectAccount!}
          busy={props.busy ?? (() => false)}
        />
        <p class={classesMethodChooserDivider}>{ttc("Or choose a method")}</p>
      </Show>
      <ul class={classesMethodList}>
        {props.methods().map((method) => (
          <li>
            <MethodChoiceButton
              label={method.selection.method === "identity_provider" ? method.label : ttc(method.label)}
              detail={method.detail ? ttc(method.detail) : undefined}
              iconPath={loginMethodIconPathGet(method.selection, method.identityProviderType)}
              iconClass={classesMethodChoiceIcon}
              disabled={props.busy ? props.busy() : false}
              lastUsed={state.methodIsLastUsed(method.selection)}
              onClick={() => props.select(method.selection)}
            />
          </li>
        ))}
      </ul>
    </section>
  )
}
