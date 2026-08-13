import * as v from "valibot"
import type { Result } from "../../result/Result"
import { resultCreate } from "../../result/resultCreate"
import { resultErrorCreate } from "../../result/resultErrorCreate"
import { type MfaOptions, mfaOptionsSchema } from "../model/mfaOptionsSchema"

const responseEnvelopeSchema = v.variant("success", [
  v.strictObject({
    success: v.literal(true),
    data: mfaOptionsSchema,
  }),
  v.strictObject({
    success: v.literal(false),
    op: v.string(),
    errorMessage: v.string(),
  }),
])

export async function mfaV2OptionsApiRequest(
  apiOrigin: string,
  flowHandle: string,
  fetchFn: typeof fetch = fetch,
): Promise<Result<MfaOptions>> {
  const op = "mfaV2OptionsApiRequest"
  if (!flowHandle) return resultErrorCreate(op, "flow_handle_missing")

  const url = `${apiOrigin}/api/v2/mfa/options?flow=${encodeURIComponent(flowHandle)}`
  let response: Response
  try {
    response = await fetchFn(url, {
      method: "GET",
      headers: { accept: "application/json" },
      credentials: "same-origin",
    })
  } catch (error) {
    return resultErrorCreate(op, "mfa_unavailable", error)
  }

  let text: string
  try {
    text = await response.text()
  } catch (error) {
    return resultErrorCreate(op, "mfa_unavailable", error)
  }

  let json: unknown
  try {
    json = JSON.parse(text)
  } catch (error) {
    return resultErrorCreate(op, "mfa_unavailable", error)
  }

  const parsed = v.safeParse(responseEnvelopeSchema, json)
  if (!parsed.success) return resultErrorCreate(op, "mfa_unavailable")

  if (!parsed.output.success) {
    return resultErrorCreate(op, parsed.output.errorMessage)
  }

  return resultCreate(parsed.output.data)
}
