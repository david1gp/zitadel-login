import type { FlowV2Cookie } from "../../flow/model/flowV2CookieSchema"
import type { FlowV2Transition } from "../../flow/model/flowV2TransitionSchema"
import { resultCreate } from "../../result/resultCreate"
import { resultErrorCreate } from "../../result/resultErrorCreate"
import type { zitadelClientCreate } from "../../zitadel/zitadelClientCreate"
import type { MfaOptions } from "../model/mfaOptionsSchema"
import { mfaOptionsGet } from "./mfaOptionsGet"

type Input = {
  state: Extract<FlowV2Cookie, { stage: "mfa" | "mfa_email_otp_code" }>
  code: string
  method?: string
  now: number
  client: ReturnType<typeof zitadelClientCreate>
}

function resultStatusGet(result: { success: boolean; rawData?: unknown }): number | undefined {
  if (result.success || typeof result.rawData !== "object" || result.rawData === null) return undefined
  if (!("status" in result.rawData) || typeof result.rawData.status !== "number") return undefined
  return result.rawData.status
}

export async function mfaV2EmailOtpVerify(input: Input) {
  const op = "mfaV2EmailOtpVerify"
  if (input.state.expiresAt <= input.now) return resultErrorCreate(op, "flow_expired")

  if (
    input.method !== undefined &&
    input.method !== "email_otp" &&
    input.method !== "otp_email" &&
    input.method !== "AUTHENTICATION_METHOD_TYPE_OTP_EMAIL"
  ) {
    return resultErrorCreate(op, "method_not_enrolled")
  }

  const isEnrolled = input.state.mfaMethods.some(
    (method) => method === "AUTHENTICATION_METHOD_TYPE_OTP_EMAIL" || method === "email_otp" || method === "otp_email",
  )
  if (!isEnrolled) {
    return resultErrorCreate(op, "method_not_enrolled")
  }

  const pendingState: Extract<FlowV2Cookie, { stage: "mfa" }> =
    input.state.stage === "mfa"
      ? input.state
      : (({
          enrollmentActivationConsumedAt: _consumed,
          challengeIssuedAt: _issued,
          cooldownExpiresAt: _cooldown,
          ...stateBase
        }) => ({
          ...stateBase,
          stage: "mfa" as const,
        }))(input.state)
  if (input.state.stage === "mfa_email_otp_code" && input.state.challengeIssuedAt === undefined) {
    return resultErrorCreate(op, "challenge_expired")
  }

  const current =
    input.state.stage === "mfa_email_otp_code"
      ? await mfaOptionsGet({ state: pendingState, now: input.now, client: input.client })
      : resultCreate({ state: pendingState })
  if (!current.success) return resultErrorCreate(op, current.errorMessage, current.rawData)
  const currentState = current.data.state
  const currentOptions: MfaOptions | undefined =
    "options" in current.data ? (current.data.options as MfaOptions) : undefined
  if (currentOptions?.mode === "skip" && currentOptions.reason === "factor_satisfied") {
    const { mfaMethods: _mfaMethods, ...stateBase } = currentState
    const state: Extract<FlowV2Cookie, { stage: "verified" }> = {
      ...stateBase,
      stage: "verified",
      delegable: false,
      transitionCounter: input.state.transitionCounter + 1,
    }
    return resultCreate({
      state,
      transition: {
        kind: "complete",
        path: `/api/v2/flow/continue?flow=${state.flowHandle}`,
      } satisfies FlowV2Transition,
    })
  }
  if (currentOptions?.mode === "fallback") {
    const fallbackState =
      input.state.stage === "mfa_email_otp_code"
        ? { ...input.state, sessionToken: currentState.sessionToken }
        : currentState
    return resultCreate({
      state: fallbackState,
      transition: {
        kind: "fallback",
        path: `/api/v2/flow/fallback?flow=${input.state.flowHandle}`,
      } satisfies FlowV2Transition,
    })
  }
  const methodIsCurrent =
    currentOptions === undefined ||
    (currentOptions.mode === "check" && currentOptions.method.type === "email_otp") ||
    (currentOptions.mode === "select" && currentOptions.methods.some((method) => method.type === "email_otp"))
  if (!methodIsCurrent) return resultErrorCreate(op, "mfa_enrollment_not_allowed")

  const verified = await input.client.emailOtpSessionVerify(
    currentState.sessionId,
    currentState.sessionToken,
    input.code,
  )
  if (!verified.success) {
    const status = resultStatusGet(verified)
    if (status !== undefined && status >= 400 && status < 500) {
      return resultErrorCreate(op, "code_invalid", { status })
    }
    return resultErrorCreate(op, "mfa_unavailable", { status })
  }

  const latestToken = verified.data.sessionToken ?? currentState.sessionToken
  const updatedMfaState: Extract<FlowV2Cookie, { stage: "mfa" }> = {
    ...currentState,
    sessionToken: latestToken,
  }

  const optionsResult = await mfaOptionsGet({
    state: updatedMfaState,
    now: input.now,
    client: input.client,
  })
  if (!optionsResult.success) {
    return resultErrorCreate(op, optionsResult.errorMessage, optionsResult.rawData)
  }

  const { options, state: postCheckState } = optionsResult.data
  const { mfaMethods: _mfaMethods, ...stateBase } = postCheckState

  if (options.mode === "skip") {
    const state: Extract<FlowV2Cookie, { stage: "verified" }> = {
      ...stateBase,
      stage: "verified",
      delegable: false,
      transitionCounter: input.state.transitionCounter + 1,
      sessionToken: postCheckState.sessionToken,
    }
    const transition: FlowV2Transition = {
      kind: "complete",
      path: `/api/v2/flow/continue?flow=${state.flowHandle}`,
    }
    return resultCreate({ state, transition })
  }

  if (options.mode === "fallback") {
    const transition: FlowV2Transition = {
      kind: "fallback",
      path: `/api/v2/flow/fallback?flow=${input.state.flowHandle}`,
    }
    return resultCreate({ state: postCheckState, transition })
  }

  const state: Extract<FlowV2Cookie, { stage: "mfa" }> = {
    ...postCheckState,
    transitionCounter: input.state.transitionCounter + 1,
  }
  const transition: FlowV2Transition = {
    kind: "render",
    route: `/login/mfa?flow=${state.flowHandle}`,
    screen: { name: "mfa", factors: state.mfaMethods },
    csrfToken: state.csrfToken,
  }
  return resultCreate({ state, transition })
}
