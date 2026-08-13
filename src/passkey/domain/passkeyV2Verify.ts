import type { FlowV2Cookie } from "../../flow/model/flowV2CookieSchema"
import type { FlowV2Transition } from "../../flow/model/flowV2TransitionSchema"
import { primaryFlowMfaPolicyEvaluate } from "../../flow/domain/primaryFlowMfaPolicyEvaluate"

import type { PasskeyCredentialAssertion } from "../model/passkeyVerifyRequestSchema"

import { resultCreate } from "../../result/resultCreate"
import { resultErrorCreate } from "../../result/resultErrorCreate"
import type { zitadelClientCreate } from "../../zitadel/zitadelClientCreate"

type Input = {
  state: Extract<FlowV2Cookie, { stage: "passkey" }>
  credential: PasskeyCredentialAssertion
  expectedOrigin: string
  client: ReturnType<typeof zitadelClientCreate>
}

function resultStatusGet(result: { success: boolean; rawData?: unknown }): number | undefined {
  if (result.success || typeof result.rawData !== "object" || result.rawData === null) return undefined
  if (!("status" in result.rawData) || typeof result.rawData.status !== "number") return undefined
  return result.rawData.status
}

function base64UrlDecode(value: string): Uint8Array {
  const base64 = value.replaceAll("-", "+").replaceAll("_", "/") + "=".repeat((4 - (value.length % 4)) % 4)
  return Uint8Array.from(atob(base64), (character) => character.charCodeAt(0))
}

function base64UrlDecodeText(value: string): string | undefined {
  try {
    const bytes = base64UrlDecode(value)
    return new TextDecoder().decode(bytes)
  } catch {
    return undefined
  }
}

function clientDataJsonParse(base64urlStr: string): { type?: string; challenge?: string; origin?: string } | undefined {
  const text = base64UrlDecodeText(base64urlStr)
  if (!text) return undefined
  try {
    const json = JSON.parse(text)
    if (typeof json !== "object" || json === null) return undefined
    return {
      type: typeof json.type === "string" ? json.type : undefined,
      challenge: typeof json.challenge === "string" ? json.challenge : undefined,
      origin: typeof json.origin === "string" ? json.origin : undefined,
    }
  } catch {
    return undefined
  }
}

export async function passkeyV2Verify(input: Input) {
  const op = "passkeyV2Verify"

  const clientData = clientDataJsonParse(input.credential.response.clientDataJSON)
  if (!clientData) return resultErrorCreate(op, "invalid_payload")

  if (clientData.type !== "webauthn.get") return resultErrorCreate(op, "credentials_invalid")
  if (clientData.challenge !== input.state.options.publicKey.challenge) {
    return resultErrorCreate(op, "credentials_invalid")
  }
  if (clientData.origin !== input.expectedOrigin) {
    return resultErrorCreate(op, "credentials_invalid")
  }

  const rawUserHandle = input.credential.response.userHandle
  if (rawUserHandle && rawUserHandle.length > 0) {
    const decodedUserHandle = base64UrlDecodeText(rawUserHandle)
    const matchesRaw = rawUserHandle === input.state.userId
    const matchesDecoded = decodedUserHandle === input.state.userId
    if (!matchesRaw && !matchesDecoded) {
      return resultErrorCreate(op, "credentials_invalid")
    }
  }

  const verified = await input.client.passkeySessionVerify(
    input.state.sessionId,
    input.state.sessionToken,
    input.credential,
  )
  if (!verified.success) {
    const status = resultStatusGet(verified)
    if (status !== undefined && status >= 400 && status < 500) {
      return resultErrorCreate(op, "credentials_invalid", { status })
    }
    return resultErrorCreate(op, "passkey_unavailable", { status })
  }

  const session = await input.client.sessionGet(input.state.sessionId, verified.data.sessionToken)
  if (!session.success) return resultErrorCreate(op, "passkey_unavailable", { status: resultStatusGet(session) })

  if (
    session.data.session.factors?.user?.id !== input.state.userId ||
    session.data.session.factors?.user?.organizationId !== input.state.organizationId ||
    !session.data.session.factors?.webAuthN?.verifiedAt
  ) {
    return resultErrorCreate(op, "authorization_unavailable")
  }

  const methods = await input.client.authenticationMethodsGet(input.state.userId)
  if (!methods.success) return resultErrorCreate(op, "passkey_unavailable", { status: resultStatusGet(methods) })

  const settings = await input.client.loginSettingsGet(input.state.organizationId)
  if (!settings.success) return resultErrorCreate(op, "passkey_unavailable", { status: resultStatusGet(settings) })

  const userVerified = Boolean(session.data.session.factors.webAuthN.userVerified)
  const mfa = primaryFlowMfaPolicyEvaluate({
    method: "passkey",
    methods: methods.data.authMethodTypes,
    emailVerified: false,
    phoneVerified: false,
    userVerified,
    policy: settings.data.settings ?? {},
  })
  if (!mfa.supported) return resultErrorCreate(op, "authorization_unavailable")

  const { options: _options, ...stateBase } = input.state

  if (mfa.required) {
    const state: Extract<FlowV2Cookie, { stage: "mfa" }> = {
      ...stateBase,
      stage: "mfa",
      delegable: false,
      transitionCounter: input.state.transitionCounter + 1,
      userId: input.state.userId,
      sessionId: input.state.sessionId,
      sessionToken: verified.data.sessionToken,
      mfaMethods: mfa.methods,
    }
    const transition: FlowV2Transition = {
      kind: "render",
      route: `/login/mfa?flow=${state.flowHandle}`,
      screen: { name: "mfa", factors: mfa.methods },
      csrfToken: state.csrfToken,
    }
    return resultCreate({ state, transition })
  }

  const state: Extract<FlowV2Cookie, { stage: "verified" }> = {
    ...stateBase,
    stage: "verified",
    delegable: false,
    transitionCounter: input.state.transitionCounter + 1,
    userId: input.state.userId,
    sessionId: input.state.sessionId,
    sessionToken: verified.data.sessionToken,
  }
  const transition: FlowV2Transition = {
    kind: "complete",
    path: `/api/v2/flow/continue?flow=${state.flowHandle}`,
  }
  return resultCreate({ state, transition })
}
