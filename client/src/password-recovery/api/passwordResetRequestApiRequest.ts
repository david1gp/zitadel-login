import * as v from "valibot"

import type { Result } from "../../result/Result"
import { resultCreate } from "../../result/resultCreate"
import { resultErrorCreate } from "../../result/resultErrorCreate"
import { passwordRecoveryErrorMessageGet } from "../model/passwordRecoveryErrorMessageGet"

const responseSchema = v.strictObject({
  success: v.literal(true),
  data: v.strictObject({ status: v.literal("accepted") }),
})
const errorSchema = v.strictObject({ success: v.literal(false), op: v.string(), errorMessage: v.string() })

export async function passwordResetRequestApiRequest(
  apiOrigin: string,
  input: { email: string; csrfToken: string },
): Promise<Result<undefined>> {
  const op = "passwordResetRequestApiRequest"
  const url = new URL("/api/v2/password/reset/request", apiOrigin || window.location.origin)
  let response: Response
  try {
    response = await fetch(url, {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: input.email, csrfToken: input.csrfToken }),
    })
  } catch (error) {
    return resultErrorCreate(op, passwordRecoveryErrorMessageGet("service_unavailable"), error)
  }

  let json: unknown
  try {
    json = await response.json()
  } catch (error) {
    return resultErrorCreate(op, passwordRecoveryErrorMessageGet("service_unavailable"), error)
  }

  if (!response.ok) {
    const parsedError = v.safeParse(errorSchema, json)
    const code = parsedError.success ? parsedError.output.errorMessage : "service_unavailable"
    return resultErrorCreate(op, passwordRecoveryErrorMessageGet(code))
  }

  const parsed = v.safeParse(responseSchema, json)
  if (!parsed.success) return resultErrorCreate(op, passwordRecoveryErrorMessageGet("service_unavailable"))
  return resultCreate(undefined)
}
