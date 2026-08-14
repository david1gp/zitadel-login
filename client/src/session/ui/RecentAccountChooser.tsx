import { For, Show } from "solid-js"

import { ttc } from "../../i18n/model/ttc"
import { classesAccountAvatar } from "../../ui/classes/classesAccountAvatar"
import { classesAccountAvatarContainer } from "../../ui/classes/classesAccountAvatarContainer"
import { classesAccountAvatarFallback } from "../../ui/classes/classesAccountAvatarFallback"
import { classesAccountDetails } from "../../ui/classes/classesAccountDetails"
import { classesAccountLabel } from "../../ui/classes/classesAccountLabel"
import { classesAccountReauthBadge } from "../../ui/classes/classesAccountReauthBadge"
import { classesRecentAccountButton } from "../../ui/classes/classesRecentAccountButton"
import { classesRecentAccountDivider } from "../../ui/classes/classesRecentAccountDivider"
import { classesRecentAccountHeading } from "../../ui/classes/classesRecentAccountHeading"
import { classesRecentAccountList } from "../../ui/classes/classesRecentAccountList"
import { classesRecentAccountSection } from "../../ui/classes/classesRecentAccountSection"
import { classesTextButton } from "../../ui/classes/classesTextButton"
import { recentAccountInitialsGet } from "../model/recentAccountInitialsGet"
import { recentAccountChooserStateCreate } from "./recentAccountChooserStateCreate"

type RecentAccountChooserProps = {
  accounts: () => Array<{
    id: string
    label: string
    avatarUrl?: string
    lastUsedAt: number
    reauthenticationRequired: boolean
  }>
  selectAccount: (accountId: string) => void
  busy: () => boolean
  useAnotherAccount?: () => void
}

export function RecentAccountChooser(props: RecentAccountChooserProps) {
  const state = recentAccountChooserStateCreate({
    accounts: props.accounts,
    selectAccount: props.selectAccount,
  })

  return (
    <div class={classesRecentAccountSection}>
      <p class={classesRecentAccountHeading}>{ttc("Recent accounts")}</p>
      <ul class={classesRecentAccountList}>
        <For each={state.accounts()}>
          {(account) => (
            <li>
              <button
                type="button"
                class={classesRecentAccountButton}
                disabled={props.busy()}
                onClick={() => state.selectAccount(account.id)}
              >
                <span class={classesAccountAvatarContainer}>
                  <Show
                    when={account.avatarUrl && !state.avatarFailed(account.id)}
                    fallback={
                      <span class={classesAccountAvatarFallback} aria-hidden="true">
                        {recentAccountInitialsGet(account.label)}
                      </span>
                    }
                  >
                    <img
                      src={account.avatarUrl}
                      alt=""
                      class={classesAccountAvatar}
                      onError={() => state.avatarFail(account.id)}
                    />
                  </Show>
                </span>
                <span class={classesAccountDetails}>
                  <span class={classesAccountLabel}>{account.label}</span>
                  <Show when={account.reauthenticationRequired}>
                    <span class={classesAccountReauthBadge}>{ttc("Reauthentication required")}</span>
                  </Show>
                </span>
              </button>
            </li>
          )}
        </For>
      </ul>
      <Show when={props.useAnotherAccount}>
        <div class={classesRecentAccountDivider}>
          <button type="button" class={classesTextButton} disabled={props.busy()} onClick={props.useAnotherAccount}>
            {ttc("Use another method or account")}
          </button>
        </div>
      </Show>
    </div>
  )
}
