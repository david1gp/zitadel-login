import type { FlowV2Cookie } from "../../flow/model/flowV2CookieSchema"
import type { FlowV2Transition } from "../../flow/model/flowV2TransitionSchema"
import { primaryFlowMfaPolicyEvaluate } from "../../flow/domain/primaryFlowMfaPolicyEvaluate"
import { primaryFlowOwnershipPreflight } from "../../flow/domain/primaryFlowOwnershipPreflight"
import { resultCreate } from "../../result/resultCreate"
import { resultErrorCreate } from "../../result/resultErrorCreate"
import { zitadelClientCreate } from "../../zitadel/zitadelClientCreate"

type Input = {
  state: Extract<FlowV2Cookie, { stage: "ready" }>
  identifier: string
  password: string
  now: number
  client: ReturnType<typeof zitadelClientCreate>
}

const passwordMethod = "AUTHENTICATION_METHOD_TYPE_PASSWORD"
const mfaMethods = new Set([
  "AUTHENTICATION_METHOD_TYPE_TOTP",
  "AUTHENTICATION_METHOD_TYPE_OTP_SMS",
  "AUTHENTICATION_METHOD_TYPE_OTP_EMAIL",
  "AUTHENTICATION_METHOD_TYPE_U2F",
])

function fallbackCreate(state: Input["state"]): FlowV2Transition {
  return { kind: "fallback", path: `/api/v2/flow/fallback?flow=${state.flowHandle}` }
}

function resultStatusGet(result: { success: boolean; rawData?: unknown }): number | undefined {
  if (result.success || typeof result.rawData !== "object" || result.rawData === null) return undefined
  if (!("status" in result.rawData) || typeof result.rawData.status !== "number") return undefined
  return result.rawData.status
}

function resultErrorIdGet(result: { success: boolean; rawData?: unknown }): string | undefined {
  if (result.success || typeof result.rawData !== "object" || result.rawData === null) return undefined
  if (!("id" in result.rawData) || typeof result.rawData.id !== "string") return undefined
  return result.rawData.id
}

function credentialErrorCreate(input: { status?: number; id?: string }) {
  const invalidIds = new Set(["COMMAND-3M0fs", "COMMAND-JLK35", "COMMAND-SFA3t"])
  if (invalidIds.has(input.id ?? "") || (input.status !== undefined && input.status >= 400 && input.status < 500)) {
    return resultErrorCreate("passwordV2Verify", "credentials_invalid", input)
  }
  return resultErrorCreate("passwordV2Verify", "password_unavailable", input)
}

function mfaTransitionCreate(state: Extract<FlowV2Cookie, { stage: "mfa" }>): FlowV2Transition {
  return {
    kind: "render",
    route: `/login/mfa?flow=${state.flowHandle}`,
    screen: { name: "mfa", factors: state.mfaMethods },
    csrfToken: state.csrfToken,
  }
}

function passwordExpiredGet(passwordChanged: string | undefined, maxAgeDays: number | undefined, now: number) {
  if (!maxAgeDays || !passwordChanged) return resultCreate(false)
  const changedAt = Date.parse(passwordChanged)
  if (!Number.isFinite(changedAt)) return resultErrorCreate("passwordExpiredGet", "password_lifecycle_unsupported")
  return resultCreate(changedAt + maxAgeDays * 24 * 60 * 60 * 1000 <= now * 1000)
}

