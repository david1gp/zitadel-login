import type { FlowV2Cookie } from "../../flow/model/flowV2CookieSchema"
import type { FlowV2Transition } from "../../flow/model/flowV2TransitionSchema"
import { primaryFlowOwnershipPreflight } from "../../flow/domain/primaryFlowOwnershipPreflight"
import { resultCreate } from "../../result/resultCreate"
import { resultErrorCreate } from "../../result/resultErrorCreate"
import { zitadelClientCreate } from "../../zitadel/zitadelClientCreate"

type Input = {
  state: Extract<FlowV2Cookie, { stage: "ready" }>
  email: string
  mfaV2Enabled: boolean
  now: number
  client: ReturnType<typeof zitadelClientCreate>
}

function fallbackCreate(state: Input["state"]): FlowV2Transition {
  return { kind: "fallback", path: `/api/v2/flow/fallback?flow=${state.flowHandle}` }
}

function decoyCreate(state: Input["state"]) {
  const { owned: _owned, ...stateBase } = state
  const nextState: Extract<FlowV2Cookie, { stage: "otp_decoy" }> = {
    ...stateBase,
    stage: "otp_decoy",
    delegable: false,
    transitionCounter: state.transitionCounter + 1,
  }
  return resultCreate({
    state: nextState,
    transition: {
      kind: "render",
      route: `/login/email-otp?flow=${state.flowHandle}`,
      screen: { name: "email_otp_code" },
      csrfToken: state.csrfToken,
    } satisfies FlowV2Transition,
  })
}

function resultStatusGet(result: { success: boolean; rawData?: unknown }): number | undefined {
  if (result.success || typeof result.rawData !== "object" || result.rawData === null) return undefined
  if (!("status" in result.rawData) || typeof result.rawData.status !== "number") return undefined
  return result.rawData.status
}

export async function emailOtpV2Start(input: Input) {
  const op = "emailOtpV2Start"
  if (!input.state.delegable) return resultErrorCreate(op, "flow_stage_invalid")

  const settings = await input.client.loginSettingsGet(input.state.organizationId)
  if (!settings.success) return resultErrorCreate(op, "service_unavailable", { status: resultStatusGet(settings) })
  if (settings.data.settings?.allowLocalAuthentication !== true) {
    return resultCreate({ state: input.state, transition: fallbackCreate(input.state) })
  }

  const users = await input.client.usersByEmailList(input.email)
  if (!users.success) return resultErrorCreate(op, "service_unavailable", { status: resultStatusGet(users) })
  const user = users.data.result.length === 1 ? users.data.result[0] : undefined
  const eligible =
    user?.state === "USER_STATE_ACTIVE" &&
    user.details?.resourceOwner === input.state.organizationId &&
    user.human?.email?.isVerified === true &&
    user.human.email.email.toLowerCase() === input.email &&
    (!input.state.hintUserId || input.state.hintUserId === user.userId)
  if (!eligible || !user) {
    if (settings.data.settings.ignoreUnknownUsernames) return decoyCreate(input.state)
    return resultCreate({ state: input.state, transition: fallbackCreate(input.state) })
  }

  const methods = await input.client.authenticationMethodsGet(user.userId)
  if (!methods.success) return resultErrorCreate(op, "service_unavailable", { status: resultStatusGet(methods) })
  if (!methods.data.authMethodTypes.includes("AUTHENTICATION_METHOD_TYPE_OTP_EMAIL")) {
    if (settings.data.settings.ignoreUnknownUsernames) return decoyCreate(input.state)
    return resultCreate({ state: input.state, transition: fallbackCreate(input.state) })
  }

  if (
    !primaryFlowOwnershipPreflight({
      method: "email_otp",
      requestKind: input.state.requestKind,
      prompt: input.state.prompt,
      ...(input.state.loginHint ? { loginHint: input.state.loginHint } : {}),
      ...(input.state.maxAgeSeconds !== undefined ? { maxAgeSeconds: input.state.maxAgeSeconds } : {}),
      organizationId: input.state.organizationId,
      identifier: input.email,
      mfaV2Enabled: input.mfaV2Enabled,
      forceMfa: settings.data.settings.forceMfa === true,
      forceMfaLocalOnly: settings.data.settings.forceMfaLocalOnly === true,
      now: input.now,
      methods: methods.data.authMethodTypes,
      user,
    })
  ) {
    return resultCreate({ state: input.state, transition: fallbackCreate(input.state) })
  }

  const created = await input.client.emailOtpSessionCreate(user.userId)
  if (!created.success) {
    const status = resultStatusGet(created)
    if (status !== undefined && status >= 400 && status < 500) {
      return resultCreate({ state: input.state, transition: fallbackCreate(input.state) })
    }
    return resultErrorCreate(op, "challenge_unavailable", { status })
  }

  const { owned: _owned, ...stateBase } = input.state
  const state: Extract<FlowV2Cookie, { stage: "otp" }> = {
    ...stateBase,
    stage: "otp",
    delegable: false,
    transitionCounter: input.state.transitionCounter + 1,
    userId: user.userId,
    sessionId: created.data.sessionId,
    sessionToken: created.data.sessionToken,
  }
  return resultCreate({
    state,
    transition: {
      kind: "render",
      route: `/login/email-otp?flow=${state.flowHandle}`,
      screen: { name: "email_otp_code" },
      csrfToken: state.csrfToken,
    } satisfies FlowV2Transition,
  })
}
