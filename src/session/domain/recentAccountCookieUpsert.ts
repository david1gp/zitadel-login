import type { RecentAccount, RecentAccountCookie } from "../model/recentAccountCookieSchema"

const maximumAccounts = 3
const cookieLifetimeSeconds = 30 * 24 * 60 * 60

function accountKeyGet(account: RecentAccount): string {
  return `${account.organizationId}\u0000${account.userId}`
}

function accountsNormalize(accounts: RecentAccount[], now: number): RecentAccount[] {
  const byKey = new Map<string, RecentAccount>()
  for (const account of accounts) {
    if (account.expiresAt <= now) continue
    const key = accountKeyGet(account)
    const current = byKey.get(key)
    if (
      !current ||
      account.lastUsedAt > current.lastUsedAt ||
      (account.lastUsedAt === current.lastUsedAt && account.sessionId > current.sessionId)
    ) {
      byKey.set(key, account)
    }
  }

  return [...byKey.values()]
    .sort((left, right) => {
      if (right.lastUsedAt !== left.lastUsedAt) return right.lastUsedAt - left.lastUsedAt
      const leftKey = accountKeyGet(left)
      const rightKey = accountKeyGet(right)
      if (leftKey !== rightKey) return leftKey.localeCompare(rightKey)
      return right.sessionId.localeCompare(left.sessionId)
    })
    .slice(0, maximumAccounts)
}

export function recentAccountCookieUpsert(
  cookie: RecentAccountCookie | undefined,
  account: RecentAccount,
  now: number,
): RecentAccountCookie {
  const retained = (cookie?.accounts ?? []).filter((entry) => accountKeyGet(entry) !== accountKeyGet(account))
  return {
    version: 1,
    issuedAt: now,
    expiresAt: now + cookieLifetimeSeconds,
    accounts: accountsNormalize([...retained, account], now),
  }
}
