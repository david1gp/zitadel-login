import type { FlowV2Cookie } from "../../flow/model/flowV2CookieSchema"
import type { FlowV2Transition } from "../../flow/model/flowV2TransitionSchema"
import type { PasskeyCredentialAssertion } from "../../passkey/model/passkeyVerifyRequestSchema"
import { resultCreate } from "../../result/resultCreate"
import { resultErrorCreate } from "../../result/resultErrorCreate"
import type { zitadelClientCreate } from "../../zitadel/zitadelClientCreate"
import { mfaOptionsGet } from "./mfaOptionsGet"

type Input = {
  state: Extract<FlowV2Cookie, { stage: "mfa" }>
  credential: PasskeyCredentialAssertion
  method?: string
  expectedOrigin: string
  now: number
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

function authenticatorDataFlagsGet(base64urlStr: string): { userPresent: boolean; userVerified: boolean } | undefined {
  try {
    const bytes = base64UrlDecode(base64urlStr)
    if (bytes.length < 37) return undefined
    const flags = bytes[32]!
    return {
      userPresent: (flags & 0x01) !== 0,
      userVerified: (flags & 0x04) !== 0,
    }
  } catch {
    return undefined
  }
}

export async function mfaV2U2fVerify(input: Input) {
  const op = "mfaV2U2fVerify"

  if (
    input.method !== undefined &&
    input.method !== "u2f" &&
    input.method !== "passkey" &&
    input.method !== "AUTHENTICATION_METHOD_TYPE_U2F"
  ) {
    return resultErrorCreate(op, "method_not_enrolled")
  }
  if (input.state.webAuthnCheckMethod && input.method !== input.state.webAuthnCheckMethod) {
    return resultErrorCreate(op, "method_not_enrolled")
  }

  if (!input.state.options?.publicKey) {
    return resultErrorCreate(op, "challenge_unavailable")
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
    input.state.webAuthnCheckMethod ??
    (input.method === "passkey"
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
              : "u2f")

  const isEnrolled =
    (options.mode === "check" && options.method.type === targetFactor) ||
    (options.mode === "select" && options.methods.some((method) => method.type === targetFactor))

  if (!isEnrolled) {
    return resultErrorCreate(op, "method_not_enrolled")
  }

  const clientData = clientDataJsonParse(input.credential.response.clientDataJSON)
  if (!clientData) {
    return resultErrorCreate(op, "credentials_invalid")
  }

  if (clientData.type !== "webauthn.get") {
    return resultErrorCreate(op, "credentials_invalid")
  }
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

  const flags = authenticatorDataFlagsGet(input.credential.response.authenticatorData)
  if (!flags) {
    return resultErrorCreate(op, "credentials_invalid")
  }
  if (!flags.userPresent) {
    return resultErrorCreate(op, "credentials_invalid")
  }

  const requiredUserVerification =
    input.state.options.publicKey.userVerification === "required" ||
    targetFactor === "passkey" ||
    input.method === "passkey"

  if (requiredUserVerification && !flags.userVerified) {
    return resultErrorCreate(op, "credentials_invalid")
  }

  const verified = await input.client.passkeySessionVerify(
    currentState.sessionId,
    currentState.sessionToken,
    input.credential,
  )
  if (!verified.success) {
    const status = resultStatusGet(verified)
    if (status === 401 || status === 404) {
      return resultErrorCreate(op, "session_stale", { status })
    }
    if (status !== undefined && status >= 400 && status < 500) {
      return resultErrorCreate(op, "credentials_invalid", { status })
    }
    return resultErrorCreate(op, "passkey_unavailable", { status })
  }

  const checkedToken = verified.data.sessionToken ?? currentState.sessionToken

  const session = await input.client.sessionGet(currentState.sessionId, checkedToken)
  if (!session.success) {
    const status = resultStatusGet(session)
    if (status === 401 || status === 404) {
      return resultErrorCreate(op, "session_stale", { status })
    }
    return resultErrorCreate(op, "passkey_unavailable", { status })
  }

  if (
    session.data.session.factors?.user?.id !== input.state.userId ||
    session.data.session.factors?.user?.organizationId !== input.state.organizationId ||
    !session.data.session.factors?.webAuthN?.verifiedAt
  ) {
    return resultErrorCreate(op, "credentials_invalid")
  }

  if (requiredUserVerification && session.data.session.factors.webAuthN.userVerified !== true) {
    return resultErrorCreate(op, "credentials_invalid")
  }

  const updatedMfaState: Extract<FlowV2Cookie, { stage: "mfa" }> = {
    ...currentState,
    sessionToken: checkedToken,
  }

  const postOptionsResult = await mfaOptionsGet({
    state: updatedMfaState,
    now: input.now,
    client: input.client,
  })
  if (!postOptionsResult.success) {
    return resultErrorCreate(op, postOptionsResult.errorMessage, postOptionsResult.rawData)
  }

  const { options: postOptions } = postOptionsResult.data
  const latestToken = postOptionsResult.data.state.sessionToken
  const {
    options: _opts,
    mfaMethods: _mfaMethods,
    webAuthnCheckMethod: _webAuthnCheckMethod,
    ...stateBase
  } = currentState

  if (postOptions.mode === "skip") {
    const state: Extract<FlowV2Cookie, { stage: "verified" }> = {
      ...stateBase,
      stage: "verified",
      delegable: false,
      transitionCounter: currentState.transitionCounter + 1,
      sessionToken: latestToken,
    }
    const transition: FlowV2Transition = {
      kind: "complete",
      path: `/api/v2/flow/continue?flow=${state.flowHandle}`,
    }
    return resultCreate({ state, transition })
  }

  if (postOptions.mode === "fallback") {
    const transition: FlowV2Transition = {
      kind: "fallback",
      path: `/api/v2/flow/fallback?flow=${currentState.flowHandle}`,
    }
    const state: Extract<FlowV2Cookie, { stage: "mfa" }> = {
      ...postOptionsResult.data.state,
      options: undefined,
      webAuthnCheckMethod: undefined,
      transitionCounter: currentState.transitionCounter + 1,
    }
    return resultCreate({ state, transition })
  }

  const state: Extract<FlowV2Cookie, { stage: "mfa" }> = {
    ...currentState,
    sessionToken: latestToken,
    transitionCounter: currentState.transitionCounter + 1,
    options: undefined,
    webAuthnCheckMethod: undefined,
  }
  const transition: FlowV2Transition = {
    kind: "render",
    route: `/login/mfa?flow=${state.flowHandle}`,
    screen: { name: "mfa", factors: state.mfaMethods },
    csrfToken: state.csrfToken,
  }
  return resultCreate({ state, transition })
}
