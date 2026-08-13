import { Show } from "solid-js"

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

type MethodChooserProps = {
  methods: () => Array<{
    selection: LoginMethodSelection
    label: string
    detail: string
    identityProviderType?: string
  }>
  select: (selection: LoginMethodSelection) => void
  headingRegister: (element: HTMLHeadingElement) => void
  recentAccounts?: () => RecentAccountSummary[]
  selectAccount?: (accountId: string) => void
  busy?: () => boolean
}

export function MethodChooser(props: MethodChooserProps) {
  const hasRecentAccounts = () => (props.recentAccounts ? props.recentAccounts().length > 0 : false)

  return (
    <section aria-labelledby="login-title">
      <div class={classesIntro}>
        <h1 ref={props.headingRegister} id="login-title" tabindex="-1" class={classesHeading}>
          {hasRecentAccounts() ? "Choose an account or method" : "Choose a method"}
        </h1>
      </div>
      <Show when={hasRecentAccounts() && props.selectAccount}>
        <RecentAccountChooser
          accounts={props.recentAccounts!}
          selectAccount={props.selectAccount!}
          busy={props.busy ?? (() => false)}
        />
        <p class={classesMethodChooserDivider}>Or choose a method</p>
      </Show>
      <ul class={classesMethodList}>
        {props.methods().map((method) => (
          <li>
            <MethodChoiceButton
              label={method.label}
              detail={method.detail}
              iconPath={loginMethodIconPathGet(method.selection, method.identityProviderType)}
              iconClass={classesMethodChoiceIcon}
              disabled={props.busy ? props.busy() : false}
              onClick={() => props.select(method.selection)}
            />
          </li>
        ))}
      </ul>
    </section>
  )
}
