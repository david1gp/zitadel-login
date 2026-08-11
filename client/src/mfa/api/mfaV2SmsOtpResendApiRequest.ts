import * as v from "valibot"

import { flowV2ErrorMessageGet } from "../../flow/model/flowV2ErrorMessageGet"
import { flowV2TransitionSchema, type FlowV2Transition } from "../../flow/model/flowV2TransitionSchema"
import type { Result } from "../../result/Result"
import { resultCreate } from "../../result/resultCreate"
import { resultErrorCreate } from "../../result/resultErrorCreate"

const responseSchema = v.strictObject({
  success: v.literal(true),
  data: flowV2TransitionSchema,
})

const errorSchema = v.strictObject({
  success: v.literal(false),
  op: v.string(),
  errorMessage: v.string(),
})

export async function mfaV2SmsOtpResendApiRequest(
  apiOrigin: string,
  flowHandle: string,
  input: { csrfToken: string },
  fetchFn: typeof fetch = fetch,
): Promise<Result<FlowV2Transition>> {
  const op = "mfaV2SmsOtpResendApiRequest"
  if (!flowHandle) return resultErrorCreate(op, flowV2ErrorMessageGet("flow_invalid"))

  const url = `${apiOrigin}/api/v2/mfa/sms-otp/resend?flow=${encodeURIComponent(flowHandle)}`
  let response: Response
  try {
    response = await fetchFn(url, {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ method: "sms_otp", csrfToken: input.csrfToken }),
    })
  } catch (error) {
    return resultErrorCreate(op, "Sign-in is temporarily unavailable. Please try again.", error)
  }

  let text: string
  try {
    text = await response.text()
  } catch (error) {
    return resultErrorCreate(op, "The sign-in service returned an invalid response.", error)
  }

  let json: unknown
  try {
    json = JSON.parse(text)
  } catch (error) {
    return resultErrorCreate(op, "The sign-in service returned an invalid response.", error)
  }

  if (!response.ok) {
    const parsedError = v.safeParse(errorSchema, json)
    const code = parsedError.success ? parsedError.output.errorMessage : "service_unavailable"
    return resultErrorCreate(op, flowV2ErrorMessageGet(code))
  }

  const parsed = v.safeParse(responseSchema, json)
  if (!parsed.success) {
    return resultErrorCreate(op, "The sign-in service returned an invalid response.", json)
  }
  return resultCreate(parsed.output.data)
}
