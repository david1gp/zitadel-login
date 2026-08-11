import { resultCreate } from "../../result/resultCreate"
import type { Result } from "../../result/Result"
import { loginHintMatches } from "./loginHintMatches"
import { opaqueAccountIdCreate } from "./opaqueAccountIdCreate"
import { recentAccountCookieOpen } from "./recentAccountCookieOpen"
import { recentAccountCookieSeal } from "./recentAccountCookieSeal"
import type { RecentAccount, RecentAccountCookie } from "../model/recentAccountCookieSchema"
import type { RecentAccountSummary } from "../model/recentAccountSummarySchema"

function timestampParse(value: string | undefined): number | undefined {
  if (!value) return undefined
  const timestamp = Date.parse(value)
  if (!Number.isFinite(timestamp)) return undefined
  return Math.floor(timestamp / 1000)
}

function avatarUrlSanitize(urlValue: string | undefined): string | undefined {
  if (!urlValue || urlValue.length > 2048) return undefined
  try {
    const parsed = new URL(urlValue)
    if (parsed.protocol !== "https:" || parsed.username || parsed.password) return undefined
    return parsed.toString()
  } catch {
    return undefined
  }
}

export type RecentAccountDiscoveryInput = {
  cookieValue?: string
  cookieKeys: string[]
  organizationId: string
  prompt?: string[]
  loginHint?: string
  hintUserId?: string
  maxAgeSeconds?: number
  now: number
  randomBytes: (length: number) => Uint8Array
  client: {
    sessionGet: (
      sessionId: string,
      sessionToken: string,
    ) => Promise<
      Result<{
        session: {
          id: string
          expirationDate?: string
          sessionToken?: string
          factors?: {
            user?: {
              id: string
              loginName?: string
              displayName?: string
              avatarUrl?: string
              organizationId: string
            }
          }
        }
      }>
    >
    userGet: (userId: string) => Promise<
      Result<{
        user: {
          userId: string
          state: string
          preferredLoginName?: string
          details?: { resourceOwner?: string }
          human?: {
            profile?: { displayName?: string; avatarUrl?: string }
            email?: { email: string; isVerified: boolean }
          }
        }
      }>
    >
  }
}

export type RecentAccountDiscoveryResult = {
  accounts: RecentAccountSummary[]
  updatedCookieValue?: string
  clearCookie?: boolean
}

