import type { FlowV2Cookie } from "../../flow/model/flowV2CookieSchema"
import { resultCreate } from "../../result/resultCreate"
import { resultErrorCreate } from "../../result/resultErrorCreate"
import type { zitadelClientCreate } from "../../zitadel/zitadelClientCreate"

type Input = {
  state: Extract<FlowV2Cookie, { stage: "ready" }>
  idpId: string
  pagesOrigin: string
  mfaV2Enabled: boolean
  client: ReturnType<typeof zitadelClientCreate>
}

function resultStatusGet(result: { success: boolean; rawData?: unknown }): number | undefined {
  if (result.success || typeof result.rawData !== "object" || result.rawData === null) return undefined
  if (!("status" in result.rawData) || typeof result.rawData.status !== "number") return undefined
  return result.rawData.status
}

function urlIsSafeRedirect(authUrl: string | undefined): boolean {
  if (!authUrl) return false
  try {
    const url = new URL(authUrl)
    if (url.username || url.password) return false
    if (url.protocol !== "https:" && !(url.protocol === "http:" && url.hostname === "localhost")) return false
    return true
  } catch {
    return false
  }
}

export async function identityProviderV2IntentStart(input: Input) {
  const op = "identityProviderV2IntentStart"
  if (!input.state.delegable) return resultErrorCreate(op, "flow_stage_invalid")
  if (!input.mfaV2Enabled) {
    return resultCreate({
      state: input.state,
      transition: { kind: "fallback" as const, path: `/api/v2/flow/fallback?flow=${input.state.flowHandle}` },
    })
  }

  const settings = await input.client.loginSettingsGet(input.state.organizationId)
  if (!settings.success) return resultErrorCreate(op, "provider_unavailable", { status: resultStatusGet(settings) })
  if (settings.data.settings?.allowExternalIdp !== true) {
    return resultCreate({
      state: input.state,
      transition: { kind: "fallback" as const, path: `/api/v2/flow/fallback?flow=${input.state.flowHandle}` },
    })
  }

  const activeProviders = await input.client.activeIdentityProvidersGet(input.state.organizationId)
  if (!activeProviders.success)
    return resultErrorCreate(op, "provider_unavailable", { status: resultStatusGet(activeProviders) })

  const provider = (activeProviders.data.identityProviders ?? []).find((p) => p.id === input.idpId)
  if (!provider) return resultErrorCreate(op, "idp_not_found")

  const successUrl = `${input.pagesOrigin}/api/v2/identity-provider/callback/${encodeURIComponent(provider.id)}?flow=${encodeURIComponent(input.state.flowHandle)}`
  const failureUrl = `${input.pagesOrigin}/api/v2/identity-provider/callback/${encodeURIComponent(provider.id)}/failure?flow=${encodeURIComponent(input.state.flowHandle)}`

  try {
    const successObj = new URL(successUrl)
    const failureObj = new URL(failureUrl)
    const expectedObj = new URL(input.pagesOrigin)
    if (successObj.origin !== expectedObj.origin || failureObj.origin !== expectedObj.origin) {
      return resultErrorCreate(op, "request_rejected")
    }
  } catch {
    return resultErrorCreate(op, "request_rejected")
  }

  const intent = await input.client.identityProviderIntentStart(input.idpId, successUrl, failureUrl)
  if (!intent.success) return resultErrorCreate(op, "idp_start_failed", { status: resultStatusGet(intent) })

  const authUrl = intent.data.authUrl ?? intent.data.formData?.url
  if (!urlIsSafeRedirect(authUrl)) return resultErrorCreate(op, "idp_redirect_invalid")

  const { owned: _owned, ...stateBase } = input.state
  const nextState: Extract<FlowV2Cookie, { stage: "idp_intent" }> = {
    ...stateBase,
    stage: "idp_intent",
    delegable: false,
    transitionCounter: input.state.transitionCounter + 1,
    idpId: input.idpId,
    idpType: provider.type,
    redirectUrl: authUrl as string,
  }

  return resultCreate({
    state: nextState,
    redirectUrl: `/api/v2/identity-provider/redirect?flow=${encodeURIComponent(nextState.flowHandle)}`,
  })
}
