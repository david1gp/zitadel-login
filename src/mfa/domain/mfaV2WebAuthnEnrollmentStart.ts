import type { FlowV2Cookie } from "../../flow/model/flowV2CookieSchema"
import type { FlowV2Transition } from "../../flow/model/flowV2TransitionSchema"
import { resultCreate } from "../../result/resultCreate"
import { resultErrorCreate } from "../../result/resultErrorCreate"
import type { zitadelClientCreate } from "../../zitadel/zitadelClientCreate"
import { mfaEnrollmentAuthorize } from "./mfaEnrollmentAuthorize"
import { mfaOptionsGet } from "./mfaOptionsGet"

type Input = {
  state: Extract<FlowV2Cookie, { stage: "mfa" }>
  method: "u2f" | "passkey"
  rpId: string
  origin: string
  now: number
  client: ReturnType<typeof zitadelClientCreate>
}

function resultStatusGet(result: { success: boolean; rawData?: unknown }): number | undefined {
  if (result.success || typeof result.rawData !== "object" || result.rawData === null) return undefined
  if (!("status" in result.rawData) || typeof result.rawData.status !== "number") return undefined
  return result.rawData.status
}

export async function mfaV2WebAuthnEnrollmentStart(input: Input) {
  const op = "mfaV2WebAuthnEnrollmentStart"
  if (input.state.expiresAt <= input.now) return resultErrorCreate(op, "flow_expired")

  const authorized = await mfaEnrollmentAuthorize(input)
  if (!authorized.success) return resultErrorCreate(op, authorized.errorMessage, authorized.rawData)

  const current = await mfaOptionsGet({
    state: authorized.data.state,
    now: input.now,
    client: input.client,
  })
  if (!current.success) return resultErrorCreate(op, current.errorMessage, current.rawData)

  const options = current.data.options
  const methodIsEnrolled =
    (options.mode === "check" && options.method.type === input.method) ||
    (options.mode === "select" && options.methods.some((method) => method.type === input.method))
  if (methodIsEnrolled) return resultErrorCreate(op, "method_already_enrolled")

  const enrollmentIsAllowed =
    (options.mode === "enroll" || (options.mode === "skip" && options.reason === "optional_setup")) &&
    options.methods.some((method) => method.type === input.method)
  if (!enrollmentIsAllowed) return resultErrorCreate(op, "mfa_enrollment_not_allowed")

  let registrationId: string
  let creationOptions
  if (input.method === "u2f") {
    const registered = await input.client.registerU2F(current.data.state.userId, input.rpId)
    if (!registered.success) {
      return resultErrorCreate(op, "enrollment_unavailable", { status: resultStatusGet(registered) })
    }
    registrationId = registered.data.u2fId
    creationOptions = registered.data.publicKeyCredentialCreationOptions
  } else {
    const registered = await input.client.registerPasskey(current.data.state.userId, input.rpId)
    if (!registered.success) {
      return resultErrorCreate(op, "enrollment_unavailable", { status: resultStatusGet(registered) })
    }
    registrationId = registered.data.passkeyId
    creationOptions = registered.data.publicKeyCredentialCreationOptions
  }
  const publicKey = creationOptions.publicKey
  if (publicKey.rp.id !== input.rpId) return resultErrorCreate(op, "enrollment_unavailable")
  if (input.method === "passkey" && publicKey.authenticatorSelection.userVerification !== "required") {
    return resultErrorCreate(op, "enrollment_unavailable")
  }

  const { options: _options, ...stateBase } = current.data.state
  const registrationExpiresAt = Math.min(current.data.state.expiresAt, input.now + Math.ceil(publicKey.timeout / 1000))
  const state: Extract<FlowV2Cookie, { stage: "mfa_webauthn_setup" }> = {
    ...stateBase,
    stage: "mfa_webauthn_setup",
    transitionCounter: current.data.state.transitionCounter + 1,
    registrationMethod: input.method,
    registrationId,
    registrationChallenge: publicKey.challenge,
    registrationRpId: input.rpId,
    registrationOrigin: input.origin,
    registrationStartedAt: input.now,
    registrationExpiresAt,
  }
  const transition: FlowV2Transition = {
    kind: "render",
    route: `/login/mfa?flow=${state.flowHandle}`,
    screen: { name: "mfa_webauthn_setup", method: input.method },
    csrfToken: state.csrfToken,
  }
  return resultCreate({ state, options: creationOptions, transition })
}