export async function passwordV2Verify(input: Input) {
  const op = "passwordV2Verify"
  const settings = await input.client.loginSettingsGet(input.state.organizationId)
  if (!settings.success) return resultErrorCreate(op, "password_unavailable", { status: resultStatusGet(settings) })
  if (settings.data.settings?.allowLocalAuthentication !== true) {
    return resultCreate({ state: input.state, transition: fallbackCreate(input.state) })
  }

  const users = await input.client.usersByIdentifierList(input.identifier, input.state.organizationId)
  if (!users.success) return resultErrorCreate(op, "password_unavailable", { status: resultStatusGet(users) })
  if (users.data.result.length !== 1) return resultErrorCreate(op, "credentials_invalid")

  const user = users.data.result[0]
  if (
    user?.state !== "USER_STATE_ACTIVE" ||
    user.details?.resourceOwner !== input.state.organizationId ||
    (input.state.hintUserId !== undefined && input.state.hintUserId !== user.userId)
  ) {
    return resultErrorCreate(op, "credentials_invalid")
  }

  const methods = await input.client.authenticationMethodsGet(user.userId)
  if (!methods.success) return resultErrorCreate(op, "password_unavailable", { status: resultStatusGet(methods) })
  if (!methods.data.authMethodTypes.includes(passwordMethod)) {
    return resultCreate({ state: input.state, transition: fallbackCreate(input.state) })
  }

  const expiry = await input.client.passwordExpirySettingsGet(input.state.organizationId)
  if (!expiry.success) return resultErrorCreate(op, "password_unavailable", { status: resultStatusGet(expiry) })
  if (
    !primaryFlowOwnershipPreflight({
      method: "password",
      requestKind: input.state.requestKind,
      prompt: input.state.prompt,
      ...(input.state.loginHint ? { loginHint: input.state.loginHint } : {}),
      ...(input.state.maxAgeSeconds !== undefined ? { maxAgeSeconds: input.state.maxAgeSeconds } : {}),
      organizationId: input.state.organizationId,
      identifier: input.identifier,
      policy: settings.data.settings,
      now: input.now,
      ...(expiry.data.settings?.maxAgeDays !== undefined
        ? { passwordMaxAgeDays: expiry.data.settings.maxAgeDays }
        : {}),
      methods: methods.data.authMethodTypes,
      user,
    })
  ) {
    return resultCreate({ state: input.state, transition: fallbackCreate(input.state) })
  }

  const created = await input.client.passwordSessionCreate(user.userId, input.password)
  if (!created.success) {
    return credentialErrorCreate({ status: resultStatusGet(created), id: resultErrorIdGet(created) })
  }

  const session = await input.client.sessionGet(created.data.sessionId, created.data.sessionToken)
  if (!session.success) return resultErrorCreate(op, "password_unavailable", { status: resultStatusGet(session) })
  if (
    session.data.session.factors?.user?.id !== user.userId ||
    session.data.session.factors?.user?.organizationId !== input.state.organizationId ||
    !session.data.session.factors?.password?.verifiedAt
  ) {
    return resultErrorCreate(op, "authorization_unavailable")
  }

  const refreshedUser = await input.client.userGet(user.userId)
  if (!refreshedUser.success) {
    return resultErrorCreate(op, "password_unavailable", { status: resultStatusGet(refreshedUser) })
  }
  const refreshedExpiry = await input.client.passwordExpirySettingsGet(input.state.organizationId)
  if (!refreshedExpiry.success) {
    return resultErrorCreate(op, "password_unavailable", { status: resultStatusGet(refreshedExpiry) })
  }
  const authoritativeUser = refreshedUser.data.user
  if (
    authoritativeUser.userId !== user.userId ||
    authoritativeUser.state !== "USER_STATE_ACTIVE" ||
    authoritativeUser.details?.resourceOwner !== input.state.organizationId ||
    !authoritativeUser.human
  ) {
    return resultErrorCreate(op, "authorization_unavailable")
  }
  const expired = passwordExpiredGet(
    authoritativeUser.human.passwordChanged,
    refreshedExpiry.data.settings?.maxAgeDays,
    input.now,
  )
  if (!expired.success) return resultErrorCreate(op, "authorization_unavailable")

  const sessionToken = session.data.session.sessionToken ?? created.data.sessionToken
  const stateBase = (({ owned: _owned, ...rest }) => rest)(input.state)
  if (authoritativeUser.human.passwordChangeRequired === true || expired.data) {
    const state: Extract<FlowV2Cookie, { stage: "password_change_required" }> = {
      ...stateBase,
      stage: "password_change_required",
      delegable: false,
      transitionCounter: input.state.transitionCounter + 1,
      userId: user.userId,
      sessionId: created.data.sessionId,
      sessionToken,
      expired: expired.data,
    }
    return resultCreate({
      state,
      transition: {
        kind: "render",
        route: `/login/password?flow=${state.flowHandle}`,
        screen: { name: "password_change_required", expired: state.expired },
        csrfToken: state.csrfToken,
      } satisfies FlowV2Transition,
    })
  }

  const mfa = primaryFlowMfaPolicyEvaluate({
    method: "password",
    methods: methods.data.authMethodTypes,
    emailVerified: authoritativeUser.human.email?.isVerified === true,
    phoneVerified: authoritativeUser.human.phone?.isVerified === true,
    policy: settings.data.settings ?? {},
  })
  if (!mfa.supported) return resultCreate({ state: input.state, transition: fallbackCreate(input.state) })
  if (mfa.required) {
    const state: Extract<FlowV2Cookie, { stage: "mfa" }> = {
      ...stateBase,
      stage: "mfa",
      delegable: false,
      transitionCounter: input.state.transitionCounter + 1,
      userId: user.userId,
      sessionId: created.data.sessionId,
      sessionToken,
      mfaMethods: mfa.methods,
    }
    return resultCreate({ state, transition: mfaTransitionCreate(state) })
  }

  const state: Extract<FlowV2Cookie, { stage: "verified" }> = {
    ...stateBase,
    stage: "verified",
    delegable: false,
    transitionCounter: input.state.transitionCounter + 1,
    userId: user.userId,
    sessionId: created.data.sessionId,
    sessionToken,
  }
  return resultCreate({
    state,
    transition: { kind: "complete", path: `/api/v2/flow/continue?flow=${state.flowHandle}` } satisfies FlowV2Transition,
  })
}
