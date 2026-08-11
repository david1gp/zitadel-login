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

export async function emailOtpV2VerifyApiRequest(
  apiOrigin: string,
  flowHandle: string,
  input: { code: string; csrfToken: string },
): Promise<Result<FlowV2Transition>> {
  const op = "emailOtpV2VerifyApiRequest"
  const url = new URL("/api/v2/email-otp/verify", apiOrigin || window.location.origin)
  url.searchParams.set("flow", flowHandle)
  let response: Response
  try {
    response = await fetch(url, {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code: input.code, csrfToken: input.csrfToken }),
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

  const parsed = v.safeParse(responseSchema, json)
  if (!parsed.success) {
    return resultErrorCreate(op, "The sign-in service returned an invalid response.", json)
  }
  return resultCreate(parsed.output.data)
}
