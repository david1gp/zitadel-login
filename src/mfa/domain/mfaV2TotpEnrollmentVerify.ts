import type { FlowV2Cookie } from "../../flow/model/flowV2CookieSchema"
import type { FlowV2Transition } from "../../flow/model/flowV2TransitionSchema"
import { resultCreate } from "../../result/resultCreate"
import { resultErrorCreate } from "../../result/resultErrorCreate"
import type { zitadelClientCreate } from "../../zitadel/zitadelClientCreate"
import type { MfaOptions } from "../model/mfaOptionsSchema"
import { mfaEnrollmentAuthorize } from "./mfaEnrollmentAuthorize"
import { mfaOptionsGet } from "./mfaOptionsGet"

type Input = {
  state: Extract<FlowV2Cookie, { stage: "mfa_totp_setup" }>
  code: string
  now: number
  client: ReturnType<typeof zitadelClientCreate>
}

function resultStatusGet(result: { success: boolean; rawData?: unknown }): number | undefined {
  if (result.success || typeof result.rawData !== "object" || result.rawData === null) return undefined
  if (!("status" in result.rawData) || typeof result.rawData.status !== "number") return undefined
  return result.rawData.status
}

function mfaContinuationCreate(state: Extract<FlowV2Cookie, { stage: "mfa" }>, options?: MfaOptions) {
  if (options?.mode === "skip") {
    const { mfaMethods: _mfaMethods, options: _options, ...stateBase } = state
    const verifiedState: Extract<FlowV2Cookie, { stage: "verified" }> = {
      ...stateBase,
      stage: "verified",
      delegable: false,
    }
    const transition: FlowV2Transition = {
      kind: "complete",
      path: `/api/v2/flow/continue?flow=${state.flowHandle}`,
    }
    return resultCreate({ state: verifiedState, transition })
  }

  if (options?.mode === "fallback") {
    const transition: FlowV2Transition = {
      kind: "fallback",
      path: `/api/v2/flow/fallback?flow=${state.flowHandle}`,
    }
    return resultCreate({ state, transition })
  }

  const transition: FlowV2Transition = {
    kind: "render",
    route: `/login/mfa?flow=${state.flowHandle}`,
    screen: { name: "mfa", factors: state.mfaMethods },
    csrfToken: state.csrfToken,
  }
  return resultCreate({ state, transition })
}

export async function mfaV2TotpEnrollmentVerify(input: Input) {
  const op = "mfaV2TotpEnrollmentVerify"
  if (input.state.expiresAt <= input.now) return resultErrorCreate(op, "flow_expired")
  if (!/^\d{6}$/.test(input.code)) return resultErrorCreate(op, "code_invalid")

  const { enrollmentStartedAt: _enrollmentStartedAt, ...stateBase } = input.state
  const pendingState: Extract<FlowV2Cookie, { stage: "mfa" }> = {
    ...stateBase,
    stage: "mfa",
  }
  const authorized = await mfaEnrollmentAuthorize({ state: pendingState, now: input.now, client: input.client })
  if (!authorized.success) return resultErrorCreate(op, authorized.errorMessage, authorized.rawData)

  const current = await mfaOptionsGet({ state: authorized.data.state, now: input.now, client: input.client })
  if (!current.success) return resultErrorCreate(op, current.errorMessage, current.rawData)

  const currentOptions = current.data.options
  const totpIsEnrolled =
    (currentOptions.mode === "check" && currentOptions.method.type === "totp") ||
    (currentOptions.mode === "select" && currentOptions.methods.some((method) => method.type === "totp")) ||
    (currentOptions.mode === "skip" && currentOptions.reason === "factor_satisfied")
  const totpEnrollmentIsAllowed =
    currentOptions.mode === "enroll" && currentOptions.methods.some((method) => method.type === "totp")
  if (!totpIsEnrolled && !totpEnrollmentIsAllowed) {
    return resultErrorCreate(op, "mfa_enrollment_not_allowed")
  }

  const mfaMethods = current.data.state.mfaMethods.includes("AUTHENTICATION_METHOD_TYPE_TOTP")
    ? current.data.state.mfaMethods
    : [...current.data.state.mfaMethods, "AUTHENTICATION_METHOD_TYPE_TOTP"]
  const enrolledState: Extract<FlowV2Cookie, { stage: "mfa" }> = {
    ...current.data.state,
    mfaMethods,
    transitionCounter: input.state.transitionCounter + 1,
  }

  if (totpIsEnrolled && currentOptions.mode === "skip") {
    return mfaContinuationCreate(enrolledState, currentOptions)
  }

  if (!totpIsEnrolled) {
    const enrollment = await input.client.totpEnrollmentVerify(input.state.userId, input.code)
    if (!enrollment.success) {
      const status = resultStatusGet(enrollment)
      if (status !== undefined && status >= 400 && status < 500) {
        return resultErrorCreate(op, "code_invalid", { status })
      }
      return resultErrorCreate(op, "enrollment_unavailable", { status })
    }
  }

  const session = await input.client.totpSessionVerify(enrolledState.sessionId, enrolledState.sessionToken, input.code)
  if (!session.success) return mfaContinuationCreate(enrolledState)

  const checkedState: Extract<FlowV2Cookie, { stage: "mfa" }> = {
    ...enrolledState,
    sessionToken: session.data.sessionToken ?? enrolledState.sessionToken,
  }
  const postOptions = await mfaOptionsGet({ state: checkedState, now: input.now, client: input.client })
  if (!postOptions.success) return mfaContinuationCreate(checkedState)

  return mfaContinuationCreate(postOptions.data.state, postOptions.data.options)
}
