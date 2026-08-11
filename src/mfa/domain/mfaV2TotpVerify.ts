import type { FlowV2Cookie } from "../../flow/model/flowV2CookieSchema"
import type { FlowV2Transition } from "../../flow/model/flowV2TransitionSchema"
import { resultCreate } from "../../result/resultCreate"
import { resultErrorCreate } from "../../result/resultErrorCreate"
import type { zitadelClientCreate } from "../../zitadel/zitadelClientCreate"
import { mfaOptionsGet } from "./mfaOptionsGet"

type Input = {
  state: Extract<FlowV2Cookie, { stage: "mfa" }>
  code: string
  now: number
  client: ReturnType<typeof zitadelClientCreate>
}

function resultStatusGet(result: { success: boolean; rawData?: unknown }): number | undefined {
  if (result.success || typeof result.rawData !== "object" || result.rawData === null) return undefined
  if (!("status" in result.rawData) || typeof result.rawData.status !== "number") return undefined
  return result.rawData.status
}

export async function mfaV2TotpVerify(input: Input) {
  const op = "mfaV2TotpVerify"

  const isEnrolled = input.state.mfaMethods.some(
    (method) => method === "AUTHENTICATION_METHOD_TYPE_TOTP" || method === "totp",
  )
  if (!isEnrolled) {
    return resultErrorCreate(op, "method_not_enrolled")
  }

  const verified = await input.client.totpSessionVerify(input.state.sessionId, input.state.sessionToken, input.code)
  if (!verified.success) {
    const status = resultStatusGet(verified)
    if (status !== undefined && status >= 400 && status < 500) {
      return resultErrorCreate(op, "code_invalid", { status })
    }
    return resultErrorCreate(op, "mfa_unavailable", { status })
  }

  const latestToken = verified.data.sessionToken ?? input.state.sessionToken
  const updatedMfaState: Extract<FlowV2Cookie, { stage: "mfa" }> = {
    ...input.state,
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

  const { options } = optionsResult.data
  const { mfaMethods: _mfaMethods, ...stateBase } = input.state

  if (options.mode === "skip") {
    const state: Extract<FlowV2Cookie, { stage: "verified" }> = {
      ...stateBase,
      stage: "verified",
      delegable: false,
      transitionCounter: input.state.transitionCounter + 1,
      sessionToken: latestToken,
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
    return resultCreate({ state: input.state, transition })
  }

  const state: Extract<FlowV2Cookie, { stage: "mfa" }> = {
    ...input.state,
    sessionToken: latestToken,
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
