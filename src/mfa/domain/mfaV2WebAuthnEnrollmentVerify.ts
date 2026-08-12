import * as v from "valibot"

import type { FlowV2Cookie } from "../../flow/model/flowV2CookieSchema"
import type { FlowV2Transition } from "../../flow/model/flowV2TransitionSchema"
import type { PasskeyAttestation } from "../../passkey/model/passkeyAttestationSchema"
import { passkeyOptionsSchema } from "../../passkey/model/passkeyOptionsSchema"
import { resultCreate } from "../../result/resultCreate"
import { resultErrorCreate } from "../../result/resultErrorCreate"
import type { zitadelClientCreate } from "../../zitadel/zitadelClientCreate"
import { mfaEnrollmentAuthorize } from "./mfaEnrollmentAuthorize"
import { mfaOptionsGet } from "./mfaOptionsGet"

type Input = {
  state: Extract<FlowV2Cookie, { stage: "mfa_webauthn_setup" }>
  method: "u2f" | "passkey"
  credential: PasskeyAttestation
  displayName?: string
  expectedRpId: string
  expectedOrigin: string
  now: number
  client: ReturnType<typeof zitadelClientCreate>
}

function resultStatusGet(result: { success: boolean; rawData?: unknown }): number | undefined {
  if (result.success || typeof result.rawData !== "object" || result.rawData === null) return undefined
  if (!("status" in result.rawData) || typeof result.rawData.status !== "number") return undefined
  return result.rawData.status
}

function base64UrlDecode(value: string): Uint8Array | undefined {
  try {
    const base64 = value.replaceAll("-", "+").replaceAll("_", "/") + "=".repeat((4 - (value.length % 4)) % 4)
    return Uint8Array.from(atob(base64), (character) => character.charCodeAt(0))
  } catch {
    return undefined
  }
}

function clientDataGet(value: string): { type?: string; challenge?: string; origin?: string } | undefined {
  const bytes = base64UrlDecode(value)
  if (!bytes) return undefined
  try {
    const json: unknown = JSON.parse(new TextDecoder().decode(bytes))
    if (typeof json !== "object" || json === null) return undefined
    return {
      type: "type" in json && typeof json.type === "string" ? json.type : undefined,
      challenge: "challenge" in json && typeof json.challenge === "string" ? json.challenge : undefined,
      origin: "origin" in json && typeof json.origin === "string" ? json.origin : undefined,
    }
  } catch {
    return undefined
  }
}

function cborLengthGet(bytes: Uint8Array, offset: number, additional: number) {
  if (additional < 24) return { length: additional, offset }
  const byteCount = additional === 24 ? 1 : additional === 25 ? 2 : additional === 26 ? 4 : 0
  if (byteCount === 0 || offset + byteCount > bytes.length) return undefined
  let length = 0
  for (let index = 0; index < byteCount; index += 1) length = length * 256 + bytes[offset + index]!
  return { length, offset: offset + byteCount }
}

function cborItemEndGet(bytes: Uint8Array, offset: number, depth = 0): number | undefined {
  if (depth > 8 || offset >= bytes.length) return undefined
  const initial = bytes[offset]!
  const major = initial >> 5
  const length = cborLengthGet(bytes, offset + 1, initial & 31)
  if (!length) return undefined
  if (major === 0 || major === 1 || major === 7) return length.offset
  if (major === 2 || major === 3) {
    const end = length.offset + length.length
    return end <= bytes.length ? end : undefined
  }
  if (major === 6) return cborItemEndGet(bytes, length.offset, depth + 1)
  if (major !== 4 && major !== 5) return undefined
  const itemCount = major === 5 ? length.length * 2 : length.length
  if (itemCount > 64) return undefined
  let cursor = length.offset
  for (let index = 0; index < itemCount; index += 1) {
    const end = cborItemEndGet(bytes, cursor, depth + 1)
    if (end === undefined) return undefined
    cursor = end
  }
  return cursor
}

