import type { FlowV2Cookie } from "../../flow/model/flowV2CookieSchema"
import type { FlowV2Transition } from "../../flow/model/flowV2TransitionSchema"
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
