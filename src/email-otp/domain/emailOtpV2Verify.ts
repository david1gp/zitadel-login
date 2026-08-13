import type { FlowV2Cookie } from "../../flow/model/flowV2CookieSchema"
import type { FlowV2Transition } from "../../flow/model/flowV2TransitionSchema"
import { primaryFlowMfaPolicyEvaluate } from "../../flow/domain/primaryFlowMfaPolicyEvaluate"
import { resultCreate } from "../../result/resultCreate"
import { resultErrorCreate } from "../../result/resultErrorCreate"
import { zitadelClientCreate } from "../../zitadel/zitadelClientCreate"
import { emailOtpV2SessionIsVerified } from "./emailOtpV2SessionIsVerified"

type Input = {
  state: Extract<FlowV2Cookie, { stage: "otp" }>
  code: string
  now: number
  client: ReturnType<typeof zitadelClientCreate>
}

function resultStatusGet(result: { success: boolean; rawData?: unknown }): number | undefined {
  if (result.success || typeof result.rawData !== "object" || result.rawData === null) return undefined
  if (!("status" in result.rawData) || typeof result.rawData.status !== "number") return undefined
  return result.rawData.status
}

function mfaTransitionCreate(state: Extract<FlowV2Cookie, { stage: "mfa" }>): FlowV2Transition {
  return {
    kind: "render",
    route: `/login/mfa?flow=${state.flowHandle}`,
    screen: { name: "mfa", factors: state.mfaMethods },
    csrfToken: state.csrfToken,
  }
}

export async function emailOtpV2Verify(input: Input) {
  const op = "emailOtpV2Verify"
  const verified = await input.client.emailOtpSessionVerify(input.state.sessionId, input.state.sessionToken, input.code)
  if (!verified.success) {
    const status = resultStatusGet(verified)
    if (status !== undefined && status >= 400 && status < 500) {
      return resultErrorCreate(op, "code_invalid", { status })
    }
    return resultErrorCreate(op, "verification_unavailable", { status })
  }

  const session = await input.client.sessionGet(input.state.sessionId, verified.data.sessionToken)
  if (!session.success) return resultErrorCreate(op, "verification_unavailable", { status: resultStatusGet(session) })
  if (
    !emailOtpV2SessionIsVerified(
      session.data.session,
      {
        sessionId: input.state.sessionId,
        userId: input.state.userId,
        organizationId: input.state.organizationId,
        verifiedNotBefore: input.state.issuedAt - 60,
      },
      input.now,
    )
  ) {
    return resultErrorCreate(op, "continuation_not_owned")
  }

  const user = await input.client.userGet(input.state.userId)
  if (!user.success) return resultErrorCreate(op, "verification_unavailable", { status: resultStatusGet(user) })
  if (
    user.data.user.userId !== input.state.userId ||
    user.data.user.state !== "USER_STATE_ACTIVE" ||
    user.data.user.details?.resourceOwner !== input.state.organizationId ||
    !user.data.user.human
  ) {
    return resultErrorCreate(op, "authorization_unavailable")
  }

  const methods = await input.client.authenticationMethodsGet(input.state.userId)
  if (!methods.success) {
    return resultErrorCreate(op, "verification_unavailable", { status: resultStatusGet(methods) })
  }
  const settings = await input.client.loginSettingsGet(input.state.organizationId)
  if (!settings.success) {
    return resultErrorCreate(op, "verification_unavailable", { status: resultStatusGet(settings) })
  }

  const mfa = primaryFlowMfaPolicyEvaluate({
    method: "email_otp",
    methods: methods.data.authMethodTypes,
    emailVerified: user.data.user.human.email?.isVerified === true,
    phoneVerified: user.data.user.human.phone?.isVerified === true,
    policy: settings.data.settings ?? {},
  })
  if (!mfa.supported) return resultErrorCreate(op, "authorization_unavailable")

  if (mfa.required) {
    const state: Extract<FlowV2Cookie, { stage: "mfa" }> = {
      ...input.state,
      stage: "mfa",
      transitionCounter: input.state.transitionCounter + 1,
      sessionToken: verified.data.sessionToken,
      mfaMethods: mfa.methods,
    }
    return resultCreate({ state, transition: mfaTransitionCreate(state) })
  }

  const state: Extract<FlowV2Cookie, { stage: "verified" }> = {
    ...input.state,
    stage: "verified",
    transitionCounter: input.state.transitionCounter + 1,
    sessionToken: verified.data.sessionToken,
  }
  return resultCreate({
    state,
    transition: {
      kind: "complete",
      path: `/api/v2/flow/continue?flow=${state.flowHandle}`,
    } satisfies FlowV2Transition,
  })
}
