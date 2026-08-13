import * as v from "valibot"

import type { Result } from "../../result/Result"
import { resultCreate } from "../../result/resultCreate"
import { resultErrorCreate } from "../../result/resultErrorCreate"
import { flowV2ErrorMessageGet } from "../model/flowV2ErrorMessageGet"
import { type FlowV2Transition, flowV2TransitionSchema } from "../model/flowV2TransitionSchema"

const responseSchema = v.strictObject({
  success: v.literal(true),
  data: flowV2TransitionSchema,
})

const errorSchema = v.strictObject({
  success: v.literal(false),
  op: v.string(),
  errorMessage: v.string(),
})

export async function flowV2TransitionApiRequest(
  url: URL,
  init: RequestInit,
  op: string,
  fetchFn: typeof fetch = fetch,
): Promise<Result<FlowV2Transition>> {
  let response: Response
  try {
    response = await fetchFn(url, init)
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
