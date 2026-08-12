import type { FlowV2Cookie } from "../../flow/model/flowV2CookieSchema"
import type { FlowV2Transition } from "../../flow/model/flowV2TransitionSchema"
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

function resultStatusGet(result: { success: boolean; rawData?: unknown }): number | undefined {
  if (result.success || typeof result.rawData !== "object" || result.rawData === null) return undefined
  if (!("status" in result.rawData) || typeof result.rawData.status !== "number") return undefined
  return result.rawData.status
}

export async function mfaV2TotpEnrollmentStart(input: Input) {
  const op = "mfaV2TotpEnrollmentStart"
  if (input.state.expiresAt <= input.now) return resultErrorCreate(op, "flow_expired")

  const authorized = await mfaEnrollmentAuthorize(input)
  if (!authorized.success) {
    return resultErrorCreate(op, authorized.errorMessage, authorized.rawData)
  }
  const current = await mfaOptionsGet({
    state: authorized.data.state,
    now: input.now,
    client: input.client,
  })
  if (!current.success) return resultErrorCreate(op, current.errorMessage, current.rawData)

  const options = current.data.options
  const totpIsEnrolled =
    (options.mode === "check" && options.method.type === "totp") ||
    (options.mode === "select" && options.methods.some((method) => method.type === "totp"))
  if (totpIsEnrolled) return resultErrorCreate(op, "method_already_enrolled")
  if (options.mode !== "enroll" || !options.methods.some((method) => method.type === "totp")) {
    return resultErrorCreate(op, "mfa_enrollment_not_allowed")
  }

  const created = await input.client.totpEnrollmentCreate(current.data.state.userId)
  if (!created.success) {
    return resultErrorCreate(op, "enrollment_unavailable", { status: resultStatusGet(created) })
  }

  const { options: _options, ...stateBase } = current.data.state
  const state: Extract<FlowV2Cookie, { stage: "mfa_totp_setup" }> = {
    ...stateBase,
    stage: "mfa_totp_setup",
    transitionCounter: current.data.state.transitionCounter + 1,
    enrollmentStartedAt: input.now,
  }
  const transition: FlowV2Transition = {
    kind: "render",
    route: `/login/mfa?flow=${state.flowHandle}`,
    screen: { name: "mfa_totp_setup" },
    csrfToken: state.csrfToken,
  }
  return resultCreate({
    state,
    provisioningUri: created.data.uri,
    secret: created.data.secret,
    transition,
  })
}
