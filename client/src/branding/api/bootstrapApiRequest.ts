import * as v from "valibot"

import { resultCreate } from "../../result/resultCreate"
import { resultErrorCreate } from "../../result/resultErrorCreate"
import { bootstrapViewSchema } from "../model/bootstrapViewSchema"

const responseSchema = v.strictObject({ success: v.literal(true), data: bootstrapViewSchema })
const errorSchema = v.strictObject({
  success: v.literal(false),
  op: v.string(),
  errorMessage: v.string(),
})

export async function bootstrapApiRequest(apiOrigin: string, authRequest?: string) {
  const op = "bootstrapApiRequest"
  const url = new URL("/api/v2/bootstrap", apiOrigin || window.location.origin)
  if (authRequest) url.searchParams.set("authRequest", authRequest)
  let response: Response
  try {
    response = await fetch(url, { credentials: "include" })
  } catch (error) {
    return resultErrorCreate(op, "Sign-in settings are temporarily unavailable.", error)
  }
  let input: unknown
  try {
    input = await response.json()
  } catch (error) {
    return resultErrorCreate(op, "The sign-in service returned an invalid response.", error)
  }
  if (!response.ok) {
    const parsedError = v.safeParse(errorSchema, input)
    return resultErrorCreate(
      op,
      parsedError.success ? parsedError.output.errorMessage : "Sign-in settings are unavailable.",
    )
  }
  const parsed = v.safeParse(responseSchema, input)
  if (!parsed.success) return resultErrorCreate(op, "The sign-in service returned an invalid response.", input)
  return resultCreate(parsed.output.data)
}
