import { For, Show } from "solid-js"

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
    <div class="recent-account-section">
      <p class="recent-account-heading">Recent accounts</p>
      <ul class="recent-account-list">
        <For each={state.accounts()}>
          {(account) => (
            <li>
              <button
                type="button"
                class="recent-account-button"
                disabled={props.busy()}
                onClick={() => state.selectAccount(account.id)}
              >
                <span class="account-avatar-container">
                  <Show
                    when={account.avatarUrl && !state.avatarFailed(account.id)}
                    fallback={
                      <span class="account-avatar-fallback" aria-hidden="true">
                        {recentAccountInitialsGet(account.label)}
                      </span>
                    }
                  >
                    <img
                      src={account.avatarUrl}
                      alt=""
                      class="account-avatar"
                      onError={() => state.avatarFail(account.id)}
                    />
                  </Show>
                </span>
                <span class="account-details">
                  <span class="account-label">{account.label}</span>
                  <Show when={account.reauthenticationRequired}>
                    <span class="account-reauth-badge">Reauthentication required</span>
                  </Show>
                </span>
              </button>
            </li>
          )}
        </For>
      </ul>
      <Show when={props.useAnotherAccount}>
        <div class="recent-account-divider">
          <button
            type="button"
            class="text-button use-another-button"
            disabled={props.busy()}
            onClick={props.useAnotherAccount}
          >
            Use another method or account
          </button>
        </div>
      </Show>
    </div>
  )
}
