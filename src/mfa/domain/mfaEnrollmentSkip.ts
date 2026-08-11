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

export async function mfaEnrollmentSkip(input: Input) {
  const op = "mfaEnrollmentSkip"
  const authorization = await mfaEnrollmentAuthorize(input)
  if (!authorization.success) return authorization

  const options = await mfaOptionsGet({ state: authorization.data.state, now: input.now, client: input.client })
  if (!options.success) return resultErrorCreate(op, options.errorMessage, options.rawData)
  if (options.data.options.mode !== "skip" || options.data.options.reason !== "optional_setup") {
    return resultErrorCreate(op, "mfa_skip_forbidden")
  }

  const skipped = await input.client.humanMfaInitSkipped(input.state.userId)
  if (!skipped.success) {
    return resultErrorCreate(op, "mfa_unavailable", { status: resultStatusGet(skipped) })
  }

  const { mfaMethods: _mfaMethods, options: _options, ...stateBase } = options.data.state
  const state: Extract<FlowV2Cookie, { stage: "verified" }> = {
    ...stateBase,
    stage: "verified",
    delegable: false,
    transitionCounter: input.state.transitionCounter + 1,
  }
  const transition: FlowV2Transition = {
    kind: "complete",
    path: `/api/v2/flow/continue?flow=${state.flowHandle}`,
  }
  return resultCreate({ state, transition })
}
