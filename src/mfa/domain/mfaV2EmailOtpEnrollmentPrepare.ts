import type { FlowV2Cookie } from "../../flow/model/flowV2CookieSchema"
import { resultCreate } from "../../result/resultCreate"
import { resultErrorCreate } from "../../result/resultErrorCreate"
import type { zitadelClientCreate } from "../../zitadel/zitadelClientCreate"
import { mfaEnrollmentAuthorize } from "./mfaEnrollmentAuthorize"
import { mfaOptionsGet } from "./mfaOptionsGet"

type Input = {
  state: Extract<FlowV2Cookie, { stage: "mfa" }>
  now: number
  client: ReturnType<typeof zitadelClientCreate>
}

export async function mfaV2EmailOtpEnrollmentPrepare(input: Input) {
  const op = "mfaV2EmailOtpEnrollmentPrepare"
  if (input.state.expiresAt <= input.now) return resultErrorCreate(op, "flow_expired")

  const authorized = await mfaEnrollmentAuthorize(input)
  if (!authorized.success) return resultErrorCreate(op, authorized.errorMessage, authorized.rawData)

  const methods = await input.client.authenticationMethodsGet(authorized.data.state.userId)
  if (!methods.success) return resultErrorCreate(op, "mfa_unavailable")
  if (methods.data.authMethodTypes.includes("AUTHENTICATION_METHOD_TYPE_OTP_EMAIL")) {
    return resultErrorCreate(op, "method_already_enrolled")
  }

  const current = await mfaOptionsGet({ state: authorized.data.state, now: input.now, client: input.client })
  if (!current.success) return resultErrorCreate(op, current.errorMessage, current.rawData)

  const options = current.data.options
  const alreadyEnrolled =
    (options.mode === "check" && options.method.type === "email_otp") ||
    (options.mode === "select" && options.methods.some((method) => method.type === "email_otp"))
  if (alreadyEnrolled) return resultErrorCreate(op, "method_already_enrolled")

  const allowed =
    (options.mode === "enroll" || (options.mode === "skip" && options.reason === "optional_setup")) &&
    options.methods.some((method) => method.type === "email_otp")
  if (!allowed) return resultErrorCreate(op, "mfa_enrollment_not_allowed")

  const { options: _options, ...stateBase } = current.data.state
  const state: Extract<FlowV2Cookie, { stage: "mfa_email_otp_code" }> = {
    ...stateBase,
    stage: "mfa_email_otp_code",
    transitionCounter: current.data.state.transitionCounter + 1,
    enrollmentActivationConsumedAt: input.now,
  }
  return resultCreate({ state })
}
