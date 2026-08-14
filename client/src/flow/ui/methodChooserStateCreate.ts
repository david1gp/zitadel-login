import type { LastUsedLoginMethodPrimary } from "../../preferences/model/lastUsedLoginMethodPrimarySchema"
import type { RecentAccountSummary } from "../../session/model/recentAccountSummarySchema"
import type { LoginMethodSelection } from "../model/loginMethodSelectionSchema"

export function methodChooserStateCreate(options: {
  recentAccounts?: () => RecentAccountSummary[]
  lastUsedPrimary?: () => LastUsedLoginMethodPrimary | undefined
}) {
  const hasRecentAccounts = () => (options.recentAccounts ? options.recentAccounts().length > 0 : false)
  const methodIsLastUsed = (selection: LoginMethodSelection) => {
    const lastUsed = options.lastUsedPrimary?.()
    if (!lastUsed || selection.method !== lastUsed.method) return false
    if (selection.method !== "identity_provider" || lastUsed.method !== "identity_provider") return true
    return selection.identityProviderId === lastUsed.identityProviderId
  }

  return { hasRecentAccounts, methodIsLastUsed }
}
