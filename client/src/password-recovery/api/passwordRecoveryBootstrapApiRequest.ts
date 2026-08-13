import * as v from "valibot"

import type { Result } from "../../result/Result"
import { resultCreate } from "../../result/resultCreate"
import { resultErrorCreate } from "../../result/resultErrorCreate"
import {
  type PasswordRecoveryBootstrapView,
  passwordRecoveryBootstrapViewSchema,
} from "../model/passwordRecoveryBootstrapViewSchema"
import { passwordRecoveryErrorMessageGet } from "../model/passwordRecoveryErrorMessageGet"

const responseSchema = v.strictObject({ success: v.literal(true), data: passwordRecoveryBootstrapViewSchema })
const errorSchema = v.strictObject({ success: v.literal(false), op: v.string(), errorMessage: v.string() })

export async function passwordRecoveryBootstrapApiRequest(
  apiOrigin: string,
  fetchFn: typeof fetch = fetch,
): Promise<Result<PasswordRecoveryBootstrapView>> {
  const op = "passwordRecoveryBootstrapApiRequest"
  const url = new URL("/api/v2/password/reset/bootstrap", apiOrigin || window.location.origin)
  let response: Response
  try {
    response = await fetchFn(url, {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
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
  return resultCreate(parsed.output.data)
}
