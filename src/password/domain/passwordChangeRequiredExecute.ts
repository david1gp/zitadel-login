import type { FlowV2Cookie } from "../../flow/model/flowV2CookieSchema"
import type { FlowV2Transition } from "../../flow/model/flowV2TransitionSchema"
import { primaryFlowMfaPolicyEvaluate } from "../../flow/domain/primaryFlowMfaPolicyEvaluate"
import { mfaOptionsGet } from "../../mfa/domain/mfaOptionsGet"
import { resultCreate } from "../../result/resultCreate"
import { resultErrorCreate } from "../../result/resultErrorCreate"
import type { Result } from "../../result/Result"
import type { zitadelClientCreate } from "../../zitadel/zitadelClientCreate"

type RequiredState = Extract<FlowV2Cookie, { stage: "password_change_required" }>
type ChangedState = Extract<FlowV2Cookie, { stage: "password_changed" }>

type Input = {
  state: RequiredState
  currentPassword: string
  newPassword: string
  csrfToken: string
  now: number
  consume: (state: ChangedState) => Promise<Result<void>>
  client: ReturnType<typeof zitadelClientCreate>
}

const passwordMethod = "AUTHENTICATION_METHOD_TYPE_PASSWORD"
function resultStatusGet(result: { success: boolean; rawData?: unknown }): number | undefined {
  if (result.success || typeof result.rawData !== "object" || result.rawData === null) return undefined
  if (!("status" in result.rawData) || typeof result.rawData.status !== "number") return undefined
  return result.rawData.status
}

function passwordExpiredGet(passwordChanged: string | undefined, maxAgeDays: number | undefined, now: number) {
  if (!maxAgeDays || !passwordChanged) return resultCreate(false)
  const changedAt = Date.parse(passwordChanged)
  if (!Number.isFinite(changedAt)) return resultErrorCreate("passwordExpiredGet", "password_unavailable")
  return resultCreate(changedAt + maxAgeDays * 24 * 60 * 60 * 1000 <= now * 1000)
}

function sessionIsBound(
  state: RequiredState | ChangedState,
  session: {
    id: string
    expirationDate?: string
    factors?: { user?: { id: string; organizationId: string }; password?: { verifiedAt?: string } }
  },
  now: number,
) {
  const expiresAt = session.expirationDate ? Date.parse(session.expirationDate) : undefined
  const passwordVerifiedAt = Date.parse(session.factors?.password?.verifiedAt ?? "")
  return (
    session.id === state.sessionId &&
    session.factors?.user?.id === state.userId &&
    session.factors.user.organizationId === state.organizationId &&
    Number.isFinite(passwordVerifiedAt) &&
    passwordVerifiedAt >= (state.issuedAt - 60) * 1000 &&
    passwordVerifiedAt <= (now + 60) * 1000 &&
    (expiresAt === undefined || (Number.isFinite(expiresAt) && expiresAt > now * 1000))
  )
}

function fallbackCreate(state: ChangedState): { state: ChangedState; transition: FlowV2Transition; partial: true } {
  return {
    state,
    transition: { kind: "fallback", path: `/api/v2/flow/fallback?flow=${state.flowHandle}` },
    partial: true,
  }
}