function attestationAuthDataGet(value: string): Uint8Array | undefined {
  const bytes = base64UrlDecode(value)
  if (!bytes || bytes.length < 1 || bytes[0]! >> 5 !== 5) return undefined
  const mapLength = cborLengthGet(bytes, 1, bytes[0]! & 31)
  if (!mapLength || mapLength.length > 16) return undefined
  let cursor = mapLength.offset
  let authData: Uint8Array | undefined
  for (let index = 0; index < mapLength.length; index += 1) {
    if (cursor >= bytes.length || bytes[cursor]! >> 5 !== 3) return undefined
    const keyLength = cborLengthGet(bytes, cursor + 1, bytes[cursor]! & 31)
    if (!keyLength || keyLength.offset + keyLength.length > bytes.length) return undefined
    const key = new TextDecoder().decode(bytes.subarray(keyLength.offset, keyLength.offset + keyLength.length))
    cursor = keyLength.offset + keyLength.length
    if (key === "authData") {
      if (authData || cursor >= bytes.length || bytes[cursor]! >> 5 !== 2) return undefined
      const valueLength = cborLengthGet(bytes, cursor + 1, bytes[cursor]! & 31)
      if (!valueLength || valueLength.offset + valueLength.length > bytes.length) return undefined
      authData = bytes.slice(valueLength.offset, valueLength.offset + valueLength.length)
      cursor = valueLength.offset + valueLength.length
      continue
    }
    const end = cborItemEndGet(bytes, cursor)
    if (end === undefined) return undefined
    cursor = end
  }
  if (cursor !== bytes.length || !authData || authData.length < 37) return undefined
  return authData
}

function attestedCredentialIsValid(authData: Uint8Array, rawId: string): boolean {
  if (authData.length < 57) return false
  const credentialIdLength = authData[53]! * 256 + authData[54]!
  if (credentialIdLength < 1 || credentialIdLength > 500) return false
  const credentialIdEnd = 55 + credentialIdLength
  if (credentialIdEnd >= authData.length) return false
  const rawIdBytes = base64UrlDecode(rawId)
  if (!rawIdBytes || rawIdBytes.length !== credentialIdLength) return false
  let difference = 0
  for (let index = 0; index < credentialIdLength; index += 1) {
    difference |= rawIdBytes[index]! ^ authData[55 + index]!
  }
  if (difference !== 0) return false

  const publicKeyEnd = cborItemEndGet(authData, credentialIdEnd)
  if (publicKeyEnd === undefined) return false
  const hasExtensions = (authData[32]! & 0x80) !== 0
  if (!hasExtensions) return publicKeyEnd === authData.length
  const extensionsEnd = cborItemEndGet(authData, publicKeyEnd)
  return extensionsEnd === authData.length
}

async function attestationBindingIsValid(input: Input): Promise<boolean> {
  if (input.credential.id !== input.credential.rawId) return false
  const clientData = clientDataGet(input.credential.response.clientDataJSON)
  if (
    clientData?.type !== "webauthn.create" ||
    clientData.challenge !== input.state.registrationChallenge ||
    clientData.origin !== input.state.registrationOrigin
  ) {
    return false
  }

  const authData = attestationAuthDataGet(input.credential.response.attestationObject)
  if (!authData) return false
  const flags = authData[32]!
  if ((flags & 0x01) === 0 || (flags & 0x40) === 0) return false
  if (input.method === "passkey" && (flags & 0x04) === 0) return false
  if (!attestedCredentialIsValid(authData, input.credential.rawId)) return false

  try {
    const expectedHash = new Uint8Array(
      await crypto.subtle.digest("SHA-256", new TextEncoder().encode(input.expectedRpId)),
    )
    let difference = 0
    for (let index = 0; index < expectedHash.length; index += 1) difference |= expectedHash[index]! ^ authData[index]!
    return difference === 0
  } catch {
    return false
  }
}

function passkeyOptionsParse(raw: unknown) {
  if (typeof raw !== "object" || raw === null) return undefined
  const candidate = "publicKey" in raw ? raw : { publicKey: raw }
  const parsed = v.safeParse(passkeyOptionsSchema, candidate)
  if (parsed.success) return parsed.output
  return undefined
}

function recoverableContinuationCreate(state: Extract<FlowV2Cookie, { stage: "mfa" }>) {
  const transition: FlowV2Transition = {
    kind: "render",
    route: `/login/mfa?flow=${state.flowHandle}`,
    screen: { name: "mfa", factors: state.mfaMethods },
    csrfToken: state.csrfToken,
  }
  return resultCreate({ state, transition })
}

