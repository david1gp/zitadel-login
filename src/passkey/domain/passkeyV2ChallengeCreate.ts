import * as v from "valibot"
import type { FlowV2Cookie } from "../../flow/model/flowV2CookieSchema"
import type { FlowV2Transition } from "../../flow/model/flowV2TransitionSchema"
import { primaryFlowOwnershipPreflight } from "../../flow/domain/primaryFlowOwnershipPreflight"
import { passkeyOptionsSchema } from "../model/passkeyOptionsSchema"
import { resultCreate } from "../../result/resultCreate"
import { resultErrorCreate } from "../../result/resultErrorCreate"
import type { zitadelClientCreate } from "../../zitadel/zitadelClientCreate"

type Input = {
  state: Extract<FlowV2Cookie, { stage: "ready" | "passkey" }>
  identifier?: string
  rpId: string
  now: number
  client: ReturnType<typeof zitadelClientCreate>
}
type User = Extract<Awaited<ReturnType<Input["client"]["userGet"]>>, { success: true }>["data"]["user"]

const passkeyMethods = new Set(["AUTHENTICATION_METHOD_TYPE_PASSKEY", "AUTHENTICATION_METHOD_TYPE_U2F"])

function fallbackCreate(state: Input["state"]): FlowV2Transition {
  return { kind: "fallback", path: `/api/v2/flow/fallback?flow=${state.flowHandle}` }
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

export async function passkeyV2ChallengeCreate(input: Input) {
  const op = "passkeyV2ChallengeCreate"

  const settings = await input.client.loginSettingsGet(input.state.organizationId)
  if (!settings.success) return resultErrorCreate(op, "service_unavailable", { status: resultStatusGet(settings) })
  if (settings.data.settings?.allowLocalAuthentication !== true) {
    return resultCreate({ state: input.state, transition: fallbackCreate(input.state) })
  }

  const effectiveIdentifier = input.identifier || input.state.loginHint
  if (!effectiveIdentifier && !input.state.hintUserId) {
    return resultErrorCreate(op, "invalid_payload")
  }

  let userId: string
  let user: User
  if (effectiveIdentifier) {
    const users = await input.client.usersByIdentifierList(effectiveIdentifier, input.state.organizationId)
    if (!users.success) return resultErrorCreate(op, "service_unavailable", { status: resultStatusGet(users) })
    if (users.data.result.length !== 1) {
      if (settings.data.settings?.ignoreUnknownUsernames) {
        return resultCreate({ state: input.state, transition: fallbackCreate(input.state) })
      }
      return resultErrorCreate(op, "credentials_invalid")
    }

    user = users.data.result[0]!
    if (
      !user ||
      user.state !== "USER_STATE_ACTIVE" ||
      user.details?.resourceOwner !== input.state.organizationId ||
      (input.state.hintUserId !== undefined && input.state.hintUserId !== user.userId)
    ) {
      return resultErrorCreate(op, "credentials_invalid")
    }
    userId = user.userId
  } else {
    userId = input.state.hintUserId!
    const userResult = await input.client.userGet(userId)
    if (!userResult.success)
      return resultErrorCreate(op, "service_unavailable", { status: resultStatusGet(userResult) })
    user = userResult.data.user
  }

  const methods = await input.client.authenticationMethodsGet(userId)
  if (!methods.success) return resultErrorCreate(op, "service_unavailable", { status: resultStatusGet(methods) })
  const hasPasskey = methods.data.authMethodTypes.some((method) => passkeyMethods.has(method))
  if (!hasPasskey) {
    return resultCreate({ state: input.state, transition: fallbackCreate(input.state) })
  }

  if (
    input.state.stage === "ready" &&
    !primaryFlowOwnershipPreflight({
      method: "passkey",
      requestKind: input.state.requestKind,
      prompt: input.state.prompt,
      ...(input.state.loginHint ? { loginHint: input.state.loginHint } : {}),
      ...(input.state.maxAgeSeconds !== undefined ? { maxAgeSeconds: input.state.maxAgeSeconds } : {}),
      organizationId: input.state.organizationId,
      identifier: effectiveIdentifier ?? user.preferredLoginName ?? "",
      policy: settings.data.settings,
      now: input.now,
      methods: methods.data.authMethodTypes,
      user,
    })
  ) {
    return resultCreate({ state: input.state, transition: fallbackCreate(input.state) })
  }

  let sessionId: string
  let sessionToken: string
  let rawOptions: unknown

  if ("sessionId" in input.state && "sessionToken" in input.state) {
    const challenged = await input.client.passkeySessionChallenge(
      input.state.sessionId,
      input.state.sessionToken,
      input.rpId,
    )
    if (!challenged.success) {
      const status = resultStatusGet(challenged)
      if (status !== undefined && status >= 400 && status < 500) {
        return resultCreate({ state: input.state, transition: fallbackCreate(input.state) })
      }
      return resultErrorCreate(op, "challenge_unavailable", { status })
    }
    sessionId = input.state.sessionId
    sessionToken = challenged.data.sessionToken
    rawOptions = challenged.data.challenges?.webAuthN?.publicKeyCredentialRequestOptions
  } else {
    const created = await input.client.passkeySessionCreate(userId, input.rpId)
    if (!created.success) {
      const status = resultStatusGet(created)
      if (status !== undefined && status >= 400 && status < 500) {
        return resultCreate({ state: input.state, transition: fallbackCreate(input.state) })
      }
      return resultErrorCreate(op, "challenge_unavailable", { status })
    }
    sessionId = created.data.sessionId
    sessionToken = created.data.sessionToken
    rawOptions = created.data.challenges?.webAuthN?.publicKeyCredentialRequestOptions
  }

  const options = passkeyOptionsParse(rawOptions)
  if (!options) {
    return resultErrorCreate(op, "challenge_unavailable")
  }

  const stateBase = "owned" in input.state ? (({ owned: _owned, ...rest }) => rest)(input.state) : input.state
  const state: Extract<FlowV2Cookie, { stage: "passkey" }> = {
    ...stateBase,
    stage: "passkey",
    delegable: false,
    transitionCounter: input.state.transitionCounter + 1,
    userId,
    sessionId,
    sessionToken,
    options,
  }

  const transition: FlowV2Transition = {
    kind: "render",
    route: `/login/passkey?flow=${state.flowHandle}`,
    screen: {
      name: "passkey",
      options,
    },
    csrfToken: state.csrfToken,
  }

  return resultCreate({ state, transition })
}
