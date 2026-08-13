import { primaryFlowMfaPolicyEvaluate } from "../../flow/domain/primaryFlowMfaPolicyEvaluate"
import type { FlowV2Cookie } from "../../flow/model/flowV2CookieSchema"
import type { FlowV2Transition } from "../../flow/model/flowV2TransitionSchema"
import { resultCreate } from "../../result/resultCreate"
import { resultErrorCreate } from "../../result/resultErrorCreate"
import type { zitadelClientCreate } from "../../zitadel/zitadelClientCreate"

type Input = {
  state: Extract<FlowV2Cookie, { stage: "idp_intent" }>
  providerId: string
  intentId: string
  intentToken: string
  client: ReturnType<typeof zitadelClientCreate>
}

function resultStatusGet(result: { success: boolean; rawData?: unknown }): number | undefined {
  if (result.success || typeof result.rawData !== "object" || result.rawData === null) return undefined
  if (!("status" in result.rawData) || typeof result.rawData.status !== "number") return undefined
  return result.rawData.status
}

export async function identityProviderV2CallbackProcess(input: Input) {
  const op = "identityProviderV2CallbackProcess"

  if (input.providerId !== input.state.idpId) {
    return resultErrorCreate(op, "provider_mismatch")
  }

  const retrieved = await input.client.identityProviderIntentRetrieve(input.intentId, input.intentToken)
  if (!retrieved.success) {
    return resultErrorCreate(op, "idp_intent_invalid", { status: resultStatusGet(retrieved) })
  }

  const { idpInformation, userId } = retrieved.data
  if (!idpInformation || idpInformation.idpId !== input.state.idpId) {
    return resultErrorCreate(op, "provider_mismatch")
  }

  const { idpId: _idpId, idpType: _idpType, redirectUrl: _redirectUrl, ...stateBase } = input.state

  if (userId && userId.length > 0) {
    const created = await input.client.idpIntentSessionCreate(userId, input.intentId, input.intentToken)
    if (!created.success) {
      return resultErrorCreate(op, "idp_session_failed", { status: resultStatusGet(created) })
    }

    const session = await input.client.sessionGet(created.data.sessionId, created.data.sessionToken)
    if (!session.success) {
      return resultErrorCreate(op, "authorization_unavailable", { status: resultStatusGet(session) })
    }

    if (
      session.data.session.factors?.user?.id !== userId ||
      session.data.session.factors?.user?.organizationId !== input.state.organizationId
    ) {
      return resultErrorCreate(op, "authorization_unavailable")
    }

    const user = await input.client.userGet(userId)
    if (!user.success) {
      return resultErrorCreate(op, "authorization_unavailable", { status: resultStatusGet(user) })
    }
    if (
      user.data.user.userId !== userId ||
      user.data.user.state !== "USER_STATE_ACTIVE" ||
      user.data.user.details?.resourceOwner !== input.state.organizationId ||
      !user.data.user.human
    ) {
      return resultErrorCreate(op, "authorization_unavailable")
    }

    const methods = await input.client.authenticationMethodsGet(userId)
    if (!methods.success) {
      return resultErrorCreate(op, "authorization_unavailable", { status: resultStatusGet(methods) })
    }

    const settings = await input.client.loginSettingsGet(input.state.organizationId)
    if (!settings.success) {
      return resultErrorCreate(op, "authorization_unavailable", { status: resultStatusGet(settings) })
    }

    const mfa = primaryFlowMfaPolicyEvaluate({
      method: "identity_provider",
      methods: methods.data.authMethodTypes,
      emailVerified: false,
      phoneVerified: user.data.user.human.phone?.isVerified === true,
      policy: settings.data.settings ?? {},
    })
    if (!mfa.supported) return resultErrorCreate(op, "authorization_unavailable")

    if (mfa.required) {
      const state: Extract<FlowV2Cookie, { stage: "mfa" }> = {
        ...stateBase,
        stage: "mfa",
        delegable: false,
        transitionCounter: input.state.transitionCounter + 1,
        userId,
        sessionId: created.data.sessionId,
        sessionToken: created.data.sessionToken,
        mfaMethods: mfa.methods,
      }
      const transition: FlowV2Transition = {
        kind: "render",
        route: `/login/mfa?flow=${state.flowHandle}`,
        screen: { name: "mfa", factors: mfa.methods },
        csrfToken: state.csrfToken,
      }
      return resultCreate({ state, transition })
    }

    const state: Extract<FlowV2Cookie, { stage: "verified" }> = {
      ...stateBase,
      stage: "verified",
      delegable: false,
      transitionCounter: input.state.transitionCounter + 1,
      userId,
      sessionId: created.data.sessionId,
      sessionToken: created.data.sessionToken,
    }
    const transition: FlowV2Transition = {
      kind: "complete",
      path: `/api/v2/flow/continue?flow=${state.flowHandle}`,
    }
    return resultCreate({ state, transition })
  }

  const state: Extract<FlowV2Cookie, { stage: "idp_unlinked" }> = {
    ...stateBase,
    stage: "idp_unlinked",
    delegable: false,
    transitionCounter: input.state.transitionCounter + 1,
    idpId: input.state.idpId,
    idpType: input.state.idpType,
    ...(idpInformation.userId ? { idpUserId: idpInformation.userId } : {}),
    ...(idpInformation.userName ? { idpUserName: idpInformation.userName } : {}),
  }
  const transition: FlowV2Transition = {
    kind: "render",
    route: `/login/idp/${encodeURIComponent(input.state.idpId)}/account-not-found?flow=${state.flowHandle}`,
    screen: { name: "idp_account_not_found" },
    csrfToken: state.csrfToken,
  }
  return resultCreate({ state, transition })
}
