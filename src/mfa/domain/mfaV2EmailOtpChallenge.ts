import { emailOtpCooldownClientCreate } from "../../email-otp/cooldown/emailOtpCooldownClientCreate"
import { emailOtpCooldownSendReserve } from "../../email-otp/cooldown/emailOtpCooldownSendReserve"
import type { FlowV2Cookie } from "../../flow/model/flowV2CookieSchema"
import type { FlowV2Transition } from "../../flow/model/flowV2TransitionSchema"
import { resultCreate } from "../../result/resultCreate"
import { resultErrorCreate } from "../../result/resultErrorCreate"
import type { zitadelClientCreate } from "../../zitadel/zitadelClientCreate"
import { mfaOptionsGet } from "./mfaOptionsGet"

type Input = {
  state: Extract<FlowV2Cookie, { stage: "mfa" | "mfa_email_otp_code" }>
  method?: string
  now: number
  client: ReturnType<typeof zitadelClientCreate>
  cooldown: ReturnType<typeof emailOtpCooldownClientCreate>
}

function resultStatusGet(result: { success: boolean; rawData?: unknown }): number | undefined {
  if (result.success || typeof result.rawData !== "object" || result.rawData === null) return undefined
  if (!("status" in result.rawData) || typeof result.rawData.status !== "number") return undefined
  return result.rawData.status
}

export async function mfaV2EmailOtpChallenge(input: Input) {
  const op = "mfaV2EmailOtpChallenge"

  if (
    input.method !== undefined &&
    input.method !== "email_otp" &&
    input.method !== "otp_email" &&
    input.method !== "AUTHENTICATION_METHOD_TYPE_OTP_EMAIL"
  ) {
    return resultErrorCreate(op, "method_not_enrolled")
  }

  if (input.state.expiresAt <= input.now) return resultErrorCreate(op, "flow_expired")

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
  const optionsResult = await mfaOptionsGet({
    state: pendingState,
    now: input.now,
    client: input.client,
  })
  if (!optionsResult.success) {
    return resultErrorCreate(op, optionsResult.errorMessage, optionsResult.rawData)
  }

  const { options, state: currentState } = optionsResult.data

  const isEnrolled =
    (options.mode === "check" && options.method.type === "email_otp") ||
    (options.mode === "select" && options.methods.some((method) => method.type === "email_otp"))

  if (!isEnrolled) {
    return resultErrorCreate(op, "method_not_enrolled")
  }

  const reserved = await emailOtpCooldownSendReserve(input.cooldown, input.now)
  if (!reserved.success) return reserved

  const challenged = await input.client.emailOtpSessionChallenge(currentState.sessionId, currentState.sessionToken)
  if (!challenged.success) {
    const status = resultStatusGet(challenged)
    if (status === 401 || status === 404) {
      return resultErrorCreate(op, "session_stale", { status })
    }
    return resultErrorCreate(op, "challenge_unavailable", { status })
  }

  const latestToken = challenged.data.sessionToken ?? currentState.sessionToken
  const state: Extract<FlowV2Cookie, { stage: "mfa_email_otp_code" }> = {
    ...currentState,
    stage: "mfa_email_otp_code",
    sessionToken: latestToken,
    transitionCounter: currentState.transitionCounter + 1,
    ...(input.state.stage === "mfa_email_otp_code" && input.state.enrollmentActivationConsumedAt !== undefined
      ? { enrollmentActivationConsumedAt: input.state.enrollmentActivationConsumedAt }
      : {}),
    challengeIssuedAt: input.now,
    cooldownExpiresAt: reserved.data,
  }

  const transition: FlowV2Transition = {
    kind: "render",
    route: `/login/mfa?flow=${state.flowHandle}`,
    screen: {
      name: "mfa_email_otp_code",
      challengeIssued: true,
      enrollment: state.enrollmentActivationConsumedAt !== undefined,
    },
    csrfToken: state.csrfToken,
  }

  return resultCreate({ state, transition })
}
