import type { FlowV2Cookie } from "../../flow/model/flowV2CookieSchema"
import type { FlowV2Transition } from "../../flow/model/flowV2TransitionSchema"
import { resultCreate } from "../../result/resultCreate"
import { resultErrorCreate } from "../../result/resultErrorCreate"
import type { Result } from "../../result/Result"
import type { zitadelClientCreate } from "../../zitadel/zitadelClientCreate"
import { loginHintMatches } from "./loginHintMatches"
import { opaqueAccountIdCreate } from "./opaqueAccountIdCreate"
import { recentAccountCookieOpen } from "./recentAccountCookieOpen"
import { recentAccountCookieSeal } from "./recentAccountCookieSeal"
import { recentAccountCookieUpsert } from "./recentAccountCookieUpsert"
import type { RecentAccount, RecentAccountCookie } from "../model/recentAccountCookieSchema"

const recentAccountCookieLifetimeSeconds = 30 * 24 * 60 * 60

function timestampParse(value: string | undefined): number | undefined {
  if (!value) return undefined
  const timestamp = Date.parse(value)
  if (!Number.isFinite(timestamp)) return undefined
  return Math.floor(timestamp / 1000)
}

export type RecentAccountSelectionInput = {
  state: Extract<FlowV2Cookie, { stage: "ready" }>
  accountId: string
  cookieValue?: string
  cookieKeys: string[]
  now: number
  randomBytes: (length: number) => Uint8Array
  client: ReturnType<typeof zitadelClientCreate>
}

export type RecentAccountSelectionOutput = {
  state: FlowV2Cookie
  transition: FlowV2Transition
  updatedCookieValue?: string
  clearCookie?: boolean
}