export async function recentAccountDiscoveryExecute(
  input: RecentAccountDiscoveryInput,
): Promise<Result<RecentAccountDiscoveryResult>> {
  const op = "recentAccountDiscoveryExecute"
  try {
    if (!input.cookieValue || input.cookieKeys.length === 0) {
      return resultCreate({ accounts: [] })
    }

    const opened = await recentAccountCookieOpen(input.cookieValue, input.cookieKeys, input.now)
    if (!opened.success) {
      return resultCreate({ accounts: [], clearCookie: true })
    }

    const accounts = opened.data.accounts
    if (accounts.length === 0) {
      return resultCreate({ accounts: [] })
    }

    const validAccounts: RecentAccount[] = []
    type CandidateSummary = {
      account: RecentAccount
      id: string
      primaryLabel: string
      secondaryLabel?: string
      avatarUrl?: string
      lastUsedAt: number
      reauthenticationRequired: boolean
    }
    const candidates: CandidateSummary[] = []
    let cookieNeedsUpdate = false

    for (const account of accounts) {
      if (account.expiresAt <= input.now || account.organizationId !== input.organizationId) {
        cookieNeedsUpdate = true
        continue
      }

      if (input.hintUserId && account.userId !== input.hintUserId) {
        continue
      }

      const sessionResult = await input.client.sessionGet(account.sessionId, account.sessionToken)
      if (!sessionResult.success) {
        cookieNeedsUpdate = true
        continue
      }

      const session = sessionResult.data.session
      if (session.expirationDate) {
        const nativeExpiresAt = timestampParse(session.expirationDate)
        if (nativeExpiresAt !== undefined && nativeExpiresAt <= input.now) {
          cookieNeedsUpdate = true
          continue
        }
      }

      const sessionUser = session.factors?.user
      if (!sessionUser || sessionUser.id !== account.userId || sessionUser.organizationId !== input.organizationId) {
        cookieNeedsUpdate = true
        continue
      }

      const userResult = await input.client.userGet(account.userId)
      if (!userResult.success) {
        cookieNeedsUpdate = true
        continue
      }

      const user = userResult.data.user
      if (user.state !== "USER_STATE_ACTIVE") {
        cookieNeedsUpdate = true
        continue
      }

      const resourceOwner = user.details?.resourceOwner
      if (resourceOwner && resourceOwner !== input.organizationId) {
        cookieNeedsUpdate = true
        continue
      }

      let sessionToken = account.sessionToken
      if (session.sessionToken && session.sessionToken !== account.sessionToken) {
        sessionToken = session.sessionToken
        cookieNeedsUpdate = true
      }

      const displayName = user.human?.profile?.displayName ?? sessionUser.displayName
      const email = user.human?.email?.email
      const preferredLoginName = user.preferredLoginName ?? sessionUser.loginName

      const primaryLabel = displayName?.trim() || preferredLoginName?.trim() || email?.trim() || "Account"
      const secondaryLabel = displayName && (email || preferredLoginName) ? (email ?? preferredLoginName) : undefined

      if (
        !loginHintMatches(
          input.loginHint,
          primaryLabel,
          user.preferredLoginName,
          user.human?.email?.email,
          sessionUser.loginName,
          sessionUser.displayName,
          user.human?.profile?.displayName,
        )
      ) {
        continue
      }

      const avatarUrl = avatarUrlSanitize(user.human?.profile?.avatarUrl ?? sessionUser.avatarUrl)
      const promptRequiresReauth = input.prompt?.includes("PROMPT_LOGIN") ?? false
      const maxAgeExceeded = input.maxAgeSeconds !== undefined && input.now - account.authAt > input.maxAgeSeconds
      const reauthenticationRequired = promptRequiresReauth || maxAgeExceeded

      const opaqueId = await opaqueAccountIdCreate(input.cookieKeys[0]!, account.sessionId, account.userId)

      const updatedAccount: RecentAccount = {
        userId: account.userId,
        sessionId: account.sessionId,
        sessionToken,
        organizationId: account.organizationId,
        authAt: account.authAt,
        lastUsedAt: account.lastUsedAt,
        expiresAt: account.expiresAt,
      }

      validAccounts.push(updatedAccount)
      candidates.push({
        account: updatedAccount,
        id: opaqueId,
        primaryLabel,
        secondaryLabel,
        avatarUrl,
        lastUsedAt: account.lastUsedAt,
        reauthenticationRequired,
      })
    }

    if (validAccounts.length < accounts.length) {
      cookieNeedsUpdate = true
    }

    const labelCounts = new Map<string, number>()
    for (const c of candidates) {
      labelCounts.set(c.primaryLabel, (labelCounts.get(c.primaryLabel) ?? 0) + 1)
    }

    const summaries: RecentAccountSummary[] = candidates.map((c, index) => {
      let finalLabel = c.primaryLabel
      if ((labelCounts.get(c.primaryLabel) ?? 0) > 1) {
        if (c.secondaryLabel) {
          finalLabel = `${c.primaryLabel} (${c.secondaryLabel})`
        } else {
          finalLabel = `${c.primaryLabel} (${index + 1})`
        }
      }
      return {
        id: c.id,
        label: finalLabel,
        ...(c.avatarUrl ? { avatarUrl: c.avatarUrl } : {}),
        lastUsedAt: c.lastUsedAt,
        reauthenticationRequired: c.reauthenticationRequired,
      }
    })

    if (cookieNeedsUpdate) {
      if (validAccounts.length === 0) {
        return resultCreate({ accounts: summaries, clearCookie: true })
      }
      const updatedCookie: RecentAccountCookie = {
        version: 1,
        issuedAt: input.now,
        expiresAt: input.now + 30 * 24 * 60 * 60,
        accounts: validAccounts,
      }
      const sealed = await recentAccountCookieSeal(updatedCookie, input.cookieKeys[0]!, input.randomBytes(12))
      if (sealed.success) {
        return resultCreate({ accounts: summaries, updatedCookieValue: sealed.data })
      }
    }

    return resultCreate({ accounts: summaries })
  } catch {
    return resultCreate({ accounts: [] })
  }
}
