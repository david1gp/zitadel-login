import { emailOtpCooldownClientCreate } from "../../email-otp/cooldown/emailOtpCooldownClientCreate"
import { emailOtpCooldownSendReserve } from "../../email-otp/cooldown/emailOtpCooldownSendReserve"
import type { FlowV2Cookie } from "../../flow/model/flowV2CookieSchema"
import type { FlowV2Transition } from "../../flow/model/flowV2TransitionSchema"
import { resultCreate } from "../../result/resultCreate"
import type { zitadelClientCreate } from "../../zitadel/zitadelClientCreate"
import { mfaOptionsGet } from "./mfaOptionsGet"

type Input = {
  state: Extract<FlowV2Cookie, { stage: "mfa_email_otp_code" }>
  now: number
  client: ReturnType<typeof zitadelClientCreate>
  cooldown: ReturnType<typeof emailOtpCooldownClientCreate>
}

function pendingStateCreate(state: Input["state"]): Extract<FlowV2Cookie, { stage: "mfa" }> {
  const {
    enrollmentActivationConsumedAt: _enrollmentActivationConsumedAt,
    challengeIssuedAt: _challengeIssuedAt,
    cooldownExpiresAt: _cooldownExpiresAt,
    ...stateBase
  } = state
  return { ...stateBase, stage: "mfa" }
}

function transitionCreate(state: Input["state"]): FlowV2Transition {
  return {
    kind: "render",
    route: `/login/mfa?flow=${state.flowHandle}`,
    screen: {
      name: "mfa_email_otp_code",
      challengeIssued: state.challengeIssuedAt !== undefined,
      enrollment: true,
    },
    csrfToken: state.csrfToken,
  }
}

function fallbackCreate(state: Input["state"]) {
  return resultCreate({
    state,
    transition: {
      kind: "fallback",
      path: `/api/v2/flow/fallback?flow=${state.flowHandle}`,
    } satisfies FlowV2Transition,
  })
}

export async function mfaV2EmailOtpEnrollmentActivate(input: Input) {
  const enrolled = await input.client.addOTPEmail(input.state.userId)
  if (!enrolled.success && enrolled.errorMessage !== "method_already_enrolled") {
    const recovery = await mfaOptionsGet({
      state: pendingStateCreate(input.state),
      now: input.now,
      client: input.client,
    })
    const recoverable =
      recovery.success &&
      ((recovery.data.options.mode === "check" && recovery.data.options.method.type === "email_otp") ||
        (recovery.data.options.mode === "select" &&
          recovery.data.options.methods.some((method) => method.type === "email_otp")))
    if (!recoverable) return fallbackCreate(input.state)
  }

  const mfaMethods = input.state.mfaMethods.includes("AUTHENTICATION_METHOD_TYPE_OTP_EMAIL")
    ? input.state.mfaMethods
    : [...input.state.mfaMethods, "AUTHENTICATION_METHOD_TYPE_OTP_EMAIL"]
  const reserved = await emailOtpCooldownSendReserve(input.cooldown, input.now)
  if (!reserved.success) return reserved
  const challenged = await input.client.emailOtpSessionChallenge(input.state.sessionId, input.state.sessionToken)
  if (!challenged.success) {
    const state = { ...input.state, mfaMethods }
    return resultCreate({ state, transition: transitionCreate(state) })
  }

  const state: Extract<FlowV2Cookie, { stage: "mfa_email_otp_code" }> = {
    ...input.state,
    mfaMethods,
    sessionToken: challenged.data.sessionToken ?? input.state.sessionToken,
    challengeIssuedAt: input.now,
    cooldownExpiresAt: reserved.data,
  }
  return resultCreate({ state, transition: transitionCreate(state) })
}