export async function recentAccountSelectionExecute(
  input: RecentAccountSelectionInput,
): Promise<Result<RecentAccountSelectionOutput>> {
  const op = "recentAccountSelectionExecute"

  if (!input.cookieValue || input.cookieKeys.length === 0) {
    return resultErrorCreate(op, "account_invalid")
  }

  const opened = await recentAccountCookieOpen(input.cookieValue, input.cookieKeys, input.now)
  if (!opened.success) {
    return resultErrorCreate(op, "account_invalid", { clearCookie: true })
  }

  const accounts = opened.data.accounts
  if (accounts.length === 0) {
    return resultErrorCreate(op, "account_invalid", { clearCookie: true })
  }

  let selectedIndex = -1
  for (let index = 0; index < accounts.length; index += 1) {
    const candidate = accounts[index]!
    const opaqueId = await opaqueAccountIdCreate(input.cookieKeys[0]!, candidate.sessionId, candidate.userId)
    if (opaqueId === input.accountId) {
      selectedIndex = index
      break
    }
  }

  if (selectedIndex === -1) {
    return resultErrorCreate(op, "account_invalid")
  }

  const selectedAccount = accounts[selectedIndex]!
  const remainingAccounts = accounts.filter((_, index) => index !== selectedIndex)

  async function updateCookieAfterRemoval(retained: RecentAccount[]): Promise<{
    updatedCookieValue?: string
    clearCookie?: boolean
  }> {
    if (retained.length === 0) {
      return { clearCookie: true }
    }
    const updatedCookie: RecentAccountCookie = {
      version: 1,
      issuedAt: input.now,
      expiresAt: input.now + recentAccountCookieLifetimeSeconds,
      accounts: retained,
    }
    const sealed = await recentAccountCookieSeal(updatedCookie, input.cookieKeys[0]!, input.randomBytes(12))
    if (sealed.success) {
      return { updatedCookieValue: sealed.data }
    }
    return {}
  }

  if (selectedAccount.expiresAt <= input.now || selectedAccount.organizationId !== input.state.organizationId) {
    const cookieUpdate = await updateCookieAfterRemoval(remainingAccounts)
    return resultErrorCreate(op, "account_invalid", cookieUpdate)
  }

  if (input.state.hintUserId && selectedAccount.userId !== input.state.hintUserId) {
    return resultErrorCreate(op, "account_invalid")
  }

  const sessionResult = await input.client.sessionGet(selectedAccount.sessionId, selectedAccount.sessionToken)
  if (!sessionResult.success) {
    const cookieUpdate = await updateCookieAfterRemoval(remainingAccounts)
    return resultErrorCreate(op, "account_invalid", cookieUpdate)
  }

  const session = sessionResult.data.session
  if (session.expirationDate) {
    const nativeExpiresAt = timestampParse(session.expirationDate)
    if (nativeExpiresAt !== undefined && nativeExpiresAt <= input.now) {
      const cookieUpdate = await updateCookieAfterRemoval(remainingAccounts)
      return resultErrorCreate(op, "account_invalid", cookieUpdate)
    }
  }

  const sessionUser = session.factors?.user
  if (
    !sessionUser ||
    sessionUser.id !== selectedAccount.userId ||
    sessionUser.organizationId !== input.state.organizationId
  ) {
    const cookieUpdate = await updateCookieAfterRemoval(remainingAccounts)
    return resultErrorCreate(op, "account_invalid", cookieUpdate)
  }

  const userResult = await input.client.userGet(selectedAccount.userId)
  if (!userResult.success) {
    const cookieUpdate = await updateCookieAfterRemoval(remainingAccounts)
    return resultErrorCreate(op, "account_invalid", cookieUpdate)
  }

  const user = userResult.data.user
  if (user.state !== "USER_STATE_ACTIVE") {
    const cookieUpdate = await updateCookieAfterRemoval(remainingAccounts)
    return resultErrorCreate(op, "account_invalid", cookieUpdate)
  }

  const resourceOwner = user.details?.resourceOwner
  if (resourceOwner && resourceOwner !== input.state.organizationId) {
    const cookieUpdate = await updateCookieAfterRemoval(remainingAccounts)
    return resultErrorCreate(op, "account_invalid", cookieUpdate)
  }

  const displayName = user.human?.profile?.displayName
  const email = user.human?.email?.email
  const preferredLoginName = user.preferredLoginName ?? sessionUser.loginName
  const primaryLabel = displayName?.trim() || preferredLoginName?.trim() || email?.trim() || "Account"

  if (
    !loginHintMatches(
      input.state.loginHint,
      primaryLabel,
      user.preferredLoginName,
      user.human?.email?.email,
      sessionUser.loginName,
      undefined,
      user.human?.profile?.displayName,
    )
  ) {
    return resultErrorCreate(op, "account_invalid")
  }

  let sessionToken = selectedAccount.sessionToken
  if (session.sessionToken && session.sessionToken !== selectedAccount.sessionToken) {
    sessionToken = session.sessionToken
  }

  const promptRequiresReauth = input.state.prompt?.includes("PROMPT_LOGIN") ?? false
  const maxAgeExceeded =
    input.state.maxAgeSeconds !== undefined && input.now - selectedAccount.authAt > input.state.maxAgeSeconds
  const reauthenticationRequired = promptRequiresReauth || maxAgeExceeded

  const { owned: _owned, ...stateBase } = input.state

  if (reauthenticationRequired) {
    const effectiveLoginHint = user.preferredLoginName ?? user.human?.email?.email
    const nextState: Extract<FlowV2Cookie, { stage: "ready" }> = {
      ...stateBase,
      stage: "ready",
      delegable: true,
      owned: true,
      transitionCounter: input.state.transitionCounter + 1,
      hintUserId: selectedAccount.userId,
      ...(effectiveLoginHint ? { loginHint: effectiveLoginHint } : {}),
    }

    const updatedAccount: RecentAccount = {
      ...selectedAccount,
      sessionToken,
    }
    const updatedCookie = recentAccountCookieUpsert(opened.data, updatedAccount, input.now)
    const sealed = await recentAccountCookieSeal(updatedCookie, input.cookieKeys[0]!, input.randomBytes(12))

    const transition: FlowV2Transition = {
      kind: "render",
      route: `/login/email-otp?flow=${nextState.flowHandle}`,
      screen: {
        name: "email_otp_start",
        ...(nextState.loginHint ? { loginHint: nextState.loginHint } : {}),
      },
      csrfToken: nextState.csrfToken,
    }

    return resultCreate({
      state: nextState,
      transition,
      ...(sealed.success ? { updatedCookieValue: sealed.data } : {}),
    })
  }

  const nextState: Extract<FlowV2Cookie, { stage: "verified" }> = {
    ...stateBase,
    stage: "verified",
    delegable: false,
    transitionCounter: input.state.transitionCounter + 1,
    userId: selectedAccount.userId,
    sessionId: selectedAccount.sessionId,
    sessionToken,
  }

  const updatedAccount: RecentAccount = {
    ...selectedAccount,
    sessionToken,
    lastUsedAt: input.now,
  }
  const updatedCookie = recentAccountCookieUpsert(opened.data, updatedAccount, input.now)
  const sealed = await recentAccountCookieSeal(updatedCookie, input.cookieKeys[0]!, input.randomBytes(12))

  const transition: FlowV2Transition = {
    kind: "complete",
    path: `/api/v2/flow/continue?flow=${nextState.flowHandle}`,
  }

  return resultCreate({
    state: nextState,
    transition,
    ...(sealed.success ? { updatedCookieValue: sealed.data } : {}),
  })
}
