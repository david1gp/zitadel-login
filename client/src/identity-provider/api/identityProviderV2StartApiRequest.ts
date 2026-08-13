import * as v from "valibot"

import { flowV2ErrorMessageGet } from "../../flow/model/flowV2ErrorMessageGet"
import { type FlowV2Transition, flowV2TransitionSchema } from "../../flow/model/flowV2TransitionSchema"
import type { Result } from "../../result/Result"
import { resultCreate } from "../../result/resultCreate"
import { resultErrorCreate } from "../../result/resultErrorCreate"

const redirectUrlResponseSchema = v.strictObject({
  success: v.literal(true),
  data: v.strictObject({
    redirectUrl: v.pipe(v.string(), v.minLength(1), v.regex(/^\/[^\\]*$/)),
  }),
})

const transitionResponseSchema = v.strictObject({
  success: v.literal(true),
  data: flowV2TransitionSchema,
})

const errorSchema = v.strictObject({
  success: v.literal(false),
  op: v.string(),
  errorMessage: v.string(),
})

export type IdentityProviderV2StartResultData = { redirectUrl: string } | { transition: FlowV2Transition }

export async function identityProviderV2StartApiRequest(
  apiOrigin: string,
  flowHandle: string,
  idpId: string,
  csrfToken: string,
): Promise<Result<IdentityProviderV2StartResultData>> {
  const op = "identityProviderV2StartApiRequest"
  const url = new URL("/api/v2/identity-provider/start", apiOrigin || window.location.origin)
  url.searchParams.set("flow", flowHandle)

  let response: Response
  try {
    response = await fetch(url, {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ idpId, csrfToken }),
    })
  } catch (error) {
    return resultErrorCreate(op, "Sign-in is temporarily unavailable. Please try again.", error)
  }

  let json: unknown
  try {
    json = await response.json()
  } catch (error) {
    return resultErrorCreate(op, "The sign-in service returned an invalid response.", error)
  }

  if (!response.ok) {
    const parsedError = v.safeParse(errorSchema, json)
    const code = parsedError.success ? parsedError.output.errorMessage : "service_unavailable"
    return resultErrorCreate(op, flowV2ErrorMessageGet(code))
  }

  const parsedRedirect = v.safeParse(redirectUrlResponseSchema, json)
  if (parsedRedirect.success) {
    return resultCreate({ redirectUrl: parsedRedirect.output.data.redirectUrl })
  }

  const parsedTransition = v.safeParse(transitionResponseSchema, json)
  if (parsedTransition.success) {
    return resultCreate({ transition: parsedTransition.output.data })
  }

  return resultErrorCreate(op, "The sign-in service returned an invalid response.", json)
}
