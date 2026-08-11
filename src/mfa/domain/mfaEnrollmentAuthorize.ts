import type { FlowV2Cookie } from "../../flow/model/flowV2CookieSchema"
import { resultCreate } from "../../result/resultCreate"
import { resultErrorCreate } from "../../result/resultErrorCreate"
import type { zitadelClientCreate } from "../../zitadel/zitadelClientCreate"

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

export async function mfaEnrollmentAuthorize(input: Input) {
  const op = "mfaEnrollmentAuthorize"
  const session = await input.client.sessionGet(input.state.sessionId, input.state.sessionToken)
  if (!session.success) {
    const status = resultStatusGet(session)
    if (status === 401 || status === 404) return resultErrorCreate(op, "session_stale", { status })
    return resultErrorCreate(op, "mfa_unavailable", { status })
  }

  const nativeSession = session.data.session
  const factors = nativeSession.factors
  const expiresAt = nativeSession.expirationDate ? Date.parse(nativeSession.expirationDate) : undefined
  if (
    nativeSession.id !== input.state.sessionId ||
    (expiresAt !== undefined && expiresAt <= input.now * 1000) ||
    factors?.user?.id !== input.state.userId ||
    factors.user.organizationId !== input.state.organizationId
  ) {
    return resultErrorCreate(op, "session_stale")
  }

  const passwordIsTrusted = Boolean(factors.password?.verifiedAt)
  const passkeyIsTrusted = Boolean(factors.webAuthN?.verifiedAt && factors.webAuthN.userVerified === true)
  const linkedIdpIsTrusted = Boolean(factors.intent?.verifiedAt)
  if (!passwordIsTrusted && !passkeyIsTrusted && !linkedIdpIsTrusted) {
    return resultErrorCreate(op, "mfa_setup_forbidden")
  }

  const user = await input.client.userGet(input.state.userId)
  if (!user.success) return resultErrorCreate(op, "mfa_unavailable", { status: resultStatusGet(user) })
  if (
    user.data.user.userId !== input.state.userId ||
    user.data.user.state !== "USER_STATE_ACTIVE" ||
    user.data.user.details?.resourceOwner !== input.state.organizationId ||
    !user.data.user.human
  ) {
    return resultErrorCreate(op, "session_stale")
  }

  const latestToken = nativeSession.sessionToken ?? input.state.sessionToken
  const state = latestToken === input.state.sessionToken ? input.state : { ...input.state, sessionToken: latestToken }
  return resultCreate({ state })
}