export async function passwordChangeRequiredExecute(input: Input) {
  const op = "passwordChangeRequiredExecute"
  const session = await input.client.sessionGet(input.state.sessionId, input.state.sessionToken)
  if (!session.success) {
    const status = resultStatusGet(session)
    if (status === 401 || status === 404) return resultErrorCreate(op, "session_stale", { status })
    return resultErrorCreate(op, "password_unavailable", { status })
  }
  if (!sessionIsBound(input.state, session.data.session, input.now)) return resultErrorCreate(op, "session_stale")

  const latestToken = session.data.session.sessionToken ?? input.state.sessionToken
  const user = await input.client.userGet(input.state.userId)
  if (!user.success) return resultErrorCreate(op, "password_unavailable", { status: resultStatusGet(user) })
  if (
    user.data.user.userId !== input.state.userId ||
    user.data.user.state !== "USER_STATE_ACTIVE" ||
    user.data.user.details?.resourceOwner !== input.state.organizationId ||
    !user.data.user.human
  ) {
    return resultErrorCreate(op, "session_stale")
  }

  const expiry = await input.client.passwordExpirySettingsGet(input.state.organizationId)
  if (!expiry.success) return resultErrorCreate(op, "password_unavailable", { status: resultStatusGet(expiry) })
  const expired = passwordExpiredGet(user.data.user.human.passwordChanged, expiry.data.settings?.maxAgeDays, input.now)
  if (!expired.success) return expired
  const explicit = user.data.user.human.passwordChangeRequired === true
  if ((input.state.expired && !expired.data) || (!input.state.expired && !explicit)) {
    return resultErrorCreate(op, "flow_replayed")
  }

  const methods = await input.client.authenticationMethodsGet(input.state.userId)
  if (!methods.success) return resultErrorCreate(op, "password_unavailable", { status: resultStatusGet(methods) })
  const settings = await input.client.loginSettingsGet(input.state.organizationId)
  if (!settings.success) return resultErrorCreate(op, "password_unavailable", { status: resultStatusGet(settings) })
  if (
    !methods.data.authMethodTypes.includes(passwordMethod) ||
    settings.data.settings?.allowLocalAuthentication !== true
  ) {
    return resultErrorCreate(op, "authorization_unavailable")
  }

  const { expired: _expired, ...stateBase } = input.state
  const consumedState: ChangedState = {
    ...stateBase,
    stage: "password_changed",
    transitionCounter: input.state.transitionCounter + 1,
    csrfToken: input.csrfToken,
    sessionToken: latestToken,
  }
  const consumed = await input.consume(consumedState)
  if (!consumed.success) return resultErrorCreate(op, "service_unavailable")

  const changed = await input.client.passwordSet(
    input.state.userId,
    input.newPassword,
    { mode: "current_password", currentPassword: input.currentPassword },
    false,
  )
  if (!changed.success && changed.errorMessage === "password_policy_invalid") {
    return resultErrorCreate(op, "password_policy_invalid")
  }
  if (!changed.success && changed.errorMessage === "password_current_invalid") {
    return resultErrorCreate(op, "credentials_invalid")
  }
  if (!changed.success) return resultCreate(fallbackCreate(consumedState))

  const refreshedUser = await input.client.userGet(input.state.userId)
  const refreshedExpiry = await input.client.passwordExpirySettingsGet(input.state.organizationId)
  const refreshedMethods = await input.client.authenticationMethodsGet(input.state.userId)
  const refreshedSettings = await input.client.loginSettingsGet(input.state.organizationId)
  if (!refreshedUser.success || !refreshedExpiry.success || !refreshedMethods.success || !refreshedSettings.success) {
    return resultCreate(fallbackCreate(consumedState))
  }
  if (
    refreshedUser.data.user.userId !== input.state.userId ||
    refreshedUser.data.user.state !== "USER_STATE_ACTIVE" ||
    refreshedUser.data.user.details?.resourceOwner !== input.state.organizationId ||
    !refreshedUser.data.user.human ||
    !refreshedMethods.data.authMethodTypes.includes(passwordMethod) ||
    refreshedSettings.data.settings?.allowLocalAuthentication !== true
  ) {
    return resultCreate(fallbackCreate(consumedState))
  }
  const stillExpired = passwordExpiredGet(
    refreshedUser.data.user.human.passwordChanged,
    refreshedExpiry.data.settings?.maxAgeDays,
    input.now,
  )
  if (!stillExpired.success || stillExpired.data || refreshedUser.data.user.human.passwordChangeRequired === true) {
    return resultCreate(fallbackCreate(consumedState))
  }

  const refreshedSession = await input.client.sessionGet(input.state.sessionId, latestToken)
  if (!refreshedSession.success || !sessionIsBound(consumedState, refreshedSession.data.session, input.now)) {
    return resultCreate(fallbackCreate(consumedState))
  }
  const finalToken = refreshedSession.data.session.sessionToken ?? latestToken
  const mfa = primaryFlowMfaPolicyEvaluate({
    method: "password",
    methods: refreshedMethods.data.authMethodTypes,
    emailVerified: refreshedUser.data.user.human.email?.isVerified === true,
    phoneVerified: refreshedUser.data.user.human.phone?.isVerified === true,
    policy: refreshedSettings.data.settings ?? {},
  })
  if (!mfa.supported) return resultCreate(fallbackCreate({ ...consumedState, sessionToken: finalToken }))

  if (!mfa.required) {
    const state: Extract<FlowV2Cookie, { stage: "verified" }> = {
      ...stateBase,
      stage: "verified",
      transitionCounter: consumedState.transitionCounter + 1,
      csrfToken: input.csrfToken,
      sessionToken: finalToken,
    }
    return resultCreate({
      state,
      transition: {
        kind: "complete",
        path: `/api/v2/flow/continue?flow=${state.flowHandle}`,
      } satisfies FlowV2Transition,
      partial: false as const,
    })
  }

  const mfaState: Extract<FlowV2Cookie, { stage: "mfa" }> = {
    ...stateBase,
    stage: "mfa",
    transitionCounter: consumedState.transitionCounter + 1,
    csrfToken: input.csrfToken,
    sessionToken: finalToken,
    mfaMethods: mfa.methods,
  }
  const options = await mfaOptionsGet({ state: mfaState, now: input.now, client: input.client })
  if (!options.success || options.data.options.mode === "fallback") {
    const fallbackState = {
      ...consumedState,
      sessionToken: options.success ? options.data.state.sessionToken : finalToken,
    }
    return resultCreate(fallbackCreate(fallbackState))
  }
  if (options.data.options.mode === "skip" && options.data.options.reason === "factor_satisfied") {
    const { mfaMethods: _mfaMethods, options: _options, ...verifiedBase } = options.data.state
    const state: Extract<FlowV2Cookie, { stage: "verified" }> = {
      ...verifiedBase,
      stage: "verified",
    }
    return resultCreate({
      state,
      transition: {
        kind: "complete",
        path: `/api/v2/flow/continue?flow=${state.flowHandle}`,
      } satisfies FlowV2Transition,
      partial: false as const,
    })
  }
  const state = options.data.state
  return resultCreate({
    state,
    transition: {
      kind: "render",
      route: `/login/mfa?flow=${state.flowHandle}`,
      screen: { name: "mfa", factors: state.mfaMethods },
      csrfToken: state.csrfToken,
    } satisfies FlowV2Transition,
    partial: false as const,
  })
}
