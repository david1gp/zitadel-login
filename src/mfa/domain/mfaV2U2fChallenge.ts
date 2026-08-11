import * as v from "valibot"

import type { FlowV2Cookie } from "../../flow/model/flowV2CookieSchema"
import type { FlowV2Transition } from "../../flow/model/flowV2TransitionSchema"
import { passkeyOptionsSchema } from "../../passkey/model/passkeyOptionsSchema"
import { resultCreate } from "../../result/resultCreate"
import { resultErrorCreate } from "../../result/resultErrorCreate"
import type { zitadelClientCreate } from "../../zitadel/zitadelClientCreate"
import { mfaOptionsGet } from "./mfaOptionsGet"

type Input = {
  state: Extract<FlowV2Cookie, { stage: "mfa" }>
  method?: string
  rpId: string
  now: number
  client: ReturnType<typeof zitadelClientCreate>
}

function resultStatusGet(result: { success: boolean; rawData?: unknown }): number | undefined {
  if (result.success || typeof result.rawData !== "object" || result.rawData === null) return undefined
  if (!("status" in result.rawData) || typeof result.rawData.status !== "number") return undefined
  return result.rawData.status
}

function passkeyOptionsParse(raw: unknown) {
  if (typeof raw !== "object" || raw === null) return undefined
  const candidate = "publicKey" in raw ? raw : { publicKey: raw }
  const parsed = v.safeParse(passkeyOptionsSchema, candidate)
  if (parsed.success) return parsed.output
  return undefined
}

export async function mfaV2U2fChallenge(input: Input) {
  const op = "mfaV2U2fChallenge"

  if (
    input.method !== undefined &&
    input.method !== "u2f" &&
    input.method !== "passkey" &&
    input.method !== "AUTHENTICATION_METHOD_TYPE_U2F"
  ) {
    return resultErrorCreate(op, "method_not_enrolled")
  }

  const optionsResult = await mfaOptionsGet({
    state: input.state,
    now: input.now,
    client: input.client,
  })
  if (!optionsResult.success) {
    return resultErrorCreate(op, optionsResult.errorMessage, optionsResult.rawData)
  }

  const { options, state: currentState } = optionsResult.data

  const targetFactor =
    input.method === "passkey"
      ? "passkey"
      : input.method === "u2f" || input.method === "AUTHENTICATION_METHOD_TYPE_U2F"
        ? "u2f"
        : options.mode === "check"
          ? options.method.type === "passkey"
            ? "passkey"
            : "u2f"
          : options.mode === "select" && options.methods.some((m) => m.type === "u2f")
            ? "u2f"
            : options.mode === "select" && options.methods.some((m) => m.type === "passkey")
              ? "passkey"
              : "u2f"

  const isEnrolled =
    (options.mode === "check" && options.method.type === targetFactor) ||
    (options.mode === "select" && options.methods.some((method) => method.type === targetFactor))

  if (!isEnrolled) {
    return resultErrorCreate(op, "method_not_enrolled")
  }

  const userVerificationRequirement =
    targetFactor === "passkey" ? "USER_VERIFICATION_REQUIREMENT_REQUIRED" : "USER_VERIFICATION_REQUIREMENT_DISCOURAGED"

  const challenged = await input.client.u2fSessionChallenge(
    currentState.sessionId,
    currentState.sessionToken,
    input.rpId,
    userVerificationRequirement,
  )
  if (!challenged.success) {
    const status = resultStatusGet(challenged)
    if (status === 401 || status === 404) {
      return resultErrorCreate(op, "session_stale", { status })
    }
    return resultErrorCreate(op, "challenge_unavailable", { status })
  }

  const rawOptions = challenged.data.challenges?.webAuthN?.publicKeyCredentialRequestOptions
  const passkeyOptions = passkeyOptionsParse(rawOptions)
  if (!passkeyOptions) {
    return resultErrorCreate(op, "challenge_unavailable")
  }

  const latestToken = challenged.data.sessionToken ?? currentState.sessionToken
  const state: Extract<FlowV2Cookie, { stage: "mfa" }> = {
    ...currentState,
    sessionToken: latestToken,
    transitionCounter: currentState.transitionCounter + 1,
    options: passkeyOptions,
  }

  const transition: FlowV2Transition = {
    kind: "render",
    route: `/login/mfa?flow=${state.flowHandle}`,
    screen: {
      name: "mfa",
      factors: state.mfaMethods,
      options: passkeyOptions,
    },
    csrfToken: state.csrfToken,
  }

  return resultCreate({ state, transition })
}
