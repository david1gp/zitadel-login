import { emailOtpCooldownClientCreate } from "../cooldown/emailOtpCooldownClientCreate"
import { emailOtpCooldownSendReserve } from "../cooldown/emailOtpCooldownSendReserve"
import type { FlowV2Cookie } from "../../flow/model/flowV2CookieSchema"
import type { FlowV2Transition } from "../../flow/model/flowV2TransitionSchema"
import { resultCreate } from "../../result/resultCreate"
import { resultErrorCreate } from "../../result/resultErrorCreate"
import { zitadelClientCreate } from "../../zitadel/zitadelClientCreate"

type Input = {
  state: Extract<FlowV2Cookie, { stage: "otp" }>
  now: number
  client: ReturnType<typeof zitadelClientCreate>
  cooldown: ReturnType<typeof emailOtpCooldownClientCreate>
}

function resultStatusGet(result: { success: boolean; rawData?: unknown }): number | undefined {
  if (result.success || typeof result.rawData !== "object" || result.rawData === null) return undefined
  if (!("status" in result.rawData) || typeof result.rawData.status !== "number") return undefined
  return result.rawData.status
}

export async function emailOtpV2Resend(input: Input) {
  const op = "emailOtpV2Resend"
  const reserved = await emailOtpCooldownSendReserve(input.cooldown, input.now)
  if (!reserved.success) return reserved
  const challenged = await input.client.emailOtpSessionChallenge(input.state.sessionId, input.state.sessionToken)
  if (!challenged.success) {
    const status = resultStatusGet(challenged)
    if (status !== undefined && status >= 400 && status < 500) {
      return resultErrorCreate(op, "challenge_expired", { status })
    }
    return resultErrorCreate(op, "challenge_unavailable", { status })
  }

  const state: Extract<FlowV2Cookie, { stage: "otp" }> = {
    ...input.state,
    transitionCounter: input.state.transitionCounter + 1,
    sessionToken: challenged.data.sessionToken,
    cooldownExpiresAt: reserved.data,
  }
  return resultCreate({
    state,
    transition: {
      kind: "render",
      route: `/login/email-otp?flow=${state.flowHandle}`,
      screen: { name: "email_otp_code" },
      csrfToken: state.csrfToken,
    } satisfies FlowV2Transition,
  })
}
