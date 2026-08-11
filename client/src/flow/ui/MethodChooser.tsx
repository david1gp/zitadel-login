import { Show } from "solid-js"

import type { RecentAccountSummary } from "../../session/model/recentAccountSummarySchema"
import { RecentAccountChooser } from "../../session/ui/RecentAccountChooser"
import type { LoginMethodSelection } from "../model/loginMethodSelectionSchema"

type MethodChooserProps = {
  methods: () => Array<{ selection: LoginMethodSelection; label: string; detail: string }>
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
      <div class="intro">
        <p class="step">Sign in</p>
        <h1 ref={props.headingRegister} id="login-title" tabindex="-1">
          {hasRecentAccounts() ? "Choose an account or method" : "Choose a method"}
        </h1>
      </div>
      <Show when={hasRecentAccounts() && props.selectAccount}>
        <RecentAccountChooser
          accounts={props.recentAccounts!}
          selectAccount={props.selectAccount!}
          busy={props.busy ?? (() => false)}
        />
        <p class="method-chooser-divider">Or choose a method</p>
      </Show>
      <ul class="method-list">
        {props.methods().map((method) => (
          <li>
            <button
              class="method-button"
              type="button"
              disabled={props.busy ? props.busy() : false}
              onClick={() => props.select(method.selection)}
            >
              <span>{method.label}</span>
              <small>{method.detail}</small>
            </button>
          </li>
        ))}
      </ul>
    </section>
  )
}
