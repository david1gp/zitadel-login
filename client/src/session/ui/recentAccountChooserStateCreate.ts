import { createSignalObject } from "../../ui/createSignalObject"

type RecentAccountChooserOptions = {
  accounts: () => Array<{
    id: string
    label: string
    avatarUrl?: string
    lastUsedAt: number
    reauthenticationRequired: boolean
  }>
  selectAccount: (accountId: string) => void
}

export function recentAccountChooserStateCreate(options: RecentAccountChooserOptions) {
  const failedAvatars = createSignalObject<Set<string>>(new Set())

  const avatarFail = (accountId: string) => {
    const current = new Set(failedAvatars.get())
    current.add(accountId)
    failedAvatars.set(current)
  }

  const avatarFailed = (accountId: string) => failedAvatars.get().has(accountId)

  return {
    accounts: options.accounts,
    avatarFail,
    avatarFailed,
    selectAccount: options.selectAccount,
  }
}
