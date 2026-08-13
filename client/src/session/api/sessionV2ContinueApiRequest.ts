import * as v from "valibot"
import { flowV2ErrorMessageGet } from "../../flow/model/flowV2ErrorMessageGet"
import { type FlowV2Transition, flowV2TransitionSchema } from "../../flow/model/flowV2TransitionSchema"
import type { Result } from "../../result/Result"
import { resultCreate } from "../../result/resultCreate"
import { resultErrorCreate } from "../../result/resultErrorCreate"
import { type SessionContinuePayload, sessionContinuePayloadSchema } from "../model/sessionContinuePayloadSchema"

const responseSchema = v.strictObject({
  success: v.literal(true),
  data: flowV2TransitionSchema,
})

const errorSchema = v.strictObject({
  success: v.literal(false),
  op: v.string(),
  errorMessage: v.string(),
})

export async function sessionV2ContinueApiRequest(
  apiOrigin: string,
  flowHandle: string,
  payload: SessionContinuePayload,
): Promise<Result<FlowV2Transition>> {
  const op = "sessionV2ContinueApiRequest"
  const payloadParsed = v.safeParse(sessionContinuePayloadSchema, payload)
  if (!payloadParsed.success) {
    return resultErrorCreate(op, "Invalid account selection payload.", payload)
  }

  const url = new URL("/api/v2/session/continue", apiOrigin || window.location.origin)
  url.searchParams.set("flow", flowHandle)

  let response: Response
  try {
    response = await fetch(url.toString(), {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payloadParsed.output),
    })
  } catch (error) {
    return resultErrorCreate(op, "Sign-in is temporarily unavailable. Please try again.", error)
  }

  let input: unknown
  try {
    input = await response.json()
  } catch (error) {
    return resultErrorCreate(op, "The sign-in service returned an invalid response.", error)
  }

  if (!response.ok) {
    const parsedError = v.safeParse(errorSchema, input)
    const code = parsedError.success ? parsedError.output.errorMessage : "service_unavailable"
    return resultErrorCreate(op, flowV2ErrorMessageGet(code))
  }

  const parsed = v.safeParse(responseSchema, input)
  if (!parsed.success) {
    return resultErrorCreate(op, "The sign-in service returned an invalid response.", input)
  }

  return resultCreate(parsed.output.data)
}