async function checkAfterCreate(input: Input, state: Extract<FlowV2Cookie, { stage: "mfa" }>) {
  const requirement =
    input.method === "passkey" ? "USER_VERIFICATION_REQUIREMENT_REQUIRED" : "USER_VERIFICATION_REQUIREMENT_DISCOURAGED"
  const challenged = await input.client.u2fSessionChallenge(
    state.sessionId,
    state.sessionToken,
    input.expectedRpId,
    requirement,
  )
  if (!challenged.success) return recoverableContinuationCreate(state)

  const latestToken = challenged.data.sessionToken ?? state.sessionToken
  const options = passkeyOptionsParse(challenged.data.challenges?.webAuthN?.publicKeyCredentialRequestOptions)
  if (
    !options ||
    options.publicKey.rpId !== input.expectedRpId ||
    (input.method === "passkey" && options.publicKey.userVerification !== "required")
  ) {
    return recoverableContinuationCreate({ ...state, sessionToken: latestToken })
  }

  const checkState: Extract<FlowV2Cookie, { stage: "mfa" }> = {
    ...state,
    sessionToken: latestToken,
    options,
  }
  const transition: FlowV2Transition = {
    kind: "render",
    route: `/login/mfa?flow=${state.flowHandle}`,
    screen: { name: "mfa", factors: state.mfaMethods, options },
    csrfToken: state.csrfToken,
  }
  return resultCreate({ state: checkState, transition })
}

export async function mfaV2WebAuthnEnrollmentVerify(input: Input) {
  const op = "mfaV2WebAuthnEnrollmentVerify"
  if (input.state.expiresAt <= input.now) return resultErrorCreate(op, "flow_expired")
  if (input.state.registrationExpiresAt <= input.now) return resultErrorCreate(op, "challenge_expired")
  if (
    input.state.registrationMethod !== input.method ||
    input.state.registrationRpId !== input.expectedRpId ||
    input.state.registrationOrigin !== input.expectedOrigin ||
    input.state.registrationStartedAt < input.state.issuedAt ||
    input.state.registrationStartedAt > input.now ||
    input.state.registrationExpiresAt > input.state.expiresAt ||
    input.state.registrationExpiresAt <= input.state.registrationStartedAt ||
    input.state.transitionCounter < 1
  ) {
    return resultErrorCreate(op, "flow_invalid")
  }
  if (!(await attestationBindingIsValid(input))) return resultErrorCreate(op, "credentials_invalid")

  const {
    registrationMethod: _registrationMethod,
    registrationId: _registrationId,
    registrationChallenge: _registrationChallenge,
    registrationRpId: _registrationRpId,
    registrationOrigin: _registrationOrigin,
    registrationStartedAt: _registrationStartedAt,
    registrationExpiresAt: _registrationExpiresAt,
    ...stateBase
  } = input.state
  const pendingState: Extract<FlowV2Cookie, { stage: "mfa" }> = { ...stateBase, stage: "mfa" }
  const authorized = await mfaEnrollmentAuthorize({ state: pendingState, now: input.now, client: input.client })
  if (!authorized.success) return resultErrorCreate(op, authorized.errorMessage, authorized.rawData)

  const current = await mfaOptionsGet({ state: authorized.data.state, now: input.now, client: input.client })
  if (!current.success) return resultErrorCreate(op, current.errorMessage, current.rawData)
  const options = current.data.options
  const methodIsEnrolled =
    (options.mode === "check" && options.method.type === input.method) ||
    (options.mode === "select" && options.methods.some((method) => method.type === input.method))
  const enrollmentIsAllowed =
    (options.mode === "enroll" || (options.mode === "skip" && options.reason === "optional_setup")) &&
    options.methods.some((method) => method.type === input.method)
  if (!methodIsEnrolled && !enrollmentIsAllowed) return resultErrorCreate(op, "mfa_enrollment_not_allowed")

  const nativeMethod =
    input.method === "passkey" ? "AUTHENTICATION_METHOD_TYPE_PASSKEY" : "AUTHENTICATION_METHOD_TYPE_U2F"
  const mfaMethods = current.data.state.mfaMethods.includes(nativeMethod)
    ? current.data.state.mfaMethods
    : [...current.data.state.mfaMethods, nativeMethod]
  const enrolledState: Extract<FlowV2Cookie, { stage: "mfa" }> = {
    ...current.data.state,
    mfaMethods,
    options: undefined,
    webAuthnCheckMethod: input.method,
    transitionCounter: input.state.transitionCounter + 1,
  }

  if (!methodIsEnrolled) {
    const displayName = input.displayName ?? (input.method === "passkey" ? "Passkey" : "Security key")
    const verified =
      input.method === "passkey"
        ? await input.client.verifyPasskeyRegistration(
            input.state.userId,
            input.state.registrationId,
            displayName,
            input.credential,
          )
        : await input.client.verifyU2FRegistration(
            input.state.userId,
            input.state.registrationId,
            displayName,
            input.credential,
          )
    if (!verified.success) {
      const status = resultStatusGet(verified)
      if (status !== undefined && status >= 400 && status < 500) {
        return resultErrorCreate(op, "credentials_invalid", { status })
      }
      return resultErrorCreate(op, "enrollment_unavailable", { status })
    }
  }

  return checkAfterCreate(input, enrolledState)
}
